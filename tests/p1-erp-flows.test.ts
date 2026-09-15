import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function read(path: string) { return readFile(path, 'utf8'); }

test('CxC exige caja abierta para abono en efectivo y mantiene aislamiento', async () => {
  const api = await read('app/api/receivables/route.ts');
  const sql = await read('supabase/migrations/20260914000007_p1_erp_flows.sql');
  assert.match(api, /method === 'cash'/);
  assert.match(api, /cash_sessions/);
  assert.match(sql, /target_payment_method='cash'/);
  assert.match(sql, /PAYMENT_EXCEEDS_BALANCE/);
});

test('compras soportan orden y recepción parcial sin exceder pendiente', async () => {
  const api = await read('app/api/purchases/route.ts');
  const sql = await read('supabase/migrations/20260914000007_p1_erp_flows.sql');
  assert.match(api, /create_purchase_order/);
  assert.match(api, /receive_purchase_partial/);
  assert.match(sql, /received_quantity/);
  assert.match(sql, /RECEIPT_EXCEEDS_PENDING/);
  assert.match(sql, /'partial'/);
});

test('devoluciones distinguen reingreso y merma', async () => {
  const api = await read('app/api/sales/returns/route.ts');
  const ui = await read('app/workspace/returns/page.tsx');
  const sql = await read('supabase/migrations/20260914000007_p1_erp_flows.sql');
  assert.match(api, /stockDisposition/);
  assert.match(ui, /Registrar como merma/);
  assert.match(sql, /target_stock_disposition/);
  assert.match(sql, /'scrap'/);
});

test('las notas de crédito y pagos siguen siendo RPC-only', async () => {
  const note = await read('app/api/receivables/credit-notes/route.ts');
  const payment = await read('app/api/receivables/route.ts');
  assert.match(note, /rpc\('create_credit_note'/);
  assert.match(payment, /rpc\('record_receivable_payment'/);
  assert.doesNotMatch(note, /\.from\('credit_notes'\)\.insert/);
  assert.doesNotMatch(payment, /\.from\('receivable_payments'\)\.insert/);
});
