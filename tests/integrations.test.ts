import assert from 'node:assert/strict';
import test from 'node:test';
import { createWebhookEnvelope, signWebhook, toCsv, verifyWebhook } from '@/lib/integrations';

test('webhooks se firman, verifican y expiran fuera de tolerancia', () => {
  const payload = JSON.stringify(createWebhookEnvelope('tenant-a', 'sale.created', { total: 10 }, 'evt-1'));
  const signature = signWebhook(payload, 'secret', 1_000);
  assert.equal(verifyWebhook(payload, signature, 'secret', 300, 1_100), true);
  assert.equal(verifyWebhook(payload, signature, 'secret', 300, 1_301), false);
  assert.equal(verifyWebhook(payload, signature, 'wrong', 300, 1_100), false);
});

test('CSV neutraliza fórmulas y escapa valores', () => {
  assert.equal(toCsv([{ name: '=1+1', note: 'a,b' }], ['name', 'note']), "name,note\n'=1+1,\"a,b\"");
});
