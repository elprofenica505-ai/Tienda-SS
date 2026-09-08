import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST as loginAttempt } from '@/app/api/auth/login-attempt/route';
import { POST as tenantSignup } from '@/app/api/tenants/route';
import { superadminErrorResponse } from '@/lib/superadmin';
import { tenantErrorResponse } from '@/lib/tenant';

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('login preflight rechaza payload malformado sin consultar Firebase Auth', async () => {
  const response = await loginAttempt(request('/api/auth/login-attempt', { email: 'no-es-correo' }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Correo inválido.');
});

test('alta pública rechaza el honeypot anti-bot', async () => {
  const response = await tenantSignup(request('/api/tenants', {
    name: 'Bot Company',
    ownerName: 'Bot User',
    email: 'bot@example.com',
    password: 'password123',
    website: 'filled-by-bot',
  }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'No se pudo crear la empresa.');
});

test('errores públicos no filtran mensajes de proveedores ni secretos', () => {
  const tenantError = tenantErrorResponse(new Error('FIREBASE_SERVICE_ACCOUNT_KEY=private-value'));
  const superadminError = superadminErrorResponse(new Error('stripe_secret_key=private-value'));
  assert.equal(tenantError.status, 500);
  assert.equal(superadminError.status, 500);
  assert.doesNotMatch(JSON.stringify(tenantError.body), /private-value|SERVICE_ACCOUNT_KEY/);
  assert.doesNotMatch(JSON.stringify(superadminError.body), /private-value|stripe_secret_key/);
});
