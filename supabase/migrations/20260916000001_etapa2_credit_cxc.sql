-- Etapa 2: professional credit and accounts receivable.
-- All monetary mutations remain inside SECURITY DEFINER transactions.

alter table public.customers
  add column if not exists credit_enabled boolean not null default false,
  add column if not exists term_days integer not null default 30 check (term_days >= 0),
  add column if not exists grace_days integer not null default 0 check (grace_days >= 0),
  add column if not exists credit_status text not null default 'activo' check (credit_status in ('activo','bloqueado','en_cobro','incobrable')),
  add column if not exists sales_blocked boolean not null default false,
  add column if not exists sales_blocked_reason text;

alter table public.receivable_payments
  add column if not exists customer_id uuid,
  add column if not exists receipt_number text,
  add column if not exists paid_at timestamptz not null default now(),
  add column if not exists reference text,
  add column if not exists cash_session_id uuid,
  add column if not exists user_id uuid,
  add column if not exists note text;

create table if not exists public.receivable_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  payment_id uuid not null,
  receivable_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, receivable_id),
  foreign key (payment_id, tenant_id) references public.receivable_payments(id, tenant_id) on delete restrict,
  foreign key (receivable_id, tenant_id) references public.receivables(id, tenant_id) on delete restrict
);

create index if not exists receivables_customer_due_idx on public.receivables (tenant_id, customer_id, due_date, created_at);
create index if not exists receivable_payments_customer_idx on public.receivable_payments (tenant_id, customer_id, paid_at desc);

alter table public.receivable_payment_allocations enable row level security;
revoke all on table public.receivable_payment_allocations from anon, authenticated;
grant select on table public.receivable_payment_allocations to authenticated;
drop policy if exists receivable_payment_allocations_member on public.receivable_payment_allocations;
create policy receivable_payment_allocations_member on public.receivable_payment_allocations
  for select to authenticated using (public.has_tenant_access(tenant_id));

create or replace function public.enforce_receivable_credit_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  customer_row public.customers%rowtype;
  current_amount numeric;
begin
  select * into customer_row from public.customers
    where id = new.customer_id and tenant_id = new.tenant_id for update;
  if not found or not customer_row.active then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  if not coalesce(customer_row.credit_enabled, false) or customer_row.credit_status <> 'activo' or customer_row.sales_blocked then
    raise exception 'CUSTOMER_CREDIT_BLOCKED';
  end if;
  select coalesce(sum(outstanding_amount), 0) into current_amount
    from public.receivables
    where tenant_id = new.tenant_id and customer_id = new.customer_id and status in ('open','partial');
  if customer_row.credit_limit <= 0 or current_amount + new.outstanding_amount > customer_row.credit_limit then
    raise exception 'CREDIT_LIMIT_EXCEEDED';
  end if;
  new.due_date := current_date + coalesce(customer_row.term_days, 30) + coalesce(customer_row.grace_days, 0);
  return new;
end; $$;

drop trigger if exists receivables_credit_limit_trigger on public.receivables;
create trigger receivables_credit_limit_trigger before insert on public.receivables
  for each row execute function public.enforce_receivable_credit_limit();
revoke all on function public.enforce_receivable_credit_limit() from public, anon, authenticated;

a-- FIFO by due date when allocations are omitted; explicit allocations are validated and locked.
create or replace function public.register_receivable_payment(
  target_tenant_id uuid,
  target_customer_id uuid,
  target_amount numeric,
  target_payment_method text,
  target_allocations jsonb default '[]'::jsonb,
  target_cash_session_id uuid default null,
  target_user_id uuid default null,
  target_note text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  payment_id uuid := gen_random_uuid();
  receipt text := 'R-' || upper(substr(replace(payment_id::text, '-', ''), 1, 10));
  remaining numeric := round(target_amount, 2);
  allocated numeric := 0;
  allocation jsonb;
  item_amount numeric;
  receivable_row public.receivables%rowtype;
  customer_row public.customers%rowtype;
  session_branch uuid;
begin
  if target_amount is null or target_amount <= 0 or target_payment_method not in ('cash','card','transfer','other') then
    raise exception 'INVALID_RECEIVABLE_PAYMENT';
  end if;
  select * into customer_row from public.customers where id = target_customer_id and tenant_id = target_tenant_id for update;
  if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  if target_payment_method = 'cash' then
    if target_cash_session_id is null then raise exception 'CASH_SESSION_REQUIRED'; end if;
    select branch_id into session_branch from public.cash_sessions where id = target_cash_session_id and tenant_id = target_tenant_id and status = 'open' for update;
    if not found then raise exception 'CASH_SESSION_NOT_OPEN'; end if;
  end if;
  if jsonb_typeof(coalesce(target_allocations, '[]'::jsonb)) <> 'array' then raise exception 'INVALID_ALLOCATIONS'; end if;
  insert into public.receivable_payments(id, tenant_id, customer_id, receipt_number, amount, payment_method, received_by, user_id, paid_at, cash_session_id, note)
    values(payment_id, target_tenant_id, target_customer_id, receipt, target_amount, target_payment_method, target_user_id, target_user_id, now(), target_cash_session_id, nullif(left(target_note, 500), ''));
  if jsonb_array_length(coalesce(target_allocations, '[]'::jsonb)) > 0 then
    for allocation in select * from jsonb_array_elements(target_allocations) loop
      item_amount := round((allocation->>'amount')::numeric, 2);
      if item_amount <= 0 then raise exception 'INVALID_ALLOCATIONS'; end if;
      select * into receivable_row from public.receivables where id = (allocation->>'receivableId')::uuid and tenant_id = target_tenant_id and customer_id = target_customer_id and status in ('open','partial') for update;
      if not found or item_amount > receivable_row.outstanding_amount then raise exception 'PAYMENT_EXCEEDS_BALANCE'; end if;
      insert into public.receivable_payment_allocations(tenant_id, payment_id, receivable_id, amount) values(target_tenant_id, payment_id, receivable_row.id, item_amount);
      update public.receivables set outstanding_amount = outstanding_amount - item_amount, status = case when outstanding_amount - item_amount <= 0 then 'paid' else 'partial' end, updated_at = now() where id = receivable_row.id and tenant_id = target_tenant_id;
      remaining := remaining - item_amount; allocated := allocated + item_amount;
    end loop;
    if abs(remaining) > 0.01 then raise exception 'ALLOCATIONS_DO_NOT_MATCH_PAYMENT'; end if;
  else
    for receivable_row in select * from public.receivables where tenant_id = target_tenant_id and customer_id = target_customer_id and status in ('open','partial') and outstanding_amount > 0 order by due_date asc nulls last, created_at asc, id asc for update loop
      exit when remaining <= 0;
      item_amount := least(remaining, receivable_row.outstanding_amount);
      insert into public.receivable_payment_allocations(tenant_id, payment_id, receivable_id, amount) values(target_tenant_id, payment_id, receivable_row.id, item_amount);
      update public.receivables set outstanding_amount = outstanding_amount - item_amount, status = case when outstanding_amount - item_amount <= 0 then 'paid' else 'partial' end, updated_at = now() where id = receivable_row.id and tenant_id = target_tenant_id;
      remaining := remaining - item_amount; allocated := allocated + item_amount;
    end loop;
    if remaining > 0.01 then raise exception 'PAYMENT_EXCEEDS_BALANCE'; end if;
  end if;
  if target_payment_method = 'cash' then
    insert into public.cash_movements(tenant_id, cash_session_id, movement_type, amount, reference_type, reference_id, performed_by, metadata)
      values(target_tenant_id, target_cash_session_id, 'payment', target_amount, 'receivable_payment', payment_id, target_user_id, jsonb_build_object('receiptNumber', receipt));
  end if;
  return jsonb_build_object('paymentId', payment_id, 'receiptNumber', receipt, 'customerId', target_customer_id, 'amount', target_amount, 'allocated', allocated, 'remainingUnapplied', greatest(remaining, 0));
end; $$;
revoke all on function public.register_receivable_payment(uuid,uuid,numeric,text,jsonb,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.register_receivable_payment(uuid,uuid,numeric,text,jsonb,uuid,uuid,text) to service_role;

create or replace view public.receivables_aging as
select r.tenant_id, r.customer_id, r.id as receivable_id, r.outstanding_amount, r.due_date,
  case when r.due_date is null or r.due_date >= current_date then 'current'
       when current_date - r.due_date <= 30 then '0-30'
       when current_date - r.due_date <= 60 then '31-60'
       when current_date - r.due_date <= 90 then '61-90' else '90+' end as aging_bucket
from public.receivables r where r.status in ('open','partial','overdue') and r.outstanding_amount > 0;

revoke all on public.receivables_aging from public, anon;
grant select on public.receivables_aging to authenticated;
cd /home/ubuntu/Tienda-SS && git status --short
