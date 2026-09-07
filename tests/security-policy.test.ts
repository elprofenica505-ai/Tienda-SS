import assert from 'node:assert/strict';
import test from 'node:test';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { assertTokenSessionPolicy } from '@/lib/auth-policy';
import { assertBranchAccess, assertWritableFields, filterByBranch } from '@/lib/data-scope';
import { buildRateLimitKey } from '@/lib/rate-limit';

const baseToken = {
  auth_time: 1_000,
  email_verified: true,
  firebase: { sign_in_provider: 'password' },
} as unknown as { auth_time: number; email_verified: boolean; firebase: { sign_in_provider: string } };

test('la política rechaza sesiones antiguas y exige MFA a administradores', () => {
  assert.throws(() => assertTokenSessionPolicy(baseToken as unknown as DecodedIdToken, 'admin', 1_000 + 12 * 60 * 60 + 1), /SESSION_EXPIRED/);
  assert.throws(() => assertTokenSessionPolicy(baseToken as unknown as DecodedIdToken, 'admin', 1_001), /MFA_REQUIRED/);
});

test('la política exige correo verificado', () => {
  assert.throws(() => assertTokenSessionPolicy({ ...baseToken, email_verified: false } as unknown as DecodedIdToken, 'vendedor', 1_001), /EMAIL_NOT_VERIFIED/);
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

test('las dimensiones de rate limiting aíslan endpoint, IP, uid y tenant', () => {
  assert.notEqual(
    buildRateLimitKey({ endpoint: '/api/sales', ip: '1.1.1.1', uid: 'u1', tenantId: 't1' }),
    buildRateLimitKey({ endpoint: '/api/sales', ip: '1.1.1.1', uid: 'u1', tenantId: 't2' }),
  );
});
