-- Development-first performance indexes for deterministic tenant-scoped pagination.
-- Apply through the normal migration pipeline; do not run against production.
create index if not exists products_tenant_name_id_idx on public.products (tenant_id, name, id);
create index if not exists customers_tenant_name_id_idx on public.customers (tenant_id, name, id);
create index if not exists inventory_stocks_tenant_updated_id_idx on public.inventory_stocks (tenant_id, updated_at desc, id);
create index if not exists sales_tenant_created_id_idx on public.sales (tenant_id, created_at desc, id desc);
