-- Stage 7: accounts payable, atomic purchase reception, supplier payments, and idempotency.
-- Local development only. Do not apply remotely until PostgreSQL validation is authorized.
begin;

create table if not exists public.payables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  purchase_id uuid not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  original_amount numeric(14,2) not null check (original_amount > 0),
  outstanding_amount numeric(14,2) not null check (outstanding_amount >= 0),
  status text not null default 'open' check (status in ('open','partial','paid','cancelled')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, purchase_id),
  unique (id, tenant_id)
);

create table if not exists public.payable_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  payable_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash','bank_transfer','card','other')),
  received_by uuid references auth.users(id) on delete set null,
  notes text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (payable_id, tenant_id) references public.payables(id, tenant_id) on delete restrict
);

create table if not exists public.financial_outflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  channel text not null check (channel in ('cash','bank')),
  amount numeric(14,2) not null check (amount > 0),
  reference_type text not null,
  reference_id uuid not null,
  cash_session_id uuid,
  performed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, reference_type, reference_id)
);

create unique index if not exists payable_payments_tenant_idempotency_idx
  on public.payable_payments (tenant_id, idempotency_key)
  where idempotency_key is not null and length(trim(idempotency_key)) > 0;
create index if not exists payables_supplier_status_idx
  on public.payables (tenant_id, supplier_id, status, due_date);

-- Receipt and payable creation are one function invocation and therefore one
-- transaction: a failure in the payable insert rolls back inventory/purchase.
create or replace function public.receive_purchase_with_payable(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_warehouse_id uuid,
  target_supplier_name text,
  target_evidence_ref text,
  target_user_id uuid,
  target_items jsonb,
  target_supplier_id uuid default null,
  target_due_date date default null
) returns table(purchase_id uuid, total numeric, item_count integer, payable_id uuid)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare purchase_row record; payable_row public.payables%rowtype;
begin
  select * into purchase_row from public.receive_purchase(
    target_tenant_id, target_branch_id, target_warehouse_id,
    target_supplier_name, target_evidence_ref, target_user_id, target_items
  );
  if purchase_row.purchase_id is null or purchase_row.total <= 0 then raise exception 'PURCHASE_TOTAL_INVALID'; end if;
  insert into public.payables(tenant_id, purchase_id, supplier_id, original_amount, outstanding_amount, status, due_date)
  values(target_tenant_id, purchase_row.purchase_id, target_supplier_id, purchase_row.total, purchase_row.total, 'open', target_due_date)
  on conflict (tenant_id, purchase_id) do update set updated_at = now()
  returning * into payable_row;
  return query select purchase_row.purchase_id, purchase_row.total, purchase_row.item_count, payable_row.id;
end;
$$;

create or replace function public.payable_payment_idempotent(
  target_tenant_id uuid,
  target_payable_id uuid,
  target_amount numeric,
  target_payment_method text,
  target_user_id uuid,
  target_notes text,
  target_idempotency_key text,
  target_cash_session_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare existing public.payable_payments%rowtype; payable_row public.payables%rowtype; payment_id uuid; remaining numeric; next_status text; outflow_id uuid; key_value text; channel_value text;
begin
  key_value := nullif(left(trim(target_idempotency_key), 160), '');
  if key_value is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if target_amount <= 0 or target_payment_method not in ('cash','bank_transfer','card','other') then raise exception 'INVALID_PAYABLE_PAYMENT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_tenant_id::text || ':ap:' || key_value, 0));
  select * into existing from public.payable_payments where tenant_id = target_tenant_id and idempotency_key = key_value limit 1;
  if found then return jsonb_build_object('paymentId', existing.id, 'payableId', existing.payable_id, 'amount', existing.amount, 'replayed', true); end if;
  select * into payable_row from public.payables where id = target_payable_id and tenant_id = target_tenant_id for update;
  if not found then raise exception 'PAYABLE_NOT_FOUND'; end if;
  if payable_row.status in ('paid','cancelled') then raise exception 'PAYABLE_CLOSED'; end if;
  if target_amount > payable_row.outstanding_amount then raise exception 'PAYMENT_EXCEEDS_PAYABLE'; end if;
  if target_payment_method = 'cash' and (target_cash_session_id is null or not exists(select 1 from public.cash_sessions where id = target_cash_session_id and tenant_id = target_tenant_id and status = 'open')) then raise exception 'CASH_SESSION_NOT_OPEN'; end if;
  remaining := payable_row.outstanding_amount - target_amount;
  next_status := case when remaining <= 0 then 'paid' else 'partial' end;
  insert into public.payable_payments(tenant_id, payable_id, amount, payment_method, received_by, notes, idempotency_key)
  values(target_tenant_id, target_payable_id, target_amount, target_payment_method, target_user_id, left(coalesce(target_notes,''), 300), key_value)
  returning id into payment_id;
  update public.payables set outstanding_amount = remaining, status = next_status, updated_at = now() where id = target_payable_id and tenant_id = target_tenant_id;
  channel_value := case when target_payment_method = 'cash' then 'cash' else 'bank' end;
  insert into public.financial_outflows(tenant_id, channel, amount, reference_type, reference_id, cash_session_id, performed_by, metadata)
  values(target_tenant_id, channel_value, target_amount, 'payable_payment', payment_id, target_cash_session_id, target_user_id, jsonb_build_object('payableId', target_payable_id, 'paymentMethod', target_payment_method));
  if target_payment_method = 'cash' then
    insert into public.cash_movements(tenant_id, cash_session_id, movement_type, amount, reference_type, reference_id, performed_by, metadata)
    values(target_tenant_id, target_cash_session_id, 'withdrawal', -target_amount, 'payable_payment', payment_id, target_user_id, jsonb_build_object('payableId', target_payable_id));
  end if;
  return jsonb_build_object('paymentId', payment_id, 'payableId', target_payable_id, 'amount', target_amount, 'remainingAmount', remaining, 'status', next_status, 'replayed', false);
end;
$$;

revoke all on function public.receive_purchase_with_payable(uuid, uuid, uuid, text, text, uuid, jsonb, uuid, date) from public, anon, authenticated;
revoke all on function public.payable_payment_idempotent(uuid, uuid, numeric, text, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.receive_purchase_with_payable(uuid, uuid, uuid, text, text, uuid, jsonb, uuid, date) to service_role;
grant execute on function public.payable_payment_idempotent(uuid, uuid, numeric, text, uuid, text, text, uuid) to service_role;

commit;
