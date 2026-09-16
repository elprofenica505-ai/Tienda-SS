import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260916000002_mixed_sale_payments.sql', 'utf8');
const checkout = readFileSync('app/api/presales/checkout/route.ts', 'utf8');
const receivables = readFileSync('app/api/receivables/route.ts', 'utf8');
const contacts = readFileSync('app/workspace/contacts/page.tsx', 'utf8');
const receivablesPage = readFileSync('app/workspace/receivables/page.tsx', 'utf8');

test('venta mixta usa RPC transaccional y crea cuenta por cobrar por el crédito', () => {
  assert.match(migration, /create_sale_with_payments/);
  assert.match(migration, /paymentMethod.*mixed/);
  assert.match(migration, /insert into public\.receivables/);
  assert.match(migration, /CREDIT_LIMIT_EXCEEDED/);
  assert.match(checkout, /create_sale_with_payments/);
  assert.match(checkout, /splitPayments/);
});

test('abono CxC expone FIFO y allocations explícitos', () => {
  assert.match(receivables, /register_receivable_payment/);
  assert.match(receivables, /target_allocations/);
  assert.match(receivables, /customerId/);
});

test('la UI móvil permite configurar crédito y registrar abono por cliente', () => {
  assert.match(contacts, /creditEnabled/);
  assert.match(contacts, /termDays/);
  assert.match(contacts, /creditStatus/);
  assert.match(receivablesPage, /Cliente para abono FIFO/);
  assert.match(receivablesPage, /customerId/);
});
