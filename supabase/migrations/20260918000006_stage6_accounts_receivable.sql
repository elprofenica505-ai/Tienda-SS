-- Stage 6: accounts receivable, credit limits, atomic payments, and idempotency.
-- Local development only. Do not apply remotely until PostgreSQL validation is authorized.
begin;

alter table public.receivable_payments
  add column if not exists idempotency_key text;

create unique index if not exists receivable_payments_tenant_idempotency_idx
  on public.receivable_payments (tenant_id, idempotency_key)
  where idempotency_key is not null and length(trim(idempotency_key)) > 0;

create index if not exists receivables_customer_balance_idx
  on public.receivables (tenant_id, customer_id, status, outstanding_amount)
  where outstanding_amount > 0;

-- Lock the customer and all open receivables before approving new credit. This
-- serializes concurrent credit sales for the same customer.
create or replace function public.assert_customer_credit_limit(
  target_tenant_id uuid,
  target_customer_id uuid,
  target_new_amount numeric
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare customer_row public.customers%rowtype; current_balance numeric;
begin
  if target_customer_id is null or target_new_amount < 0 then raise exception 'CUSTOMER_CREDIT_REQUIRED'; end if;
  select * into customer_row from public.customers where id = target_customer_id and tenant_id = target_tenant_id and active for update;
  if not found or not coalesce(customer_row.credit_enabled, false) or customer_row.credit_status <> 'activo' or customer_row.sales_blocked then raise exception 'CUSTOMER_CREDIT_BLOCKED'; end if;
  perform 1 from public.receivables where tenant_id = target_tenant_id and customer_id = target_customer_id and status in ('open','partial') and outstanding_amount > 0 for update;
  select coalesce(sum(outstanding_amount), 0) into current_balance from public.receivables where tenant_id = target_tenant_id and customer_id = target_customer_id and status in ('open','partial') and outstanding_amount > 0;
  if coalesce(customer_row.credit_limit, 0) <= 0 or current_balance + target_new_amount > customer_row.credit_limit then raise exception 'CREDIT_LIMIT_EXCEEDED'; end if;
end;
$$;

-- Idempotent wrapper for sale-level payments. The delegated RPC performs the
-- balance update, allocation and cash movement in one transaction.
create or replace function public.record_receivable_payment_idempotent(
  target_tenant_id uuid, target_sale_id uuid, target_user_id uuid,
  target_payment_method text, target_amount numeric, target_notes text,
  target_cash_session_id uuid, target_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare existing public.receivable_payments%rowtype; result jsonb; key_value text;
begin
  key_value := nullif(left(trim(target_idempotency_key), 160), '');
  if key_value is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_tenant_id::text || ':ar:' || key_value, 0));
  select * into existing from public.receivable_payments where tenant_id = target_tenant_id and idempotency_key = key_value limit 1;
  if found then return jsonb_build_object('paymentId', existing.id, 'amount', existing.amount, 'paymentMethod', existing.payment_method, 'replayed', true); end if;
  result := public.record_receivable_payment(target_tenant_id, target_sale_id, target_user_id, target_payment_method, target_amount, target_notes, target_cash_session_id);
  update public.receivable_payments set idempotency_key = key_value where id = (result->>'paymentId')::uuid and tenant_id = target_tenant_id;
  return result || jsonb_build_object('replayed', false);
end;
$$;

-- Idempotent wrapper for customer-level allocations. Allocation and receivable
-- status transitions are delegated to the existing atomic RPC.
create or replace function public.register_receivable_payment_idempotent(
  target_tenant_id uuid, target_customer_id uuid, target_amount numeric,
  target_payment_method text, target_allocations jsonb, target_cash_session_id uuid,
  target_user_id uuid, target_note text, target_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare existing public.receivable_payments%rowtype; result jsonb; key_value text;
begin
  key_value := nullif(left(trim(target_idempotency_key), 160), '');
  if key_value is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_tenant_id::text || ':ar:' || key_value, 0));
  select * into existing from public.receivable_payments where tenant_id = target_tenant_id and idempotency_key = key_value limit 1;
  if found then return jsonb_build_object('paymentId', existing.id, 'amount', existing.amount, 'paymentMethod', existing.payment_method, 'replayed', true); end if;
  result := public.register_receivable_payment(target_tenant_id, target_customer_id, target_amount, target_payment_method, coalesce(target_allocations, '[]'::jsonb), target_cash_session_id, target_user_id, target_note);
  update public.receivable_payments set idempotency_key = key_value where id = (result->>'paymentId')::uuid and tenant_id = target_tenant_id;
  return result || jsonb_build_object('replayed', false);
end;
$$;

-- Ensure the current credit-sale RPCs expose the explicit server-side guard as a
-- callable contract. Their existing bodies also perform the final check while
-- holding the relevant customer/receivable rows in the same transaction.
comment on function public.assert_customer_credit_limit(uuid, uuid, numeric) is 'Server-side serialized credit limit guard for credit sales';

revoke all on function public.assert_customer_credit_limit(uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function public.record_receivable_payment_idempotent(uuid, uuid, uuid, text, numeric, text, uuid, text) from public, anon, authenticated;
revoke all on function public.register_receivable_payment_idempotent(uuid, uuid, numeric, text, jsonb, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.assert_customer_credit_limit(uuid, uuid, numeric) to service_role;
grant execute on function public.record_receivable_payment_idempotent(uuid, uuid, uuid, text, numeric, text, uuid, text) to service_role;
grant execute on function public.register_receivable_payment_idempotent(uuid, uuid, numeric, text, jsonb, uuid, uuid, text, text) to service_role;

commit;
