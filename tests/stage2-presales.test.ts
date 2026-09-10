import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getApiPolicy } from '@/lib/api-policy';

const presalesApi = readFileSync('app/api/presales/route.ts', 'utf8');
const checkoutApi = readFileSync('app/api/presales/checkout/route.ts', 'utf8');
const sellerPage = readFileSync('app/workspace/presales/page.tsx', 'utf8');
const cashierPage = readFileSync('app/workspace/cashier/page.tsx', 'utf8');
const workspacePage = readFileSync('app/workspace/page.tsx', 'utf8');
const rules = readFileSync('firestore.rules', 'utf8');

test('la preventa tiene ticket, líneas, vendedor, estados y evidencia liviana', () => {
  assert.match(presalesApi, /ticketCode/);
  assert.match(presalesApi, /items: lines/);
  assert.match(presalesApi, /vendedorUid/);
  assert.match(presalesApi, /sent_to_cashier/);
  assert.match(presalesApi, /evidenceRefs/);
  assert.match(presalesApi, /limit\(21\)/);
  assert.match(presalesApi, /!item\.startsWith\('data:'\)/);
});

test('el checkout marca paid y descuenta stock una sola vez en una transacción', () => {
  assert.match(checkoutApi, /presale\.status === 'paid'/);
  assert.match(checkoutApi, /presaleRef, \{ status: 'paid'/);
  assert.match(checkoutApi, /delta: -quantity/);
  assert.match(checkoutApi, /statsRef/);
  assert.match(checkoutApi, /INSUFFICIENT_STOCK/);
  assert.match(checkoutApi, /presaleId/);
});

test('los paneles de vendedor y caja están disponibles', () => {
  assert.match(sellerPage, /Enviar a caja/);
  assert.match(sellerPage, /capture="environment"/);
  assert.match(cashierPage, /Código de ticket/);
  assert.match(cashierPage, /Cobrar ticket/);
});

test('la API y las reglas mantienen el aislamiento y política de ventas', () => {
  assert.deepEqual(getApiPolicy('/api/presales', 'POST'), { module: 'sales', action: 'create' });
  assert.deepEqual(getApiPolicy('/api/presales/checkout', 'POST'), { module: 'sales', action: 'create' });
  assert.match(rules, /match \/presales\/\{documentId\}/);
  assert.match(rules, /allow delete: if false/);
});

test('la consulta de preventas coincide con el índice descendente existente', () => {
  assert.match(presalesApi, /orderBy\('createdAt', 'desc'\)\.orderBy\('__name__', 'desc'\)/);
});

test('el dashboard no se cae si preventas responde con error', () => {
  assert.match(workspacePage, /if \(!presalesResponse\.ok\) setMessage/);
  assert.doesNotMatch(workspacePage, /if \(!presalesResponse\.ok\) throw/);
});
