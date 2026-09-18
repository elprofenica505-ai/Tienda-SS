import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const inventory = read('app/api/inventory/route.ts');
const cash = read('app/api/cash-sessions/route.ts');
const returns = read('app/api/sales/returns/route.ts');
const presaleCheckout = read('app/api/presales/checkout/route.ts');
const purchases = read('app/api/purchases/route.ts');
const scope = read('lib/organization-scope.ts');
const audit = read('lib/audit.ts');
const migration = read('supabase/migrations/20260918000001_stage1_audit_append_only_rls.sql');

test('la resolución de sucursal exige alcance inequívoco y no usa la primera sucursal', () => {
  assert.match(scope, /resolveAuthorizedBranchId/);
  assert.match(scope, /context\.branchIds\.length === 1/);
  assert.match(scope, /throw new Error\('BRANCH_REQUIRED'\)/);
  assert.doesNotMatch(inventory, /context\.branchIds\[0\]/);
  assert.doesNotMatch(cash, /context\.branchIds\[0\]/);
  assert.doesNotMatch(presaleCheckout, /context\.branchIds\[0\]/);
});

test('inventario, compras y preventas validan almacén con la sucursal resuelta', () => {
  assert.match(inventory, /resolveTenantWarehouseId/);
  assert.match(inventory, /String\(warehouse\.data\.branch_id\) !== branchId/);
  assert.match(purchases, /resolveTenantWarehouseId/);
  assert.match(presaleCheckout, /resolveTenantBranchAndWarehouse/);
});

test('devoluciones y checkout validan cashSessionId contra tenant, sucursal y estado abierto', () => {
  assert.match(returns, /eq\('branch_id', sale\.data\.branch_id\)/);
  assert.match(returns, /eq\('status', 'open'\)/);
  assert.match(presaleCheckout, /eq\('branch_id', branchId\)/);
  assert.match(presaleCheckout, /eq\('status', 'open'\)/);
});

test('auditoría usa RPC append-only y la migración revoca escrituras directas', () => {
  assert.match(audit, /rpc\('append_audit_log'/);
  assert.doesNotMatch(audit, /from\('audit_logs'\)\.insert/);
  assert.match(migration, /drop policy if exists audit_logs_update_admin/);
  assert.match(migration, /revoke insert, update, delete on public\.audit_logs/);
  assert.match(migration, /create unique index if not exists audit_logs_tenant_sequence_key/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /security definer/);
});

test('tablas sensibles quedan sin escritura PostgREST en la migración local', () => {
  assert.match(migration, /public\.inventory_stocks/);
  assert.match(migration, /public\.inventory_movements/);
  assert.match(migration, /public\.cash_movements/);
  assert.match(migration, /public\.fiscal_documents/);
  assert.match(migration, /revoke insert, update, delete/);
});
