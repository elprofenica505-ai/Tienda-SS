-- Supabase-only presales replacing the legacy Firestore collection.
create table if not exists public.presales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid,
  ticket_code text not null,
  items jsonb not null default '[]'::jsonb,
  total numeric(14,2) not null default 0 check (total >= 0),
  seller_uid uuid references auth.users(id) on delete set null,
  seller_email text,
  seller_role text,
  status text not null default 'draft' check (status in ('draft','sent_to_cashier','paid','cancelled')),
  evidence_refs jsonb not null default '[]'::jsonb,
  sale_id uuid,
  paid_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, ticket_code),
  foreign key (branch_id, tenant_id) references public.branches(id, tenant_id) on delete restrict,
  foreign key (sale_id, tenant_id) references public.sales(id, tenant_id) on delete set null
);
create index if not exists presales_tenant_created_idx on public.presales (tenant_id, created_at desc, id desc);
create index if not exists presales_tenant_status_created_idx on public.presales (tenant_id, status, created_at desc);
create index if not exists presales_tenant_seller_created_idx on public.presales (tenant_id, seller_uid, created_at desc);
create index if not exists presales_tenant_ticket_idx on public.presales (tenant_id, ticket_code);

alter table public.presales enable row level security;
revoke all on table public.presales from anon, authenticated;
grant select, insert, update on table public.presales to authenticated;
drop policy if exists presales_select_member on public.presales;
create policy presales_select_member on public.presales for select to authenticated using (public.has_tenant_access(tenant_id));
drop policy if exists presales_insert_member on public.presales;
create policy presales_insert_member on public.presales for insert to authenticated with check (public.has_tenant_access(tenant_id));
drop policy if exists presales_update_member on public.presales;
create policy presales_update_member on public.presales for update to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));
