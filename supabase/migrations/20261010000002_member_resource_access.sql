begin;
create table if not exists public.member_warehouses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, member_id uuid not null, warehouse_id uuid not null,
  created_at timestamptz not null default now(),
  constraint member_warehouses_unique unique (tenant_id, member_id, warehouse_id),
  constraint member_warehouses_id_tenant_unique unique (id, tenant_id),
  constraint member_warehouses_member_fk foreign key (member_id, tenant_id) references public.members (id, tenant_id) on delete cascade,
  constraint member_warehouses_warehouse_fk foreign key (warehouse_id, tenant_id) references public.warehouses (id, tenant_id) on delete cascade
);
create table if not exists public.member_cash_registers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, member_id uuid not null, cash_register_id uuid not null,
  created_at timestamptz not null default now(),
  constraint member_cash_registers_unique unique (tenant_id, member_id, cash_register_id),
  constraint member_cash_registers_id_tenant_unique unique (id, tenant_id),
  constraint member_cash_registers_member_fk foreign key (member_id, tenant_id) references public.members (id, tenant_id) on delete cascade,
  constraint member_cash_registers_register_fk foreign key (cash_register_id, tenant_id) references public.cash_registers (id, tenant_id) on delete cascade
);
create index if not exists member_warehouses_tenant_member_idx on public.member_warehouses (tenant_id, member_id);
create index if not exists member_warehouses_tenant_warehouse_idx on public.member_warehouses (tenant_id, warehouse_id);
create index if not exists member_cash_registers_tenant_member_idx on public.member_cash_registers (tenant_id, member_id);
create index if not exists member_cash_registers_tenant_register_idx on public.member_cash_registers (tenant_id, cash_register_id);
comment on table public.member_warehouses is 'Almacenes que opera cada miembro. Sin filas = todos los almacenes de sus sucursales.';
comment on table public.member_cash_registers is 'Cajas que opera cada miembro. Sin filas = todas las cajas de sus sucursales.';
alter table public.member_warehouses enable row level security;
alter table public.member_cash_registers enable row level security;
drop policy if exists member_warehouses_select_member on public.member_warehouses;
create policy member_warehouses_select_member on public.member_warehouses for select to authenticated using (public.is_active_tenant_member(tenant_id));
drop policy if exists member_warehouses_insert_admin on public.member_warehouses;
create policy member_warehouses_insert_admin on public.member_warehouses for insert to authenticated with check (public.is_tenant_admin(tenant_id));
drop policy if exists member_warehouses_update_admin on public.member_warehouses;
create policy member_warehouses_update_admin on public.member_warehouses for update to authenticated using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));
drop policy if exists member_warehouses_delete_admin on public.member_warehouses;
create policy member_warehouses_delete_admin on public.member_warehouses for delete to authenticated using (public.is_tenant_admin(tenant_id));
drop policy if exists member_cash_registers_select_member on public.member_cash_registers;
create policy member_cash_registers_select_member on public.member_cash_registers for select to authenticated using (public.is_active_tenant_member(tenant_id));
drop policy if exists member_cash_registers_insert_admin on public.member_cash_registers;
create policy member_cash_registers_insert_admin on public.member_cash_registers for insert to authenticated with check (public.is_tenant_admin(tenant_id));
drop policy if exists member_cash_registers_update_admin on public.member_cash_registers;
create policy member_cash_registers_update_admin on public.member_cash_registers for update to authenticated using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));
drop policy if exists member_cash_registers_delete_admin on public.member_cash_registers;
create policy member_cash_registers_delete_admin on public.member_cash_registers for delete to authenticated using (public.is_tenant_admin(tenant_id));
commit;
