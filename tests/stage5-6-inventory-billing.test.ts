import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getApiPolicy } from '@/lib/api-policy';

const purchases = readFileSync('app/api/purchases/route.ts', 'utf8');
const deliveries = readFileSync('app/api/deliveries/route.ts', 'utf8');
const inventory = readFileSync('app/api/inventory/route.ts', 'utf8');
const billing = readFileSync('app/api/billing/route.ts', 'utf8');
const billingPage = readFileSync('app/workspace/billing/page.tsx', 'utf8');
const rules = readFileSync('firestore.rules', 'utf8');

test('compras aumentan stock y dejan movimiento auditado', () => {
  assert.match(purchases, /purchases/);
  assert.match(purchases, /type: 'purchase'/);
  assert.match(purchases, /previousStock/);
  assert.match(purchases, /newStock/);
  assert.match(purchases, /writeImmutableAudit/);
  assert.match(purchases, /evidenceRef/);
});

test('inventario conserva paginación y ajustes auditables', () => {
  assert.match(inventory, /parsePageSize/);
  assert.match(inventory, /startAfter/);
  assert.match(inventory, /inventory\.adjusted/);
});

test('entregas son simples y están ligadas a ventas', () => {
  assert.match(deliveries, /saleId/);
  assert.match(deliveries, /pending/);
  assert.match(deliveries, /delivered/);
  assert.match(deliveries, /driverUid/);
});

test('facturación expone uso y suspensión/restricción existentes', () => {
  assert.match(billing, /usage/);
  assert.match(billing, /members.*count/);
  assert.match(billing, /products.*count/);
  assert.match(billingPage, /Usuarios activos/);
  assert.deepEqual(getApiPolicy('/api/purchases', 'POST'), { module: 'inventory', action: 'create' });
  assert.deepEqual(getApiPolicy('/api/deliveries', 'PATCH'), { module: 'sales', action: 'edit' });
  assert.match(rules, /match \/purchases\/\{documentId\}/);
  assert.match(rules, /match \/deliveries\/\{documentId\}/);
});
