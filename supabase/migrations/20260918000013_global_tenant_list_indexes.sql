-- Índices de acceso por tenant para las listas de operación.
-- Todas las sentencias son idempotentes y respetan los nombres reales del esquema.
create index if not exists products_tenant_name_id_idx
  on public.products (tenant_id, name, id);
create index if not exists customers_tenant_name_id_idx
  on public.customers (tenant_id, name, id);
create index if not exists sales_tenant_created_id_idx
  on public.sales (tenant_id, created_at desc, id desc);
create index if not exists presales_tenant_created_id_idx
  on public.presales (tenant_id, created_at desc, id desc);
create index if not exists members_tenant_created_id_idx
  on public.members (tenant_id, created_at desc, id desc);
create index if not exists inventory_stocks_tenant_updated_id_idx
  on public.inventory_stocks (tenant_id, updated_at desc, id desc);
create index if not exists inventory_movements_tenant_created_id_idx
  on public.inventory_movements (tenant_id, created_at desc, id desc);
