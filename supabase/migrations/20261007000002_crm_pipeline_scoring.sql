-- CRM fase 2: únicamente la captura manual del inicio del embudo.
begin;

create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  customer_id uuid,
  owner_uid uuid references auth.users(id) on delete set null,
  stage text not null default 'prospect' check (stage in ('prospect','initial_contact')),
  name text not null check (length(trim(name)) between 2 and 180),
  phone text,
  email text,
  source text,
  notes text,
  estimated_value numeric(14,2) not null default 0 check (estimated_value >= 0),
  last_contact_at timestamptz,
  next_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (branch_id, tenant_id) references public.branches(id, tenant_id) on delete restrict,
  foreign key (customer_id, tenant_id) references public.customers(id, tenant_id) on delete set null
);

create index if not exists crm_leads_stage_idx on public.crm_leads (tenant_id, branch_id, stage, updated_at desc);
create index if not exists crm_leads_owner_idx on public.crm_leads (tenant_id, owner_uid, updated_at desc);
create index if not exists crm_leads_customer_idx on public.crm_leads (tenant_id, customer_id) where customer_id is not null;
create index if not exists crm_leads_recontact_idx on public.crm_leads (tenant_id, next_contact_at) where next_contact_at is not null;

alter table public.crm_leads enable row level security;
revoke all on table public.crm_leads from public, anon, authenticated;
grant select, insert, update on table public.crm_leads to service_role;

create policy crm_leads_tenant_select on public.crm_leads
  for select to authenticated using (public.has_tenant_access(tenant_id));

commit;
