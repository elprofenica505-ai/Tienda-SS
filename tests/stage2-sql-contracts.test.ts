import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260918000002_stage2_sql_contracts_and_atomic_provisioning.sql');
const presales = read('app/api/presales/route.ts');
const purchases = read('app/api/purchases/route.ts');
const tenants = read('app/api/tenants/route.ts');
const organization = read('app/api/organization/route.ts');
const sales = read('app/api/sales/route.ts');
const checkout = read('app/api/presales/checkout/route.ts');

 test('la migración define contratos RPC canónicos para preventas, compras y ventas', () => {
  for (const name of [
    'erp_normalize_items',
    'reserve_inventory_contract',
    'create_purchase_order_contract',
    'receive_purchase_contract',
    'receive_purchase_partial_contract',
    'create_sale_contract',
    'create_sale_with_payments_contract',
  ]) assert.match(migration, new RegExp(`function public\\.${name}`));
  assert.match(migration, /sale_quantity/);
  assert.match(migration, /sale_qty/);
  assert.match(migration, /received_quantity/);
  assert.match(migration, /received_qty/);
  assert.match(migration, /'quantity', quantity_value/);
});

test('los consumidores usan contratos de reserva y compras versionados', () => {
  assert.match(presales, /rpc\('reserve_inventory_contract'/);
  assert.match(purchases, /rpc\('create_purchase_order_contract'/);
  assert.match(purchases, /rpc\('receive_purchase_contract'/);
  assert.match(purchases, /rpc\('receive_purchase_partial_contract'/);
});

test('ventas mantienen el payload canónico productId/quantity', () => {
  assert.match(sales, /productId: text\(item\.productId/);
  assert.match(sales, /quantity: typeof item\.quantity/);
  assert.match(checkout, /productId, quantity, unitPrice/);
});

test('el onboarding usa una función de aprovisionamiento atómico', () => {
  assert.match(tenants, /rpc\('provision_initial_tenant'/);
  assert.match(migration, /provision_branch_resources/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /on conflict \(auth_user_id\) do update/);
  assert.match(migration, /return tenant_id/);
});

test('las RPC contractuales tienen search_path seguro, security definer y grants restringidos', () => {
  const functions = migration.match(/create or replace function public\.(?!erp_normalize_items)[\s\S]*?\$\$;/g) || [];
  assert.ok(functions.length >= 8);
  assert.ok(functions.every((body) => /security definer/.test(body)));
  assert.ok(functions.every((body) => /search_path = public, pg_temp/.test(body)));
  assert.match(migration, /revoke all on function public\.provision_initial_tenant/);
  assert.match(migration, /grant execute on function public\.provision_initial_tenant[\s\S]*to service_role/);
});

test('la creación de sucursal no ejecuta inserts operativos parciales desde la API', () => {
  assert.match(organization, /rpc\('create_branch_with_resources'/);
  assert.doesNotMatch(organization, /from\('warehouses'\)\.insert/);
  assert.doesNotMatch(organization, /from\('cash_registers'\)\.insert/);
  assert.match(migration, /create_branch_with_resources/);
});
