import test from 'node:test';
import assert from 'node:assert/strict';
import { entitlementLabel, getEntitlementLimit, hasCapacity } from '@/lib/entitlements';

test('la capacidad considera el incremento solicitado y bloquea el siguiente recurso', () => {
  assert.equal(hasCapacity('starter', 'products', 99, 1), true);
  assert.equal(hasCapacity('starter', 'products', 100, 1), false);
  assert.equal(hasCapacity('starter', 'members', 3, 1), false);
});

test('starter aplica límites de miembros y productos', () => {
  assert.equal(getEntitlementLimit('starter', 'members'), 3);
  assert.equal(getEntitlementLimit('starter', 'products'), 100);
  assert.equal(hasCapacity('starter', 'members', 2), true);
  assert.equal(hasCapacity('starter', 'members', 3), false);
});

test('scale no bloquea por capacidad', () => {
  assert.equal(hasCapacity('scale', 'members', 100_000), true);
  assert.equal(hasCapacity('scale', 'products', 100_000), true);
});

test('plan desconocido usa límites conservadores y etiquetas claras', () => {
  assert.equal(getEntitlementLimit('unknown', 'members'), 3);
  assert.equal(entitlementLabel('members'), 'usuarios activos');
  assert.equal(entitlementLabel('products'), 'productos activos');
});

test('starter no tiene acceso API y limita exportaciones mensuales', () => {
  assert.equal(getEntitlementLimit('starter', 'apiAccess'), 0);
  assert.equal(getEntitlementLimit('growth', 'apiAccess'), 1);
  assert.equal(hasCapacity('starter', 'monthlyExports', 10, 1), false);
  assert.equal(hasCapacity('growth', 'monthlyExports', 99, 1), true);
});
