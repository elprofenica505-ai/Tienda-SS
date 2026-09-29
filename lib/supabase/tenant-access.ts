import { NextRequest } from 'next/server';
import { assertTokenSessionPolicy } from '@/lib/auth-policy';
import { consumeDistributedRateLimits, getClientAddress } from '@/lib/rate-limit';
import { normalizePermissions } from '@/lib/permissions';
import type { PermissionAction, PermissionModule } from '@/lib/permissions';
import { findMembership, toTenantContext } from '@/lib/repositories/organization-repository';
import { getSupabaseServer } from '@/lib/supabase/server';

export async function requireSupabaseTenantPermission(request: NextRequest, module: PermissionModule, action: PermissionAction) {
  const header = request.headers.get('authorization')?.trim() || '';
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1].trim();
  if (!token) throw new Error('UNAUTHENTICATED');
  let user;
  try {
    const result = await getSupabaseServer().auth.getUser(token);
    if (result.error || !result.data.user) throw new Error('UNAUTHENTICATED');
    user = result.data.user;
  } catch {
    throw new Error('UNAUTHENTICATED');
  }
  const tenantId = request.headers.get('x-tenant-id')?.trim();
  if (!tenantId) throw new Error('TENANT_REQUIRED');
  const membership = await findMembership(tenantId, user.id);
  const context = toTenantContext(tenantId, user.id, membership);
  try {
    assertTokenSessionPolicy({
      uid: user.id,
      email: user.email,
      email_verified: Boolean(user.email_confirmed_at),
      auth_time: Math.floor(new Date(user.last_sign_in_at || user.created_at).getTime() / 1000),
    } as never, context.role);
  } catch (error) {
    if (error instanceof Error && ['EMAIL_NOT_VERIFIED', 'SESSION_EXPIRED', 'MFA_REQUIRED'].includes(error.message)) throw error;
    throw new Error('FORBIDDEN');
  }
  const rate = await consumeDistributedRateLimits({ endpoint: request.nextUrl.pathname, ip: getClientAddress(request), uid: user.id, tenantId }, { ip: 120, uid: 300, tenant: 1_000, endpoint: 2_000, composite: 100 }, 60_000);
  if (!rate.allowed) throw new Error(`RATE_LIMITED:${rate.blockedBy || 'composite'}:${rate.retryAfterSeconds}`);
  if (context.role !== 'owner') {
    const settings = await getSupabaseServer().from('tenant_settings').select('value').eq('tenant_id', context.tenantId).eq('setting_key', 'permissions').maybeSingle();
    if (settings.error) throw new Error(settings.error.message);
    const saved = settings.data?.value && typeof settings.data.value === 'object' ? settings.data.value as Record<string, unknown> : undefined;
    const permissions = normalizePermissions(saved?.[context.role] as Record<string, unknown> | undefined, context.role);
    if (!permissions[module][action]) throw new Error('FORBIDDEN');
  }
  return context;
}
