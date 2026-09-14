-- Supabase-only finance records and receipt metadata.
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  category text not null default 'General',
  payment_method text not null default 'cash' check (payment_method in ('cash','card','transfer','credit')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (branch_id, tenant_id) references public.branches(id, tenant_id) on delete restrict
);

create index if not exists expenses_tenant_branch_created_idx
  on public.expenses (tenant_id, branch_id, created_at desc);

alter table public.expenses enable row level security;
revoke all on table public.expenses from anon, authenticated;
grant select, insert, update on table public.expenses to authenticated;
drop policy if exists expenses_select_member on public.expenses;
create policy expenses_select_member on public.expenses for select to authenticated
  using (public.has_tenant_access(tenant_id));
drop policy if exists expenses_insert_member on public.expenses;
create policy expenses_insert_member on public.expenses for insert to authenticated
  with check (public.has_tenant_access(tenant_id) and public.has_active_branch_access(tenant_id, branch_id));

-- Older installations lacked metadata on cash movements; keep this idempotent.
alter table public.cash_movements
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Expose a stable operational shape for receipts without changing existing sale data.
create index if not exists sales_tenant_branch_created_idx
  on public.sales (tenant_id, branch_id, created_at desc);
