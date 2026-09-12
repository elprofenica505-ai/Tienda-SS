import assert from 'node:assert/strict';
import test from 'node:test';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { assertTenantSessionNotRevoked, assertTokenSessionPolicy, isValidAuthEmail, normalizeAuthEmail } from '@/lib/auth-policy';
import { assertBranchAccess, assertWritableFields, filterByBranch } from '@/lib/data-scope';
import { filterOrganizationMembers } from '@/lib/organization';
import { buildRateLimitKey } from '@/lib/rate-limit';

const baseToken = {
  auth_time: 1_000,
  email_verified: true,
  firebase: { sign_in_provider: 'password' },
} as unknown as { auth_time: number; email_verified: boolean; firebase: { sign_in_provider: string } };

test('la política rechaza sesiones antiguas y no bloquea MFA por defecto', () => {
  assert.throws(() => assertTokenSessionPolicy(baseToken as unknown as DecodedIdToken, 'admin', 1_000 + 12 * 60 * 60 + 1), /SESSION_EXPIRED/);
  assert.doesNotThrow(() => assertTokenSessionPolicy(baseToken as unknown as DecodedIdToken, 'admin', 1_001));
});

test('MFA administrativo permanece disponible como opción explícita', () => {
  const previous = process.env.AUTH_REQUIRE_MFA_ADMIN;
  process.env.AUTH_REQUIRE_MFA_ADMIN = 'true';
  try {
    assert.throws(() => assertTokenSessionPolicy(baseToken as unknown as DecodedIdToken, 'admin', 1_001), /MFA_REQUIRED/);
  } finally {
    if (previous === undefined) delete process.env.AUTH_REQUIRE_MFA_ADMIN;
    else process.env.AUTH_REQUIRE_MFA_ADMIN = previous;
  }
});

test('MFA administrativo se exige automáticamente en producción', () => {
  const previousVercelEnv = process.env.VERCEL_ENV;
  const previousFlag = process.env.AUTH_REQUIRE_MFA_ADMIN;
  process.env.VERCEL_ENV = 'production';
  delete process.env.AUTH_REQUIRE_MFA_ADMIN;
  try {
    assert.throws(() => assertTokenSessionPolicy(baseToken as unknown as DecodedIdToken, 'owner', 1_001), /MFA_REQUIRED/);
    assert.throws(() => assertTokenSessionPolicy(baseToken as unknown as DecodedIdToken, 'admin', 1_001), /MFA_REQUIRED/);
  } finally {
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
    if (previousFlag === undefined) delete process.env.AUTH_REQUIRE_MFA_ADMIN;
    else process.env.AUTH_REQUIRE_MFA_ADMIN = previousFlag;
  }
});

test('recuperación normaliza y valida el correo de forma determinista', () => {
  assert.equal(normalizeAuthEmail('  Admin@Example.COM '), 'admin@example.com');
  assert.equal(isValidAuthEmail('admin@example.com'), true);
  assert.equal(isValidAuthEmail('correo-inválido'), false);
});

test('la política exige correo verificado', () => {
  assert.throws(() => assertTokenSessionPolicy({ ...baseToken, email_verified: false } as unknown as DecodedIdToken, 'vendedor', 1_001), /EMAIL_NOT_VERIFIED/);
});

test('la revocación por tenant bloquea tokens anteriores y permite tokens posteriores', () => {
  const revokedAt = new Date(2_000 * 1000);
  assert.throws(() => assertTenantSessionNotRevoked({ ...baseToken, auth_time: 2_000 } as unknown as DecodedIdToken, revokedAt), /SESSION_REVOKED/);
  assert.doesNotThrow(() => assertTenantSessionNotRevoked({ ...baseToken, auth_time: 2_001 } as unknown as DecodedIdToken, revokedAt));
  assert.doesNotThrow(() => assertTenantSessionNotRevoked({ ...baseToken, auth_time: 1_000 } as unknown as DecodedIdToken, undefined));
});

test('roles operativos solo leen su sucursal y no reciben campos sensibles', () => {
  const context = { role: 'vendedor' as const, branchIds: ['branch-a'] };
  assertBranchAccess(context, 'branch-a');
  assert.throws(() => assertBranchAccess(context, 'branch-b'), /BRANCH_OUT_OF_SCOPE/);
  const rows = filterByBranch([
    { id: '1', branchId: 'branch-a', price: 10, cost: 6 },
    { id: '2', branchId: 'branch-b', price: 20, cost: 12 },
  ], context);
  assert.deepEqual(rows, [{ id: '1', branchId: 'branch-a', price: 10 }]);
  assert.throws(() => assertWritableFields({ branchId: 'branch-a' }, { cost: 5 }, context), /FIELD_OUT_OF_SCOPE/);
});

test('el directorio organizativo no expone miembros de otra sucursal', () => {
  const members = [
    { uid: 'a', branchIds: ['branch-a'] },
    { uid: 'b', branchIds: ['branch-b'] },
    { uid: 'ab', branchIds: ['branch-a', 'branch-b'] },
  ];
  assert.deepEqual(filterOrganizationMembers(members, 'vendedor', ['branch-a']).map((member) => member.uid), ['a', 'ab']);
  assert.equal(filterOrganizationMembers(members, 'admin', ['branch-a']).length, 3);
});

test('las dimensiones de rate limiting aíslan endpoint, IP, uid y tenant', () => {
  assert.notEqual(
    buildRateLimitKey({ endpoint: '/api/sales', ip: '1.1.1.1', uid: 'u1', tenantId: 't1' }),
    buildRateLimitKey({ endpoint: '/api/sales', ip: '1.1.1.1', uid: 'u1', tenantId: 't2' }),
  );
});
