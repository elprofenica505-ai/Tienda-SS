import assert from 'node:assert/strict';
import test from 'node:test';
import { branchIdsFrom, safeCode } from '@/lib/organization';
import { getApiPolicy } from '@/lib/api-policy';
import { getEntitlementLimit } from '@/lib/entitlements';

test('la organización normaliza códigos y evita caracteres inseguros', () => {
  assert.equal(safeCode(' sucursal norte / 01 ', 'fallback'), 'SUCURSAL-NORTE---01');
  assert.equal(safeCode('', 'branch-main'), 'BRANCH-MAIN');
});

test('las asignaciones de sucursal aceptan únicamente IDs válidos y únicos', () => {
  assert.deepEqual(branchIdsFrom(['branch-main', 'branch-main', 'bad/id', 4, 'branch-norte']), ['branch-main', 'branch-norte']);
  assert.deepEqual(branchIdsFrom('branch-main'), []);
});

test('la política API protege la organización y deriva acciones por método', () => {
  assert.deepEqual(getApiPolicy('/api/organization', 'GET'), { module: 'dashboard', action: 'view' });
  assert.deepEqual(getApiPolicy('/api/organization', 'POST'), { module: 'dashboard', action: 'create' });
  assert.deepEqual(getApiPolicy('/api/organization', 'PATCH'), { module: 'dashboard', action: 'edit' });
  assert.deepEqual(getApiPolicy('/api/organization', 'PUT'), { module: 'dashboard', action: 'edit' });
});

test('los límites de sucursales del plan se mantienen como contrato de billing', () => {
  assert.equal(getEntitlementLimit('starter', 'branches'), 1);
  assert.equal(getEntitlementLimit('growth', 'branches'), 5);
  assert.equal(getEntitlementLimit('scale', 'branches'), Number.POSITIVE_INFINITY);
});
