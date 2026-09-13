-- ConexiaX / Supabase-only ERP foundation
-- Migration: 0002_erp_foundation
-- Scope: catalog, inventory, sales, purchases, cash, credit, fiscal, audit and files.
-- No legacy Firebase data is imported by this migration.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null,
  code text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name),
  unique (id, tenant_id)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  category_id uuid,
  sku text not null,
  name text not null,
  description text,
  unit text not null default 'unidad',
  cost numeric(14,4) not null default 0 check (cost >= 0),
  price numeric(14,4) not null default 0 check (price >= 0),
  tax_rate numeric(7,4) not null default 0 check (tax_rate >= 0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sku),
  unique (id, tenant_id),
  foreign key (category_id, tenant_id) references public.categories(id, tenant_id) on delete set null
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null,
  document_id text,
  email text,
  phone text,
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null,
  document_id text,
  email text,
  phone text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create table if not exists public.inventory_stocks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  product_id uuid not null,
  warehouse_id uuid not null,
  quantity numeric(14,4) not null default 0 check (quantity >= 0),
  reserved_quantity numeric(14,4) not null default 0 check (reserved_quantity >= 0),
  reorder_point numeric(14,4) not null default 0 check (reorder_point >= 0),
  updated_at timestamptz not null default now(),
  unique (tenant_id, product_id, warehouse_id),
  unique (id, tenant_id),
  foreign key (product_id, tenant_id) references public.products(id, tenant_id) on delete restrict,
  foreign key (warehouse_id, tenant_id) references public.warehouses(id, tenant_id) on delete restrict
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  product_id uuid not null,
  warehouse_id uuid not null,
  movement_type text not null check (movement_type in ('purchase','sale','return','adjustment','transfer_in','transfer_out','reservation','release','opening')),
  quantity numeric(14,4) not null check (quantity <> 0),
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  reference_type text,
  reference_id uuid,
  performed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (product_id, tenant_id) references public.products(id, tenant_id) on delete restrict,
  foreign key (warehouse_id, tenant_id) references public.warehouses(id, tenant_id) on delete restrict
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  cash_register_id uuid,
  customer_id uuid,
  invoice_number text,
  status text not null default 'completed' check (status in ('draft','completed','voided','returned','pending')),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  sold_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (branch_id, tenant_id) references public.branches(id, tenant_id) on delete restrict,
  foreign key (cash_register_id, tenant_id) references public.cash_registers(id, tenant_id) on delete set null,
  foreign key (customer_id, tenant_id) references public.customers(id, tenant_id) on delete set null
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  sale_id uuid not null,
  product_id uuid not null,
  warehouse_id uuid not null,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_price numeric(14,4) not null check (unit_price >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  unique (id, tenant_id),
  foreign key (sale_id, tenant_id) references public.sales(id, tenant_id) on delete cascade,
  foreign key (product_id, tenant_id) references public.products(id, tenant_id) on delete restrict,
  foreign key (warehouse_id, tenant_id) references public.warehouses(id, tenant_id) on delete restrict
);

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  sale_id uuid not null,
  payment_method text not null check (payment_method in ('cash','card','transfer','credit','other')),
  amount numeric(14,2) not null check (amount > 0),
  reference text,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (sale_id, tenant_id) references public.sales(id, tenant_id) on delete cascade
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  warehouse_id uuid not null,
  supplier_id uuid,
  invoice_number text,
  status text not null default 'received' check (status in ('draft','ordered','received','cancelled')),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (branch_id, tenant_id) references public.branches(id, tenant_id) on delete restrict,
  foreign key (warehouse_id, tenant_id) references public.warehouses(id, tenant_id) on delete restrict,
  foreign key (supplier_id, tenant_id) references public.suppliers(id, tenant_id) on delete set null
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  purchase_id uuid not null,
  product_id uuid not null,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  unique (id, tenant_id),
  foreign key (purchase_id, tenant_id) references public.purchases(id, tenant_id) on delete cascade,
  foreign key (product_id, tenant_id) references public.products(id, tenant_id) on delete restrict
);

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  cash_register_id uuid not null,
  opened_by uuid references auth.users(id) on delete set null,
  closed_by uuid references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  opening_amount numeric(14,2) not null default 0 check (opening_amount >= 0),
  closing_amount numeric(14,2),
  expected_amount numeric(14,2),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (id, tenant_id),
  foreign key (branch_id, tenant_id) references public.branches(id, tenant_id) on delete restrict,
  foreign key (cash_register_id, tenant_id) references public.cash_registers(id, tenant_id) on delete restrict
);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  cash_session_id uuid not null,
  movement_type text not null check (movement_type in ('sale','purchase','deposit','withdrawal','payment','refund','adjustment')),
  amount numeric(14,2) not null check (amount <> 0),
  reference_type text,
  reference_id uuid,
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (cash_session_id, tenant_id) references public.cash_sessions(id, tenant_id) on delete cascade
);

create table if not exists public.receivables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  customer_id uuid not null,
  sale_id uuid,
  original_amount numeric(14,2) not null check (original_amount > 0),
  outstanding_amount numeric(14,2) not null check (outstanding_amount >= 0),
  status text not null default 'open' check (status in ('open','partial','paid','cancelled')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (customer_id, tenant_id) references public.customers(id, tenant_id) on delete restrict,
  foreign key (sale_id, tenant_id) references public.sales(id, tenant_id) on delete set null
);

create table if not exists public.receivable_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  receivable_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null default 'cash',
  received_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (receivable_id, tenant_id) references public.receivables(id, tenant_id) on delete cascade
);

create table if not exists public.fiscal_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete restrict,
  provider text not null default 'manual',
  tax_id text,
  legal_name text,
  address text,
  enabled boolean not null default false,
  encrypted_credentials text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create table if not exists public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  sale_id uuid,
  document_type text not null,
  document_number text,
  status text not null default 'draft' check (status in ('draft','pending','issued','rejected','voided')),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (sale_id, tenant_id) references public.sales(id, tenant_id) on delete set null
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create table if not exists public.file_metadata (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  uploaded_by uuid references auth.users(id) on delete set null,
  bucket text not null,
  object_path text not null,
  original_name text,
  mime_type text,
  byte_size bigint,
  created_at timestamptz not null default now(),
  unique (tenant_id, bucket, object_path),
  unique (id, tenant_id)
);

create index if not exists categories_tenant_active_name_idx on public.categories (tenant_id, active, name);
create index if not exists products_tenant_active_name_idx on public.products (tenant_id, active, name);
create index if not exists products_tenant_category_idx on public.products (tenant_id, category_id);
create index if not exists inventory_stocks_tenant_warehouse_idx on public.inventory_stocks (tenant_id, warehouse_id, product_id);
create index if not exists inventory_movements_tenant_created_idx on public.inventory_movements (tenant_id, created_at desc);
create index if not exists sales_tenant_created_idx on public.sales (tenant_id, created_at desc);
create index if not exists sales_tenant_status_idx on public.sales (tenant_id, status, created_at desc);
create index if not exists sale_items_tenant_sale_idx on public.sale_items (tenant_id, sale_id);
create index if not exists purchases_tenant_created_idx on public.purchases (tenant_id, created_at desc);
create index if not exists cash_sessions_tenant_status_idx on public.cash_sessions (tenant_id, status, opened_at desc);
create index if not exists cash_movements_tenant_session_idx on public.cash_movements (tenant_id, cash_session_id, created_at desc);
create index if not exists receivables_tenant_status_idx on public.receivables (tenant_id, status, due_date);
create index if not exists fiscal_documents_tenant_status_idx on public.fiscal_documents (tenant_id, status, created_at desc);
create index if not exists audit_logs_tenant_created_idx on public.audit_logs (tenant_id, created_at desc);
create index if not exists file_metadata_tenant_created_idx on public.file_metadata (tenant_id, created_at desc);

create or replace function public.has_tenant_access(target_tenant_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select public.is_active_tenant_member(target_tenant_id); $$;

create or replace function public.has_tenant_admin_access(target_tenant_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select public.is_tenant_admin(target_tenant_id); $$;

grant execute on function public.has_tenant_access(uuid) to authenticated;
grant execute on function public.has_tenant_admin_access(uuid) to authenticated;

-- The first pass deliberately applies conservative tenant isolation. Module-specific
-- role policies and atomic RPC functions are added with their respective migrations.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'categories','products','customers','suppliers','inventory_stocks','inventory_movements',
    'sales','sale_items','sale_payments','purchases','purchase_items','cash_sessions',
    'cash_movements','receivables','receivable_payments','fiscal_configs','fiscal_documents',
    'audit_logs','file_metadata'
  ] LOOP
    EXECUTE format('alter table public.%I enable row level security', table_name);
    EXECUTE format('revoke all on table public.%I from anon, authenticated', table_name);
    EXECUTE format('grant select on table public.%I to authenticated', table_name);
    EXECUTE format('grant insert, update on table public.%I to authenticated', table_name);
    EXECUTE format('create policy %I on public.%I for select to authenticated using (public.has_tenant_access(tenant_id))', table_name || '_select_member', table_name);
    EXECUTE format('create policy %I on public.%I for insert to authenticated with check (public.has_tenant_admin_access(tenant_id))', table_name || '_insert_admin', table_name);
    EXECUTE format('create policy %I on public.%I for update to authenticated using (public.has_tenant_admin_access(tenant_id)) with check (public.has_tenant_admin_access(tenant_id))', table_name || '_update_admin', table_name);
  END LOOP;
END $$;

comment on table public.products is 'Tenant-scoped product catalog; Firebase products collection replacement.';
comment on table public.inventory_stocks is 'Current stock by tenant, product and warehouse.';
comment on table public.sales is 'Sales header; operations become PostgreSQL transactions/RPC.';
comment on table public.fiscal_configs is 'Tenant-scoped electronic invoicing configuration; secrets remain server-side.';
comment on table public.file_metadata is 'Metadata for private objects stored in Supabase Storage.';


create or replace function public.create_initial_tenant(
  target_auth_user_id uuid,
  target_email text,
  target_display_name text,
  target_company_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant_id uuid;
  new_branch_id uuid;
  base_slug text;
  next_slug text;
begin
  if target_auth_user_id is null then raise exception 'AUTH_USER_REQUIRED'; end if;
  if length(trim(target_company_name)) < 2 then raise exception 'TENANT_NAME_INVALID'; end if;
  if exists (select 1 from public.profiles where auth_user_id = target_auth_user_id) then
    raise exception 'AUTH_USER_ALREADY_ONBOARDED';
  end if;

  base_slug := regexp_replace(lower(trim(target_company_name)), '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then base_slug := 'empresa'; end if;
  next_slug := left(base_slug, 70);
  if exists (select 1 from public.tenants where slug = next_slug) then
    next_slug := left(base_slug, 55) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  end if;

  insert into public.profiles (id, auth_user_id, email, display_name)
  values (target_auth_user_id, target_auth_user_id, nullif(lower(trim(target_email)), ''), nullif(trim(target_display_name), ''));

  insert into public.tenants (slug, name, status)
  values (next_slug, trim(target_company_name), 'active')
  returning id into new_tenant_id;

  insert into public.members (tenant_id, profile_id, role, status)
  values (new_tenant_id, target_auth_user_id, 'owner', 'active');

  insert into public.branches (tenant_id, code, name)
  values (new_tenant_id, 'PRINCIPAL', 'Sucursal principal')
  returning id into new_branch_id;

  insert into public.member_branches (tenant_id, member_id, branch_id)
  select new_tenant_id, m.id, new_branch_id
  from public.members m
  where m.tenant_id = new_tenant_id and m.profile_id = target_auth_user_id;

  insert into public.warehouses (tenant_id, branch_id, code, name)
  values (new_tenant_id, new_branch_id, 'ALM-PRINCIPAL', 'Almacén principal');

  insert into public.cash_registers (tenant_id, branch_id, code, name)
  values (new_tenant_id, new_branch_id, 'CAJA-PRINCIPAL', 'Caja principal');

  return new_tenant_id;
end;
$$;

revoke all on function public.create_initial_tenant(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_initial_tenant(uuid, text, text, text) to service_role;


alter table public.tenants add column if not exists plan text not null default 'starter';
alter table public.tenants add column if not exists subscription_status text not null default 'active';

create table if not exists public.tenant_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  setting_key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (tenant_id, setting_key),
  unique (id, tenant_id)
);

create index if not exists tenant_settings_tenant_key_idx on public.tenant_settings (tenant_id, setting_key);
alter table public.tenant_settings enable row level security;
revoke all on table public.tenant_settings from anon, authenticated;
grant select, insert, update on table public.tenant_settings to authenticated;
create policy tenant_settings_select_member on public.tenant_settings for select to authenticated using (public.has_tenant_access(tenant_id));
create policy tenant_settings_write_admin on public.tenant_settings for insert to authenticated with check (public.has_tenant_admin_access(tenant_id));
create policy tenant_settings_update_admin on public.tenant_settings for update to authenticated using (public.has_tenant_admin_access(tenant_id)) with check (public.has_tenant_admin_access(tenant_id));


alter table public.categories add column if not exists color text not null default '#c7f57b';
alter table public.products add column if not exists item_type text not null default 'physical' check (item_type in ('physical', 'service'));
alter table public.products add column if not exists min_stock numeric(14,4) not null default 5 check (min_stock >= 0);
alter table public.products add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.products add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.categories add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.categories add column if not exists updated_by uuid references auth.users(id) on delete set null;


create or replace function public.adjust_inventory(
  target_tenant_id uuid,
  target_product_id uuid,
  target_warehouse_id uuid,
  target_movement_type text,
  target_quantity numeric,
  target_reason text,
  target_user_id uuid
)
returns table(previous_quantity numeric, new_quantity numeric, delta numeric, movement_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_quantity numeric;
  calculated_delta numeric;
  resulting_quantity numeric;
  new_movement_id uuid;
begin
  if target_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;
  if target_movement_type not in ('receive', 'remove', 'set') then raise exception 'INVALID_MOVEMENT_TYPE'; end if;
  if not exists (select 1 from public.products where id = target_product_id and tenant_id = target_tenant_id and active) then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if not exists (select 1 from public.warehouses where id = target_warehouse_id and tenant_id = target_tenant_id and active) then raise exception 'WAREHOUSE_NOT_FOUND'; end if;

  select quantity into current_quantity
  from public.inventory_stocks
  where tenant_id = target_tenant_id and product_id = target_product_id and warehouse_id = target_warehouse_id
  for update;
  current_quantity := coalesce(current_quantity, 0);
  resulting_quantity := case when target_movement_type = 'receive' then current_quantity + target_quantity when target_movement_type = 'remove' then current_quantity - target_quantity else target_quantity end;
  if resulting_quantity < 0 then raise exception 'INSUFFICIENT_STOCK'; end if;
  calculated_delta := resulting_quantity - current_quantity;

  insert into public.inventory_stocks (tenant_id, product_id, warehouse_id, quantity, updated_at)
  values (target_tenant_id, target_product_id, target_warehouse_id, resulting_quantity, now())
  on conflict (tenant_id, product_id, warehouse_id) do update set quantity = excluded.quantity, updated_at = now();

  insert into public.inventory_movements (tenant_id, product_id, warehouse_id, movement_type, quantity, reference_type, performed_by, metadata)
  values (target_tenant_id, target_product_id, target_warehouse_id, 'adjustment', calculated_delta, 'manual', target_user_id, jsonb_build_object('reason', target_reason, 'operation', target_movement_type))
  returning id into new_movement_id;

  return query select current_quantity, resulting_quantity, calculated_delta, new_movement_id;
end;
$$;

revoke all on function public.adjust_inventory(uuid, uuid, uuid, text, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.adjust_inventory(uuid, uuid, uuid, text, numeric, text, uuid) to service_role;
