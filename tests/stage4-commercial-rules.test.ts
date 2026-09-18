import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260918000004_stage4_commercial_rules.sql');
const sales = read('app/api/sales/route.ts');
const checkout = read('app/api/presales/checkout/route.ts');

test('la migración define listas de precios y asignaciones por cliente y sucursal', () => {
  for (const table of ['price_lists', 'price_list_items', 'customer_price_lists', 'branch_price_lists']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(migration, /customer_price_lists/);
  assert.match(migration, /branch_price_lists/);
  assert.match(migration, /pl\.priority desc/);
  assert.match(migration, /pl\.is_default/);
});

test('el precio efectivo ignora unitPrice del cliente y usa catálogo/lista activa', () => {
  assert.match(migration, /erp_commercial_price_items/);
  assert.match(migration, /pli\.unit_price/);
  assert.match(migration, /product_row\.price/);
  assert.match(migration, /normalized := normalized \|\| jsonb_build_array\(jsonb_build_object\('productId', product_id, 'quantity', quantity\)\)/);
  assert.doesNotMatch(migration, /item->>'unitPrice'/);
});

test('los descuentos se validan contra reglas comerciales server-side', () => {
  assert.match(migration, /commercial_rules/);
  assert.match(migration, /max_discount_percent/);
  assert.match(migration, /DISCOUNT_NOT_AUTHORIZED/);
  assert.match(migration, /discount_value > round\(priced\.subtotal \* priced\.max_discount_percent \/ 100, 2\)/);
  assert.match(sales, /target_discount: money\(body\.discount\)/);
  assert.match(checkout, /target_discount: money\(body\.discount\)/);
});

test('las comisiones se registran dentro de la transacción de venta', () => {
  assert.match(migration, /create table if not exists public\.sales_commissions/);
  assert.match(migration, /unique \(tenant_id, sale_id\)/);
  assert.match(migration, /insert into public\.sales_commissions/);
  assert.match(migration, /commission_amount/);
  assert.match(migration, /on conflict \(tenant_id, sale_id\) do nothing/);
  assert.match(migration, /commission_percent/);
});

test('las RPC comerciales mantienen seguridad y contratos server-priced', () => {
  assert.match(migration, /create or replace function public\.create_sale_server_priced/);
  assert.match(migration, /create or replace function public\.create_sale_with_payments_server_priced/);
  assert.match(migration, /security definer set search_path = public, pg_temp/);
  assert.match(migration, /revoke all on function public\.create_sale_server_priced/);
  assert.match(migration, /grant execute on function public\.create_sale_server_priced[\s\S]*to service_role/);
});
