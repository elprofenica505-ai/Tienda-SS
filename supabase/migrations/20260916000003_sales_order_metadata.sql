-- Structured operational metadata for POS and floor presales.
-- Kept in JSONB so tenants can carry local fiscal, delivery, and service fields without cross-tenant coupling.
alter table public.presales add column if not exists metadata jsonb not null default '{}'::jsonb;
create index if not exists presales_tenant_branch_status_created_idx on public.presales (tenant_id, branch_id, status, created_at desc);
