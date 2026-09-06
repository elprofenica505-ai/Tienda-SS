import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeRateLimit } from '@/lib/rate-limit';

test('permite solicitudes hasta el límite y bloquea la siguiente', () => {
  const key = `test-${Date.now()}-limit`;
  const now = 1_000_000;
  assert.equal(consumeRateLimit(key, 2, 60_000, now).allowed, true);
  assert.equal(consumeRateLimit(key, 2, 60_000, now + 1).allowed, true);
  const blocked = consumeRateLimit(key, 2, 60_000, now + 2);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test('reinicia el contador cuando expira la ventana', () => {
  const key = `test-${Date.now()}-expiry`;
  const now = 2_000_000;
  assert.equal(consumeRateLimit(key, 1, 1_000, now).allowed, true);
  assert.equal(consumeRateLimit(key, 1, 1_000, now + 1).allowed, false);
  assert.equal(consumeRateLimit(key, 1, 1_000, now + 1_001).allowed, true);
});
