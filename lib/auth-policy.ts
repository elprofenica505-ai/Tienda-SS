import type { DecodedIdToken } from 'firebase-admin/auth';

const DEFAULT_MAX_SESSION_AGE_SECONDS = 12 * 60 * 60;

export type SessionPolicy = {
  maxAgeSeconds: number;
  requireVerifiedEmail: boolean;
  requireMfaForAdmin: boolean;
};

export function getSessionPolicy(): SessionPolicy {
  const configured = Number(process.env.AUTH_MAX_SESSION_AGE_SECONDS);
  return {
    maxAgeSeconds: Number.isFinite(configured) && configured >= 300 ? configured : DEFAULT_MAX_SESSION_AGE_SECONDS,
    requireVerifiedEmail: process.env.AUTH_REQUIRE_VERIFIED_EMAIL !== 'false',
    requireMfaForAdmin: process.env.AUTH_REQUIRE_MFA_ADMIN !== 'false',
  };
}

export function isAdministrativeRole(role: string): boolean {
  return role === 'owner' || role === 'admin' || role === 'gerente' || role === 'jefe';
}

export function assertTokenSessionPolicy(token: DecodedIdToken, role: string, nowSeconds = Math.floor(Date.now() / 1000)): void {
  const policy = getSessionPolicy();
  if (policy.requireVerifiedEmail && token.email_verified !== true) throw new Error('EMAIL_NOT_VERIFIED');
  if (typeof token.auth_time !== 'number' || nowSeconds - token.auth_time > policy.maxAgeSeconds) throw new Error('SESSION_EXPIRED');
  if (policy.requireMfaForAdmin && isAdministrativeRole(role) && token.firebase?.sign_in_second_factor == null && token.mfa_enrolled !== true) {
    throw new Error('MFA_REQUIRED');
  }
}
