-- Atomic sale transaction for Supabase-only ERP.
create unique index if not exists sales_tenant_idempotency_idx on public.sales (tenant_id, ((metadata->>'idempotencyKey'))) where metadata->>'idempotencyKey' is not null;

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
  product_id uuid;
  product_row public.products%rowtype;
  stock_row public.inventory_stocks%rowtype;
  sale_quantity numeric;
  unit_price numeric;
  line_total numeric;
  subtotal numeric := 0;
  discount numeric := greatest(coalesce(target_discount,0),0);
  tax numeric := greatest(coalesce((target_metadata->>'taxAmount')::numeric,0),0);
  total numeric;
  paid_amount numeric;
  line_count integer := 0;
  sale_invoice text;
  customer_name text;
  current_receivable numeric;
  credit_limit numeric;
  opening_status text;
begin
  if target_payment_method not in ('cash','card','transfer','credit') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if target_items is null or jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) < 1 or jsonb_array_length(target_items) > 50 then raise exception 'INVALID_SALE_ITEMS'; end if;
  if target_idempotency_key is not null and length(trim(target_idempotency_key)) > 0 then select * into existing_sale from public.sales where tenant_id=target_tenant_id and metadata->>'idempotencyKey'=left(trim(target_idempotency_key),160) limit 1; if found then return jsonb_build_object('saleId',existing_sale.id,'total',existing_sale.total,'invoiceNumber',existing_sale.invoice_number,'replayed',true); end if; end if;
  if not exists(select 1 from public.branches where id=target_branch_id and tenant_id=target_tenant_id and active) then raise exception 'BRANCH_NOT_FOUND'; end if;
  if not exists(select 1 from public.warehouses where id=target_warehouse_id and tenant_id=target_tenant_id and active and branch_id=target_branch_id) then raise exception 'WAREHOUSE_NOT_FOUND'; end if;
  if target_payment_method='credit' then
    if target_customer_id is null or not exists(select 1 from public.customers where id=target_customer_id and tenant_id=target_tenant_id and active) then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  end if;
  if target_payment_method <> 'credit' then
    if target_cash_session_id is null then raise exception 'CASH_SESSION_REQUIRED'; end if;
    select status into opening_status from public.cash_sessions where id=target_cash_session_id and tenant_id=target_tenant_id and branch_id=target_branch_id for update;
    if opening_status <> 'open' then raise exception 'CASH_SESSION_NOT_OPEN'; end if;
  end if;
  insert into public.sales(id,tenant_id,branch_id,customer_id,status,subtotal,discount,total,sold_by,metadata) values(new_sale_id,target_tenant_id,target_branch_id,target_customer_id,'completed',0,discount,0,target_user_id,coalesce(target_metadata,'{}'::jsonb)||jsonb_build_object('paymentMethod',target_payment_method,'idempotencyKey',nullif(left(trim(target_idempotency_key),160),''))) returning id into new_sale_id;
  for item in select * from jsonb_array_elements(target_items) loop
    begin product_id := (item->>'productId')::uuid; exception when invalid_text_representation then raise exception 'PRODUCT_NOT_FOUND'; end;
    select * into product_row from public.products where id=product_id and tenant_id=target_tenant_id and active for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    sale_quantity := nullif(item->>'quantity','')::numeric;
    if sale_quantity is null or sale_quantity <= 0 or sale_quantity <> trunc(sale_quantity) then raise exception 'INVALID_SALE_QUANTITY'; end if;
    unit_price := greatest(coalesce(nullif(item->>'unitPrice','')::numeric,product_row.price),0);
    line_total := unit_price * sale_quantity;
    subtotal := subtotal + line_total;
    line_count := line_count + 1;
    if product_row.item_type <> 'service' then
      select inventory_stock.* into stock_row from public.inventory_stocks as inventory_stock where inventory_stock.tenant_id=target_tenant_id and inventory_stock.product_id=product_id and inventory_stock.warehouse_id=target_warehouse_id for update;
      if not found or stock_row.quantity < sale_quantity then raise exception 'INSUFFICIENT_STOCK'; end if;
      update public.inventory_stocks as stock set quantity=stock.quantity - sale_quantity,updated_at=now() where stock.id=stock_row.id;
      insert into public.inventory_movements(tenant_id,product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,performed_by,metadata) values(target_tenant_id,product_id,target_warehouse_id,'sale',-sale_quantity,product_row.cost,'sale',new_sale_id,target_user_id,jsonb_build_object('previous_quantity',stock_row.quantity,'new_quantity',stock_row.quantity-sale_quantity));
    end if;
    insert into public.sale_items(tenant_id,sale_id,product_id,warehouse_id,quantity,unit_price,line_total) values(target_tenant_id,new_sale_id,product_id,target_warehouse_id,sale_quantity,unit_price,line_total);
  end loop;
  total := greatest(subtotal-discount+tax,0);
  paid_amount := case when target_payment_method='credit' then 0 else total end;
  sale_invoice := 'V-'||upper(substr(replace(new_sale_id::text,'-',''),1,10));
  update public.sales set invoice_number=sale_invoice,subtotal=subtotal,tax=tax,total=total,updated_at=now(),metadata=metadata||jsonb_build_object('lineCount',line_count,'paidAmount',paid_amount) where id=new_sale_id and tenant_id=target_tenant_id;
  insert into public.sale_payments(tenant_id,sale_id,payment_method,amount,reference) values(target_tenant_id,new_sale_id,target_payment_method,total,nullif(target_metadata->>'paymentReference',''));
  if target_payment_method <> 'credit' then insert into public.cash_movements(tenant_id,cash_session_id,movement_type,amount,reference_type,reference_id,performed_by,metadata) values(target_tenant_id,target_cash_session_id,'sale',total,'sale',new_sale_id,target_user_id,jsonb_build_object('paymentMethod',target_payment_method));
  else select coalesce(sum(outstanding_amount),0),coalesce(max(credit_limit),0) into current_receivable,credit_limit from public.receivables r join public.customers c on c.id=r.customer_id and c.tenant_id=r.tenant_id where r.tenant_id=target_tenant_id and r.customer_id=target_customer_id and r.status in ('open','partial'); if credit_limit > 0 and current_receivable+total > credit_limit then raise exception 'CREDIT_LIMIT_EXCEEDED'; end if; insert into public.receivables(tenant_id,customer_id,sale_id,original_amount,outstanding_amount,status,due_date) values(target_tenant_id,target_customer_id,new_sale_id,total,total,'open',current_date+30); end if;
  return jsonb_build_object('saleId',new_sale_id,'total',total,'subtotal',subtotal,'discount',discount,'invoiceNumber',sale_invoice,'paymentMethod',target_payment_method,'lineCount',line_count,'replayed',false);
end;
$$;
revoke all on function public.create_sale(uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_sale(uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,text,jsonb,jsonb) to service_role;
