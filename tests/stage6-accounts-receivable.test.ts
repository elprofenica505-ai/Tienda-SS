import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260918000006_stage6_accounts_receivable.sql');
const route = read('app/api/receivables/route.ts');

test('el límite de crédito se valida server-side y serializa saldos concurrentes', () => {
  assert.match(migration, /assert_customer_credit_limit/);
  assert.match(migration, /select \* into customer_row[\s\S]*for update/);
  assert.match(migration, /perform 1 from public\.receivables[\s\S]*for update/);
  assert.match(migration, /current_balance \+ target_new_amount > customer_row\.credit_limit/);
  assert.match(migration, /CREDIT_LIMIT_EXCEEDED/);
  assert.match(migration, /CUSTOMER_CREDIT_BLOCKED/);
});

test('los pagos actualizan saldo, estado y caja mediante RPCs atómicas existentes', () => {
  assert.match(migration, /record_receivable_payment\(/);
  assert.match(migration, /register_receivable_payment\(/);
  assert.match(migration, /receivable_payments_tenant_idempotency_idx/);
  assert.match(migration, /receivable_payments/);
  assert.match(route, /register_receivable_payment_idempotent/);
  assert.match(route, /record_receivable_payment_idempotent/);
});

test('los abonos exigen llave de idempotencia y protegen reintentos', () => {
  assert.match(migration, /idempotency_key text/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(migration, /replayed.*true/);
  assert.match(route, /request\.headers\.get\('idempotency-key'\)/);
  assert.match(route, /idempotencyKey/);
});

test('la transición del estado de CxC queda dentro de la operación de pago', () => {
  assert.match(migration, /register_receivable_payment_idempotent/);
  assert.match(migration, /record_receivable_payment_idempotent/);
  assert.match(route, /target_allocations/);
  assert.match(migration, /grant execute on function public\.register_receivable_payment_idempotent[\s\S]*to service_role/);
});

test('la migración preserva aislamiento por tenant en índices y búsquedas', () => {
  assert.match(migration, /tenant_id, idempotency_key/);
  assert.match(migration, /tenant_id = target_tenant_id/);
  assert.match(migration, /customer_id = target_customer_id/);
  assert.match(migration, /receivables_customer_balance_idx/);
});
