import assert from 'node:assert/strict';
import test from 'node:test';
import { failedEventRetryable, shouldApplyEvent } from '@/lib/stripe';

test('Stripe ignora eventos de suscripción fuera de orden', () => {
  assert.equal(shouldApplyEvent(2_000, 1_999), false);
  assert.equal(shouldApplyEvent(2_000, 2_000), true);
  assert.equal(shouldApplyEvent(undefined, 1), true);
});

test('Stripe permite recuperar eventos fallidos y processing abandonados', () => {
  assert.equal(failedEventRetryable({ status: 'failed', retryCount: 9 }), true);
  assert.equal(failedEventRetryable({ status: 'failed', retryCount: 10 }), false);
  assert.equal(failedEventRetryable({ status: 'processing', processingStartedAt: new Date(0) }, 20 * 60 * 1000), true);
  assert.equal(failedEventRetryable({ status: 'processing', processingStartedAt: new Date(19 * 60 * 1000) }, 20 * 60 * 1000), false);
});
