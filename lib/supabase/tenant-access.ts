import { NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebaseAdmin';
import { assertTokenSessionPolicy } from '@/lib/auth-policy';
import { consumeDistributedRateLimits, getClientAddress } from '@/lib/rate-limit';
import { normalizePermissions } from '@/lib/permissions';
import type { PermissionAction, PermissionModule } from '@/lib/permissions';
import { findMembership, toTenantContext } from '@/lib/repositories/organization-repository';

export async function requireSupabaseTenantPermission(request: NextRequest, module: PermissionModule, action: PermissionAction) {
  const header = request.headers.get('authorization')?.trim() || '';
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1].trim();
  if (!token) throw new Error('UNAUTHENTICATED');
  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new Error('UNAUTHENTICATED');
  }
  const tenantId = request.headers.get('x-tenant-id')?.trim();
  if (!tenantId) throw new Error('TENANT_REQUIRED');
  const membership = await findMembership(tenantId, decoded.uid);
  const context = toTenantContext(tenantId, decoded.uid, membership);
  try {
    assertTokenSessionPolicy(decoded, context.role);
  } catch (error) {
    if (error instanceof Error && ['EMAIL_NOT_VERIFIED', 'SESSION_EXPIRED', 'MFA_REQUIRED'].includes(error.message)) throw error;
    throw new Error('FORBIDDEN');
  }
  const rate = await consumeDistributedRateLimits({ endpoint: request.nextUrl.pathname, ip: getClientAddress(request), uid: decoded.uid, tenantId }, { ip: 120, uid: 300, tenant: 1_000, endpoint: 2_000, composite: 100 }, 60_000);
  if (!rate.allowed) throw new Error(`RATE_LIMITED:${rate.blockedBy || 'composite'}:${rate.retryAfterSeconds}`);
  if (context.role !== 'owner') {
    const permissions = normalizePermissions(undefined, context.role);
    if (!permissions[module][action]) throw new Error('FORBIDDEN');
  }
  return context;
}
