-- Atomic receivable payment transaction for Supabase-only ERP.
create or replace function public.record_receivable_payment(
  target_tenant_id uuid,
  target_sale_id uuid,
  target_user_id uuid,
  target_payment_method text,
  target_amount numeric,
  target_notes text,
  target_cash_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  receivable_row public.receivables%rowtype;
  new_payment_id uuid := gen_random_uuid();
  new_balance numeric;
  new_status text;
begin
  if target_payment_method not in ('cash','card','transfer') or target_amount <= 0 then raise exception 'INVALID_RECEIVABLE_PAYMENT'; end if;
  select * into receivable_row from public.receivables where tenant_id=target_tenant_id and sale_id=target_sale_id and status in ('open','partial') for update;
  if not found then raise exception 'RECEIVABLE_NOT_FOUND'; end if;
  if target_amount > receivable_row.outstanding_amount then raise exception 'PAYMENT_EXCEEDS_BALANCE'; end if;
  if target_cash_session_id is not null then
    if not exists(select 1 from public.cash_sessions where id=target_cash_session_id and tenant_id=target_tenant_id and status='open') then raise exception 'CASH_SESSION_NOT_OPEN'; end if;
  end if;
  new_balance := receivable_row.outstanding_amount-target_amount;
  new_status := case when new_balance <= 0 then 'paid' else 'partial' end;
  update public.receivables set outstanding_amount=new_balance,status=new_status,updated_at=now() where id=receivable_row.id and tenant_id=target_tenant_id;
  insert into public.receivable_payments(id,tenant_id,receivable_id,amount,payment_method,received_by,created_at) values(new_payment_id,target_tenant_id,receivable_row.id,target_amount,target_payment_method,target_user_id,now());
  if target_cash_session_id is not null then insert into public.cash_movements(tenant_id,cash_session_id,movement_type,amount,reference_type,reference_id,performed_by,metadata) values(target_tenant_id,target_cash_session_id,'payment',target_amount,'receivable_payment',new_payment_id,target_user_id,jsonb_build_object('paymentMethod',target_payment_method,'notes',target_notes,'saleId',target_sale_id)); end if;
  return jsonb_build_object('saleId',target_sale_id,'paymentId',new_payment_id,'paidAmount',target_amount,'balanceDue',new_balance,'paymentStatus',new_status);
end;
$$;
revoke all on function public.record_receivable_payment(uuid,uuid,uuid,text,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.record_receivable_payment(uuid,uuid,uuid,text,numeric,text,uuid) to service_role;
