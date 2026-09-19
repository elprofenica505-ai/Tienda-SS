import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Preventas no oculta errores de esquema o permisos como 500 genérico', async () => {
  const route = await readFile('app/api/presales/route.ts', 'utf8');
  const checkout = await readFile('app/api/presales/checkout/route.ts', 'utf8');
  assert.match(route, /DATABASE_MIGRATION_REQUIRED/);
  assert.match(route, /DATABASE_PERMISSION_DENIED/);
  assert.match(checkout, /DATABASE_MIGRATION_REQUIRED/);
  assert.match(checkout, /DATABASE_PERMISSION_DENIED/);
});

test('el catálogo cuenta únicamente productos activos para capacidad del plan', async () => {
  const route = await readFile('app/api/catalog/route.ts', 'utf8');
  assert.match(route, /eq\('active', true\)/);
  assert.match(route, /assertPlanCapacity\(tenant\.data\.plan, 'products', active\.count \|\| 0, 1\)/);
  assert.match(route, /if \(typeof body\.active === 'boolean'\) changes\.active = body\.active/);
});
