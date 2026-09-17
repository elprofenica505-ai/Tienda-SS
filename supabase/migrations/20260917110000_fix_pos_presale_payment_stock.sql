-- Corrective migration: POS payment methods and reserved presale stock.
alter table public.receivable_payments alter column receivable_id drop not null;
create or replace function public.create_sale(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_warehouse_id uuid,
  target_cash_session_id uuid,
  target_customer_id uuid,
  target_user_id uuid,
  target_payment_method text,
  target_discount numeric,
  target_idempotency_key text,
  target_metadata jsonb,
  target_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_sale public.sales%rowtype;
  new_sale_id uuid := gen_random_uuid();
  item jsonb;
  target_product_id uuid;
  product_row public.products%rowtype;
  stock_row public.inventory_stocks%rowtype;
  sale_quantity numeric;
  sale_unit_price numeric;
  sale_line_total numeric;
  sale_subtotal numeric := 0;
  sale_discount numeric := greatest(coalesce(target_discount, 0), 0);
  sale_tax numeric := greatest(coalesce((target_metadata->>'taxAmount')::numeric, 0), 0);
  sale_total numeric;
  paid_amount numeric;
  line_count integer := 0;
  sale_invoice text;
  current_receivable numeric;
  credit_limit numeric;
  opening_status text;
begin
  if target_payment_method not in ('cash', 'card', 'transfer', 'credit') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;

  if target_items is null
     or jsonb_typeof(target_items) <> 'array'
     or jsonb_array_length(target_items) < 1
     or jsonb_array_length(target_items) > 50 then
    raise exception 'INVALID_SALE_ITEMS';
  end if;

  if target_idempotency_key is not null and length(trim(target_idempotency_key)) > 0 then
    select existing.*
      into existing_sale
      from public.sales as existing
     where existing.tenant_id = target_tenant_id
       and existing.metadata->>'idempotencyKey' = left(trim(target_idempotency_key), 160)
     limit 1;
    if found then
      return jsonb_build_object(
        'saleId', existing_sale.id,
        'total', existing_sale.total,
        'invoiceNumber', existing_sale.invoice_number,
        'replayed', true
      );
    end if;
  end if;

  if not exists (
    select 1
      from public.branches as branch
     where branch.id = target_branch_id
       and branch.tenant_id = target_tenant_id
       and branch.active
  ) then
    raise exception 'BRANCH_NOT_FOUND';
  end if;

  if not exists (
    select 1
      from public.warehouses as warehouse
     where warehouse.id = target_warehouse_id
       and warehouse.tenant_id = target_tenant_id
       and warehouse.active
       and warehouse.branch_id = target_branch_id
  ) then
    raise exception 'WAREHOUSE_NOT_FOUND';
  end if;

  if target_payment_method = 'credit'
     and (
       target_customer_id is null
       or not exists (
         select 1
           from public.customers as customer
          where customer.id = target_customer_id
            and customer.tenant_id = target_tenant_id
            and customer.active
       )
     ) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;

  if target_payment_method = 'cash' then
    if target_cash_session_id is null then
      raise exception 'CASH_SESSION_REQUIRED';
    end if;

    select cash_session.status
      into opening_status
      from public.cash_sessions as cash_session
     where cash_session.id = target_cash_session_id
       and cash_session.tenant_id = target_tenant_id
       and cash_session.branch_id = target_branch_id
     for update;

    if opening_status <> 'open' then
      raise exception 'CASH_SESSION_NOT_OPEN';
    end if;
  end if;

  insert into public.sales (
    id, tenant_id, branch_id, customer_id, status,
    subtotal, discount, total, sold_by, metadata
  ) values (
    new_sale_id,
    target_tenant_id,
    target_branch_id,
    target_customer_id,
    'completed',
    0,
    sale_discount,
    0,
    target_user_id,
    coalesce(target_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'paymentMethod', target_payment_method,
        'idempotencyKey', nullif(left(trim(target_idempotency_key), 160), '')
      )
  );

  for item in select value from jsonb_array_elements(target_items) as elements(value) loop
    begin
      target_product_id := (item->>'productId')::uuid;
    exception when invalid_text_representation then
      raise exception 'PRODUCT_NOT_FOUND';
    end;

    select product.*
      into product_row
      from public.products as product
     where product.id = target_product_id
       and product.tenant_id = target_tenant_id
       and product.active
     for update;

    if not found then
      raise exception 'PRODUCT_NOT_FOUND';
    end if;

    sale_quantity := nullif(item->>'quantity', '')::numeric;
    if sale_quantity is null
       or sale_quantity <= 0
       or sale_quantity <> trunc(sale_quantity) then
      raise exception 'INVALID_SALE_QUANTITY';
    end if;

    sale_unit_price := greatest(
      coalesce(nullif(item->>'unitPrice', '')::numeric, product_row.price),
      0
    );
    sale_line_total := sale_unit_price * sale_quantity;
    sale_subtotal := sale_subtotal + sale_line_total;
    line_count := line_count + 1;

    if product_row.item_type <> 'service' and nullif(target_metadata->>'presaleId', '') is null then
      select inventory_stock.*
        into stock_row
        from public.inventory_stocks as inventory_stock
       where inventory_stock.tenant_id = target_tenant_id
         and inventory_stock.product_id = target_product_id
         and inventory_stock.warehouse_id = target_warehouse_id
       for update;

      if not found or stock_row.quantity < sale_quantity then
        raise exception 'INSUFFICIENT_STOCK';
      end if;

      update public.inventory_stocks as stock
         set quantity = stock.quantity - sale_quantity,
             updated_at = now()
       where stock.id = stock_row.id;

      insert into public.inventory_movements (
        tenant_id, product_id, warehouse_id, movement_type, quantity,
        unit_cost, reference_type, reference_id, performed_by, metadata
      ) values (
        target_tenant_id,
        target_product_id,
        target_warehouse_id,
        'sale',
        -sale_quantity,
        product_row.cost,
        'sale',
        new_sale_id,
        target_user_id,
        jsonb_build_object(
          'previous_quantity', stock_row.quantity,
          'new_quantity', stock_row.quantity - sale_quantity
        )
      );
    end if;

    insert into public.sale_items (
      tenant_id, sale_id, product_id, warehouse_id,
      quantity, unit_price, line_total
    ) values (
      target_tenant_id,
      new_sale_id,
      target_product_id,
      target_warehouse_id,
      sale_quantity,
      sale_unit_price,
      sale_line_total
    );
  end loop;

  sale_total := greatest(sale_subtotal - sale_discount + sale_tax, 0);
  if sale_total <= 0 then
    raise exception 'INVALID_SALE_TOTAL';
  end if;

  paid_amount := case when target_payment_method = 'credit' then 0 else sale_total end;
  sale_invoice := 'V-' || upper(substr(replace(new_sale_id::text, '-', ''), 1, 10));

  update public.sales as sale
     set invoice_number = sale_invoice,
         subtotal = sale_subtotal,
         tax = sale_tax,
         total = sale_total,
         updated_at = now(),
         metadata = sale.metadata || jsonb_build_object(
           'lineCount', line_count,
           'paidAmount', paid_amount
         )
   where sale.id = new_sale_id
     and sale.tenant_id = target_tenant_id;

  insert into public.sale_payments (
    tenant_id, sale_id, payment_method, amount, reference
  ) values (
    target_tenant_id,
    new_sale_id,
    target_payment_method,
    sale_total,
    nullif(target_metadata->>'paymentReference', '')
  );

  if target_payment_method = 'cash' then
    insert into public.cash_movements (
      tenant_id, cash_session_id, movement_type, amount,
      reference_type, reference_id, performed_by, metadata
    ) values (
      target_tenant_id,
      target_cash_session_id,
      'sale',
      sale_total,
      'sale',
      new_sale_id,
      target_user_id,
      jsonb_build_object('paymentMethod', target_payment_method)
    );
  elsif target_payment_method = 'credit' then
    select coalesce(sum(receivable.outstanding_amount), 0),
           coalesce(max(customer.credit_limit), 0)
      into current_receivable, credit_limit
      from public.receivables as receivable
      join public.customers as customer
        on customer.id = receivable.customer_id
       and customer.tenant_id = receivable.tenant_id
     where receivable.tenant_id = target_tenant_id
       and receivable.customer_id = target_customer_id
       and receivable.status in ('open', 'partial');

    if credit_limit > 0 and current_receivable + sale_total > credit_limit then
      raise exception 'CREDIT_LIMIT_EXCEEDED';
    end if;

    insert into public.receivables (
      tenant_id, customer_id, sale_id, original_amount,
      outstanding_amount, status, due_date
    ) values (
      target_tenant_id,
      target_customer_id,
      new_sale_id,
      sale_total,
      sale_total,
      'open',
      current_date + 30
    );
  end if;

  return jsonb_build_object(
    'saleId', new_sale_id,
    'total', sale_total,
    'subtotal', sale_subtotal,
    'discount', sale_discount,
    'invoiceNumber', sale_invoice,
    'paymentMethod', target_payment_method,
    'lineCount', line_count,
    'replayed', false
  );
end;
$$;

revoke all on function public.create_sale(uuid, uuid, uuid, uuid, uuid, uuid, text, numeric, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_sale(uuid, uuid, uuid, uuid, uuid, uuid, text, numeric, text, jsonb, jsonb) to service_role;
create or replace function public.create_sale_with_payments(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_warehouse_id uuid,
  target_cash_session_id uuid,
  target_customer_id uuid,
  target_user_id uuid,
  target_discount numeric,
  target_idempotency_key text,
  target_metadata jsonb,
  target_items jsonb,
  target_payments jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  sale_result jsonb;
  sale_id uuid;
  sale_total numeric;
  cash_amount numeric := 0;
  card_amount numeric := 0;
  transfer_amount numeric := 0;
  credit_amount numeric := 0;
  payment jsonb;
  payment_method text;
  payment_amount numeric;
  customer_row public.customers%rowtype;
  current_receivable numeric;
  receivable_id uuid;
  paid_amount numeric;
  method_label text;
begin
  if target_payments is null or jsonb_typeof(target_payments) <> 'array' or jsonb_array_length(target_payments) < 1 then
    raise exception 'INVALID_PAYMENT_SPLIT';
  end if;

  for payment in select value from jsonb_array_elements(target_payments) loop
    payment_method := payment->>'method';
    payment_amount := round((payment->>'amount')::numeric, 2);
    if payment_method not in ('cash','card','transfer','credit') or payment_amount <= 0 then
      raise exception 'INVALID_PAYMENT_SPLIT';
    end if;
    if payment_method = 'cash' then cash_amount := cash_amount + payment_amount;
    elsif payment_method = 'card' then card_amount := card_amount + payment_amount;
    elsif payment_method = 'transfer' then transfer_amount := transfer_amount + payment_amount;
    else credit_amount := credit_amount + payment_amount;
    end if;
  end loop;

  if credit_amount > 0 then
    if target_customer_id is null then raise exception 'CUSTOMER_NOT_FOUND'; end if;
    select * into customer_row from public.customers
      where id = target_customer_id and tenant_id = target_tenant_id and active for update;
    if not found or not coalesce(customer_row.credit_enabled, false)
       or customer_row.credit_status <> 'activo' or customer_row.sales_blocked then
      raise exception 'CUSTOMER_CREDIT_BLOCKED';
    end if;
    select coalesce(sum(outstanding_amount), 0) into current_receivable
      from public.receivables
      where tenant_id = target_tenant_id and customer_id = target_customer_id and status in ('open','partial');
    if customer_row.credit_limit <= 0 or current_receivable + credit_amount > customer_row.credit_limit then
      raise exception 'CREDIT_LIMIT_EXCEEDED';
    end if;
  end if;

  sale_result := public.create_sale(
    target_tenant_id, target_branch_id, target_warehouse_id, target_cash_session_id,
    target_customer_id, target_user_id,
    case when cash_amount > 0 then 'cash' when card_amount > 0 then 'card' else 'transfer' end,
    target_discount, target_idempotency_key,
    coalesce(target_metadata, '{}'::jsonb) || jsonb_build_object('paymentSplit', target_payments),
    target_items
  );
  if coalesce((sale_result->>'replayed')::boolean, false) then return sale_result; end if;

  sale_id := (sale_result->>'saleId')::uuid;
  sale_total := (sale_result->>'total')::numeric;
  paid_amount := cash_amount + card_amount + transfer_amount;
  if abs(paid_amount + credit_amount - sale_total) > 0.01 then raise exception 'PAYMENT_TOTAL_MISMATCH'; end if;

  delete from public.sale_payments as existing_payment where existing_payment.tenant_id = target_tenant_id and existing_payment.sale_id = sale_id;
  delete from public.cash_movements as existing_movement where existing_movement.tenant_id = target_tenant_id and existing_movement.cash_session_id = target_cash_session_id and existing_movement.reference_type = 'sale' and existing_movement.reference_id = sale_id;

  if cash_amount > 0 then
    insert into public.sale_payments(tenant_id, sale_id, payment_method, amount, reference)
      values(target_tenant_id, sale_id, 'cash', cash_amount, null);
    insert into public.cash_movements(tenant_id, cash_session_id, movement_type, amount, reference_type, reference_id, performed_by, metadata)
      values(target_tenant_id, target_cash_session_id, 'sale', cash_amount, 'sale', sale_id, target_user_id,
             jsonb_build_object('paymentMethod', 'cash', 'paymentSplit', target_payments));
  end if;
  if card_amount > 0 then
    insert into public.sale_payments(tenant_id, sale_id, payment_method, amount, reference)
      values(target_tenant_id, sale_id, 'card', card_amount, null);
  end if;
  if transfer_amount > 0 then
    insert into public.sale_payments(tenant_id, sale_id, payment_method, amount, reference)
      values(target_tenant_id, sale_id, 'transfer', transfer_amount, null);
  end if;
  if credit_amount > 0 then
    insert into public.sale_payments(tenant_id, sale_id, payment_method, amount, reference)
      values(target_tenant_id, sale_id, 'credit', credit_amount, null);
    insert into public.receivables(tenant_id, customer_id, sale_id, original_amount, outstanding_amount, status, due_date)
      values(target_tenant_id, target_customer_id, sale_id, credit_amount, credit_amount, 'open', current_date)
      returning id into receivable_id;
  end if;

  method_label := case
    when credit_amount > 0 and paid_amount > 0 then 'mixed'
    when credit_amount > 0 then 'credit'
    when card_amount > 0 and cash_amount = 0 and transfer_amount = 0 then 'card'
    when transfer_amount > 0 and cash_amount = 0 and card_amount = 0 then 'transfer'
    else 'cash'
  end;
  update public.sales set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'paymentMethod', method_label, 'cashAmount', cash_amount, 'cardAmount', card_amount,
    'transferAmount', transfer_amount, 'creditAmount', credit_amount, 'paidAmount', paid_amount
  ) where id = sale_id and tenant_id = target_tenant_id;

  return sale_result || jsonb_build_object(
    'paymentMethod', method_label, 'cashAmount', cash_amount, 'cardAmount', card_amount,
    'transferAmount', transfer_amount, 'creditAmount', credit_amount,
    'paidAmount', paid_amount, 'receivableId', receivable_id
  );
end; $$;
revoke all on function public.create_sale_with_payments(uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.create_sale_with_payments(uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,jsonb,jsonb,jsonb) to service_role;
