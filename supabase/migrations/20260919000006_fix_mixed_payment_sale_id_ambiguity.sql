-- Avoid PL/pgSQL variable/column ambiguity in mixed-payment checkout.
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
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  sale_result jsonb;
  sale_id_value uuid;
  sale_total numeric;
  cash_amount numeric := 0;
  card_amount numeric := 0;
  transfer_amount numeric := 0;
  credit_amount numeric := 0;
  payment jsonb;
  payment_method_value text;
  payment_amount_value numeric;
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
    payment_method_value := payment->>'method';
    payment_amount_value := round((payment->>'amount')::numeric, 2);
    if payment_method_value not in ('cash','card','transfer','credit') or payment_amount_value <= 0 then
      raise exception 'INVALID_PAYMENT_SPLIT';
    end if;
    if payment_method_value = 'cash' then cash_amount := cash_amount + payment_amount_value;
    elsif payment_method_value = 'card' then card_amount := card_amount + payment_amount_value;
    elsif payment_method_value = 'transfer' then transfer_amount := transfer_amount + payment_amount_value;
    else credit_amount := credit_amount + payment_amount_value;
    end if;
  end loop;

  if credit_amount > 0 then
    if target_customer_id is null then raise exception 'CUSTOMER_NOT_FOUND'; end if;
    select c.* into customer_row
      from public.customers as c
     where c.id = target_customer_id
       and c.tenant_id = target_tenant_id
       and c.active
     for update;
    if not found or not coalesce(customer_row.credit_enabled, false)
       or customer_row.credit_status <> 'activo' or customer_row.sales_blocked then
      raise exception 'CUSTOMER_CREDIT_BLOCKED';
    end if;
    select coalesce(sum(r.outstanding_amount), 0) into current_receivable
      from public.receivables as r
     where r.tenant_id = target_tenant_id
       and r.customer_id = target_customer_id
       and r.status in ('open','partial');
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

  sale_id_value := (sale_result->>'saleId')::uuid;
  sale_total := (sale_result->>'total')::numeric;
  paid_amount := cash_amount + card_amount + transfer_amount;
  if abs(paid_amount + credit_amount - sale_total) > 0.01 then raise exception 'PAYMENT_TOTAL_MISMATCH'; end if;

  delete from public.sale_payments as existing_payment
   where existing_payment.tenant_id = target_tenant_id
     and existing_payment.sale_id = sale_id_value;
  delete from public.cash_movements as existing_movement
   where existing_movement.tenant_id = target_tenant_id
     and existing_movement.cash_session_id = target_cash_session_id
     and existing_movement.reference_type = 'sale'
     and existing_movement.reference_id = sale_id_value;

  if cash_amount > 0 then
    insert into public.sale_payments(tenant_id, sale_id, payment_method, amount, reference)
      values(target_tenant_id, sale_id_value, 'cash', cash_amount, null);
    insert into public.cash_movements(tenant_id, cash_session_id, movement_type, amount, reference_type, reference_id, performed_by, metadata)
      values(target_tenant_id, target_cash_session_id, 'sale', cash_amount, 'sale', sale_id_value, target_user_id,
             jsonb_build_object('paymentMethod', 'cash', 'paymentSplit', target_payments));
  end if;
  if card_amount > 0 then
    insert into public.sale_payments(tenant_id, sale_id, payment_method, amount, reference)
      values(target_tenant_id, sale_id_value, 'card', card_amount, null);
  end if;
  if transfer_amount > 0 then
    insert into public.sale_payments(tenant_id, sale_id, payment_method, amount, reference)
      values(target_tenant_id, sale_id_value, 'transfer', transfer_amount, null);
  end if;
  if credit_amount > 0 then
    insert into public.sale_payments(tenant_id, sale_id, payment_method, amount, reference)
      values(target_tenant_id, sale_id_value, 'credit', credit_amount, null);
    insert into public.receivables(tenant_id, customer_id, sale_id, original_amount, outstanding_amount, status, due_date)
      values(target_tenant_id, target_customer_id, sale_id_value, credit_amount, credit_amount, 'open', current_date)
      returning id into receivable_id;
  end if;

  method_label := case
    when credit_amount > 0 and paid_amount > 0 then 'mixed'
    when credit_amount > 0 then 'credit'
    when card_amount > 0 and cash_amount = 0 and transfer_amount = 0 then 'card'
    when transfer_amount > 0 and cash_amount = 0 and card_amount = 0 then 'transfer'
    else 'cash'
  end;
  update public.sales as s
     set metadata = coalesce(s.metadata, '{}'::jsonb) || jsonb_build_object(
       'paymentMethod', method_label, 'cashAmount', cash_amount, 'cardAmount', card_amount,
       'transferAmount', transfer_amount, 'creditAmount', credit_amount, 'paidAmount', paid_amount
     )
   where s.id = sale_id_value
     and s.tenant_id = target_tenant_id;

  return sale_result || jsonb_build_object(
    'paymentMethod', method_label, 'cashAmount', cash_amount, 'cardAmount', card_amount,
    'transferAmount', transfer_amount, 'creditAmount', credit_amount,
    'paidAmount', paid_amount, 'receivableId', receivable_id
  );
end;
$function$;

revoke all on function public.create_sale_with_payments(uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.create_sale_with_payments(uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,jsonb,jsonb,jsonb) to service_role;
