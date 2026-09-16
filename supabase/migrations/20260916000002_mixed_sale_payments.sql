-- Etapa 2: mixed payments. Reuses create_sale for stock/idempotency, then adjusts
-- the payment split inside the same transaction.
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
  credit_amount numeric := 0;
  payment jsonb;
  payment_method text;
  payment_amount numeric;
  customer_row public.customers%rowtype;
  current_receivable numeric;
  cash_payment_id uuid;
  credit_payment_id uuid;
  receivable_id uuid;
begin
  if target_payments is null or jsonb_typeof(target_payments) <> 'array' or jsonb_array_length(target_payments) < 1 then raise exception 'INVALID_PAYMENT_SPLIT'; end if;
  for payment in select * from jsonb_array_elements(target_payments) loop
    payment_method := payment->>'method';
    payment_amount := round((payment->>'amount')::numeric, 2);
    if payment_method not in ('cash','card','transfer','credit') or payment_amount <= 0 then raise exception 'INVALID_PAYMENT_SPLIT'; end if;
    if payment_method = 'credit' then credit_amount := credit_amount + payment_amount; else cash_amount := cash_amount + payment_amount; end if;
  end loop;
  if credit_amount > 0 then
    if target_customer_id is null then raise exception 'CUSTOMER_NOT_FOUND'; end if;
    select * into customer_row from public.customers where id = target_customer_id and tenant_id = target_tenant_id and active for update;
    if not found or not coalesce(customer_row.credit_enabled, false) or customer_row.credit_status <> 'activo' or customer_row.sales_blocked then raise exception 'CUSTOMER_CREDIT_BLOCKED'; end if;
    select coalesce(sum(outstanding_amount), 0) into current_receivable from public.receivables where tenant_id = target_tenant_id and customer_id = target_customer_id and status in ('open','partial');
    if customer_row.credit_limit <= 0 or current_receivable + credit_amount > customer_row.credit_limit then raise exception 'CREDIT_LIMIT_EXCEEDED'; end if;
  end if;
  sale_result := public.create_sale(target_tenant_id, target_branch_id, target_warehouse_id, target_cash_session_id, target_customer_id, target_user_id, case when cash_amount > 0 then 'cash' else 'credit' end, target_discount, target_idempotency_key, coalesce(target_metadata, '{}'::jsonb) || jsonb_build_object('paymentSplit', target_payments), target_items);
  if coalesce((sale_result->>'replayed')::boolean, false) then return sale_result; end if;
  sale_id := (sale_result->>'saleId')::uuid;
  sale_total := (sale_result->>'total')::numeric;
  if abs(cash_amount + credit_amount - sale_total) > 0.01 then raise exception 'PAYMENT_TOTAL_MISMATCH'; end if;
  delete from public.sale_payments sp where sp.tenant_id = target_tenant_id and sp.sale_id = sale_id;
  if cash_amount > 0 then
    insert into public.sale_payments(tenant_id, sale_id, payment_method, amount, reference) values(target_tenant_id, sale_id, 'cash', cash_amount, null) returning id into cash_payment_id;
    update public.cash_movements set amount = cash_amount, metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('paymentSplit', target_payments) where tenant_id = target_tenant_id and cash_session_id = target_cash_session_id and reference_type = 'sale' and reference_id = sale_id;
  end if;
  if credit_amount > 0 then
    insert into public.sale_payments(tenant_id, sale_id, payment_method, amount, reference) values(target_tenant_id, sale_id, 'credit', credit_amount, null) returning id into credit_payment_id;
    insert into public.receivables(tenant_id, customer_id, sale_id, original_amount, outstanding_amount, status, due_date) values(target_tenant_id, target_customer_id, sale_id, credit_amount, credit_amount, 'open', current_date) returning id into receivable_id;
  end if;
  update public.sales set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('paymentMethod', case when credit_amount > 0 and cash_amount > 0 then 'mixed' when credit_amount > 0 then 'credit' else 'cash' end, 'cashAmount', cash_amount, 'creditAmount', credit_amount, 'paidAmount', cash_amount) where id = sale_id and tenant_id = target_tenant_id;
  return sale_result || jsonb_build_object('paymentMethod', case when credit_amount > 0 and cash_amount > 0 then 'mixed' when credit_amount > 0 then 'credit' else 'cash' end, 'cashAmount', cash_amount, 'creditAmount', credit_amount, 'receivableId', receivable_id);
end; $$;
revoke all on function public.create_sale_with_payments(uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.create_sale_with_payments(uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,jsonb,jsonb,jsonb) to service_role;
