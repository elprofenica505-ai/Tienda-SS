import assert from 'node:assert/strict';
import test from 'node:test';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { assertTokenSessionPolicy, isValidAuthEmail, normalizeAuthEmail } from '@/lib/auth-policy';
import { tenantErrorResponse } from '@/lib/tenant';

function token(overrides: Partial<DecodedIdToken> = {}): DecodedIdToken {
  return {
    aud: 'test-project',
    auth_time: 1_000,
    email: 'admin@example.com',
    email_verified: true,
    exp: 2_000_000,
    firebase: { sign_in_provider: 'password' },
    iat: 1_000,
    iss: 'https://securetoken.google.com/test-project',
    sub: 'uid-1',
    uid: 'uid-1',
    ...overrides,
  } as DecodedIdToken;
}

test('P0.4 integración: usuario operativo verificado con sesión vigente puede continuar', () => {
  assert.doesNotThrow(() => assertTokenSessionPolicy(token(), 'vendedor', 1_001));
});

test('P0.4 integración: correo no verificado se bloquea con respuesta accionable', () => {
  assert.throws(() => assertTokenSessionPolicy(token({ email_verified: false }), 'vendedor', 1_001), /EMAIL_NOT_VERIFIED/);
  assert.deepEqual(tenantErrorResponse(new Error('EMAIL_NOT_VERIFIED')), {
    status: 403,
    body: { error: 'Verifica tu correo electrónico antes de continuar.', code: 'EMAIL_NOT_VERIFIED' },
  });
});

test('P0.4 integración: administrador sin MFA no obtiene acceso y recibe instrucción', () => {
  assert.throws(() => assertTokenSessionPolicy(token(), 'admin', 1_001), /MFA_REQUIRED/);
  assert.deepEqual(tenantErrorResponse(new Error('MFA_REQUIRED')), {
    status: 403,
    body: { error: 'La autenticación multifactor es obligatoria para este rol.', code: 'MFA_REQUIRED' },
  });
});

test('P0.4 integración: sesión expirada obliga a reautenticación', () => {
  assert.throws(() => assertTokenSessionPolicy(token(), 'vendedor', 1_000 + 12 * 60 * 60 + 1), /SESSION_EXPIRED/);
  assert.deepEqual(tenantErrorResponse(new Error('SESSION_EXPIRED')), {
    status: 401,
    body: { error: 'Tu sesión expiró. Inicia sesión nuevamente.', code: 'SESSION_EXPIRED' },
  });
});

test('P0.4 integración: recuperación normaliza y rechaza correos inválidos', () => {
  assert.equal(normalizeAuthEmail(' Admin@Example.COM '), 'admin@example.com');
  assert.equal(isValidAuthEmail('admin@example.com'), true);
  assert.equal(isValidAuthEmail('admin.example.com'), false);
  assert.equal(isValidAuthEmail(''), false);
});
