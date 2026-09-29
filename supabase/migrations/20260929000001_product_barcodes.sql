begin;

alter table public.products add column if not exists barcode text;

create unique index if not exists products_tenant_barcode_unique
  on public.products (tenant_id, barcode)
  where barcode is not null and barcode <> '';

comment on column public.products.barcode is 'Código de barras comercial o generado internamente para lectura POS.';

commit;
