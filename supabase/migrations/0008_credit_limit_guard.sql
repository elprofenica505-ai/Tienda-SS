-- Enforce customer credit limits inside the database transaction.
create or replace function public.enforce_receivable_credit_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  limit_amount numeric;
  current_amount numeric;
begin
  select coalesce(credit_limit,0) into limit_amount from public.customers where id=new.customer_id and tenant_id=new.tenant_id for update;
  select coalesce(sum(outstanding_amount),0) into current_amount from public.receivables where tenant_id=new.tenant_id and customer_id=new.customer_id and status in ('open','partial');
  if limit_amount > 0 and current_amount + new.outstanding_amount > limit_amount then raise exception 'CREDIT_LIMIT_EXCEEDED'; end if;
  return new;
end;
$$;

drop trigger if exists receivables_credit_limit_trigger on public.receivables;
create trigger receivables_credit_limit_trigger before insert on public.receivables for each row execute function public.enforce_receivable_credit_limit();
revoke all on function public.enforce_receivable_credit_limit() from public, anon, authenticated;
