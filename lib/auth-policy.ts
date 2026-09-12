import type { DecodedIdToken } from 'firebase-admin/auth';

const DEFAULT_MAX_SESSION_AGE_SECONDS = 12 * 60 * 60;

export function normalizeAuthEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidAuthEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.\S+$/.test(normalizeAuthEmail(value));
}

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
    // Production requires MFA for administrative tenant roles. The explicit
    // flag remains useful for staging/security tests without changing local
    // development behavior.
    requireMfaForAdmin: process.env.VERCEL_ENV === 'production' || process.env.AUTH_REQUIRE_MFA_ADMIN === 'true',
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

export function assertTenantSessionNotRevoked(token: DecodedIdToken, revokedAt: unknown): void {
  if (!revokedAt || typeof token.auth_time !== 'number') return;
  const revokedAtSeconds = revokedAt instanceof Date
    ? Math.floor(revokedAt.getTime() / 1000)
    : typeof revokedAt === 'number'
      ? Math.floor(revokedAt / 1000)
      : revokedAt && typeof (revokedAt as { toMillis?: () => number }).toMillis === 'function'
        ? Math.floor((revokedAt as { toMillis: () => number }).toMillis() / 1000)
        : NaN;
  if (Number.isFinite(revokedAtSeconds) && token.auth_time <= revokedAtSeconds) throw new Error('SESSION_REVOKED');
}
