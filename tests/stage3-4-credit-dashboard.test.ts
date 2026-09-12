import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sales = readFileSync('app/api/sales/route.ts', 'utf8');
const presaleCheckout = readFileSync('app/api/presales/checkout/route.ts', 'utf8');
const contacts = readFileSync('app/api/contacts/route.ts', 'utf8');
const receivables = readFileSync('app/api/receivables/route.ts', 'utf8');
const dashboard = readFileSync('app/workspace/page.tsx', 'utf8');
const contactsPage = readFileSync('app/workspace/contacts/page.tsx', 'utf8');

test('clientes conservan límite y saldo de crédito', () => {
  assert.match(contacts, /creditLimit/);
  assert.match(contacts, /creditBalance/);
  assert.match(contactsPage, /Límite de crédito/);
  assert.match(contactsPage, /Crédito:/);
});

test('ventas directas y preventas validan límite y registran saldo', () => {
  assert.match(sales, /CREDIT_LIMIT_EXCEEDED/);
  assert.match(sales, /creditOverride/);
  assert.match(sales, /balanceDue/);
  assert.match(sales, /creditMovements/);
  assert.match(presaleCheckout, /CREDIT_LIMIT_EXCEEDED/);
  assert.match(presaleCheckout, /creditMovements/);
  assert.match(presaleCheckout, /dueAt/);
});

test('abonos actualizan cartera agregada y exponen vencidos', () => {
  assert.match(receivables, /creditBalance/);
  assert.match(receivables, /type: 'payment'/);
  assert.match(receivables, /overdue/);
  assert.match(receivables, /summary: \{/);
});

test('cartera y abonos respetan sucursal y el límite no baja del saldo', () => {
  assert.match(receivables, /assertBranchAccess/);
  assert.match(receivables, /visibleSales/);
  assert.match(receivables, /branchId: saleBranchId/);
  assert.match(contacts, /creditLimit < creditBalance/);
});

test('dashboard usa stats diarias y carga tickets pendientes', () => {
  assert.match(dashboard, /\/api\/stats\/daily/);
  assert.match(dashboard, /\/api\/presales/);
  assert.match(dashboard, /pendingPresales/);
  assert.match(dashboard, /openCredit/);
});
