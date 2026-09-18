import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260918000007_stage7_accounts_payable.sql');
const purchases = read('app/api/purchases/route.ts');
const payables = read('app/api/payables/route.ts');

test('la recepción crea compra e instancia de payable en una sola RPC', () => {
  assert.match(migration, /create table if not exists public\.payables/);
  assert.match(migration, /receive_purchase_with_payable/);
  assert.match(migration, /public\.receive_purchase\(/);
  assert.match(migration, /insert into public\.payables/);
  assert.match(migration, /target_purchase_id|purchase_id/);
  assert.match(purchases, /rpc\('receive_purchase_with_payable'/);
});

test('payables conserva saldo original, pendiente y estados', () => {
  assert.match(migration, /original_amount numeric/);
  assert.match(migration, /outstanding_amount numeric/);
  assert.match(migration, /status text not null default 'open'/);
  assert.match(migration, /next_status := case when remaining <= 0 then 'paid' else 'partial' end/);
  assert.match(migration, /update public\.payables set outstanding_amount = remaining, status = next_status/);
});

test('los pagos a proveedores son idempotentes y serializados', () => {
  assert.match(migration, /payable_payments/);
  assert.match(migration, /idempotency_key text/);
  assert.match(migration, /payable_payments_tenant_idempotency_idx/);
  assert.match(migration, /payable_payment_idempotent/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /replayed.*true/);
  assert.match(payables, /idempotency-key/);
  assert.match(payables, /payable_payment_idempotent/);
});

test('los pagos registran egreso de caja o banco', () => {
  assert.match(migration, /financial_outflows/);
  assert.match(migration, /channel_value := case when target_payment_method = 'cash' then 'cash' else 'bank' end/);
  assert.match(migration, /insert into public\.financial_outflows/);
  assert.match(migration, /insert into public\.cash_movements/);
  assert.match(migration, /'withdrawal'/);
});

test('las RPCs nuevas quedan restringidas a service_role y por tenant', () => {
  assert.match(migration, /tenant_id, purchase_id/);
  assert.match(migration, /tenant_id, idempotency_key/);
  assert.match(migration, /revoke all on function public\.receive_purchase_with_payable/);
  assert.match(migration, /grant execute on function public\.payable_payment_idempotent[\s\S]*to service_role/);
  assert.match(migration, /tenant_id = target_tenant_id/);
});
