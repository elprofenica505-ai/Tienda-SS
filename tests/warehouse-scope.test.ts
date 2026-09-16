import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const warehousesApi = readFileSync('app/api/inventory/warehouses/route.ts', 'utf8');

test('almacenes resuelve la sucursal pública a su UUID interno bajo el tenant autenticado', () => {
  assert.match(warehousesApi, /\.eq\('tenant_id', tenantId\).*\.eq\('active', true\).*\.eq\('id', branchId\)/);
  assert.match(warehousesApi, /\.eq\('legacy_firestore_id', branchId\)/);
  assert.match(warehousesApi, /const dbBranchId = await resolveBranchDbId\(context\.tenantId, branchId\)/);
  assert.match(warehousesApi, /\.eq\('branch_id', dbBranchId\)/);
  assert.match(warehousesApi, /assertBranchAccess\(context, branchId\)/);
});

test('las operaciones de almacén mantienen tenant y sucursal en la validación', () => {
  assert.match(warehousesApi, /\.eq\('tenant_id', context\.tenantId\)/);
  assert.match(warehousesApi, /\.eq\('id', warehouseId\)\.eq\('branch_id', dbBranchId\)\.eq\('active', true\)/);
});
