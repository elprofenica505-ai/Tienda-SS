import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '@/app/api/health/route';

test('health check devuelve estado operativo y no cachea la respuesta', async () => {
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, 'tienda-ss');
  assert.equal(typeof body.timestamp, 'string');
});
