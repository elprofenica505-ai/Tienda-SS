-- Shared daily quota for financial reports, Caja and Preventas exports.
-- The service stores one counter per company and local calendar date.
-- Do not run this migration against a project until the owner authorizes it.
begin;

create table if not exists public.financial_report_export_daily_usage (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  local_date date not null,
  export_count integer not null default 0 check (export_count between 0 and 3),
  last_exported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, local_date)
);

create index if not exists financial_report_export_daily_usage_date_idx
  on public.financial_report_export_daily_usage (local_date desc);

alter table public.financial_report_export_daily_usage enable row level security;
revoke all on table public.financial_report_export_daily_usage from public, anon, authenticated;
grant select, insert, update on table public.financial_report_export_daily_usage to service_role;

commit;
