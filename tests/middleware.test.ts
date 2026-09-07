import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

function request(path: string, headers?: Record<string, string>) {
  return new NextRequest(`http://localhost${path}`, { headers });
}

test('middleware bloquea una API protegida sin autenticación', async () => {
  const response = middleware(request('/api/catalog'));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await response.json()).error, 'Autenticación requerida.');
});

test('middleware bloquea una API protegida sin tenant', async () => {
  const response = middleware(request('/api/catalog', { Authorization: 'Bearer token' }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Falta identificar la empresa.');
});

test('middleware permite descubrir el tenant sin cabecera previa', () => {
  const response = middleware(request('/api/tenants/me', { Authorization: 'Bearer token' }));
  assert.equal(response.status, 200);
});

test('middleware permite el health check público con cabeceras de seguridad', () => {
  const response = middleware(request('/api/health'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
});
