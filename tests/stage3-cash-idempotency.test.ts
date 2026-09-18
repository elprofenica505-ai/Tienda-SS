import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260918000003_stage3_cash_and_idempotency.sql');
const sales = read('app/api/sales/route.ts');
const checkout = read('app/api/presales/checkout/route.ts');
const returnsApi = read('app/api/sales/returns/route.ts');
const cashApi = read('app/api/cash-sessions/route.ts');

test('la base impide dos sesiones abiertas por usuario y sucursal', () => {
  assert.match(migration, /cash_sessions_one_open_per_user_branch_idx/);
  assert.match(migration, /unique index[\s\S]*cash_sessions[\s\S]*tenant_id, branch_id, opened_by/);
  assert.match(migration, /where status = 'open' and opened_by is not null/);
});

test('ventas y checkout usan precios e impuestos calculados en servidor', () => {
  assert.match(migration, /erp_server_price_items/);
  assert.match(migration, /product_row\.price/);
  assert.match(migration, /product_row\.tax_rate/);
  assert.match(migration, /- 'taxAmount'/);
  assert.match(sales, /rpc\('create_sale_server_priced'/);
  assert.match(sales, /rpc\('create_sale_with_payments_server_priced'/);
  assert.match(checkout, /rpc\('create_sale_server_priced'/);
  assert.match(checkout, /rpc\('create_sale_with_payments_server_priced'/);
});

test('las llaves de idempotencia se propagan en cobros y checkout', () => {
  assert.match(sales, /request\.headers\.get\('idempotency-key'\)/);
  assert.match(sales, /target_idempotency_key/);
  assert.match(checkout, /target_idempotency_key: `presale:\$\{presaleId\}`/);
  assert.match(migration, /sales_tenant_idempotency_idx|idempotency/);
});

test('las devoluciones tienen idempotencia obligatoria y replay seguro', () => {
  assert.match(returnsApi, /idempotencyKey/);
  assert.match(returnsApi, /IDEMPOTENCY_KEY_REQUIRED|obligatoria para devoluciones/);
  assert.match(returnsApi, /rpc\('create_sale_return_idempotent'/);
  assert.match(migration, /sale_returns_tenant_idempotency_idx/);
  assert.match(migration, /replayed/);
});

test('la operación de caja sigue delegada en una RPC transaccional', () => {
  assert.match(cashApi, /rpc\('cash_session_action'/);
  assert.match(migration, /cash_sessions_one_open_per_user_branch_idx/);
});
