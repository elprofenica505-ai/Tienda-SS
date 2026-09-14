-- Monthly entitlement counters replacing the legacy Firestore usage documents.
create table if not exists public.entitlement_usage (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  monthly_exports integer not null default 0 check (monthly_exports >= 0),
  monthly_sales integer not null default 0 check (monthly_sales >= 0),
  api_requests integer not null default 0 check (api_requests >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, month)
);
alter table public.entitlement_usage enable row level security;
revoke all on table public.entitlement_usage from anon, authenticated;
grant select, insert, update on table public.entitlement_usage to authenticated;
drop policy if exists entitlement_usage_member on public.entitlement_usage;
create policy entitlement_usage_member on public.entitlement_usage for select to authenticated using (public.has_tenant_access(tenant_id));
