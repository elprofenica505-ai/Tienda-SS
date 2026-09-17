import { NextRequest } from 'next/server';
import { assertTokenSessionPolicy } from '@/lib/auth-policy';
import { consumeDistributedRateLimits, getClientAddress } from '@/lib/rate-limit';
import { normalizePermissions } from '@/lib/permissions';
import type { PermissionAction, PermissionModule } from '@/lib/permissions';
import { entitlementErrorResponse } from '@/lib/entitlement-guard';
import { getSupabaseServer } from '@/lib/supabase/server';
import { findMembership } from '@/lib/repositories/organization-repository';

export type TenantRole =
  | 'owner' | 'admin' | 'gerente' | 'supervisor_sucursal' | 'vendedor' | 'cajero'
  | 'bodega' | 'compras' | 'chofer' | 'despachador' | 'solo_lectura' | 'jefe';

export interface TenantContext {
  uid: string;
  tenantId: string;
  role: TenantRole;
  email?: string;
  branchIds: string[];
  subscriptionStatus?: string;
}

const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const TENANT_ROLES: readonly TenantRole[] = ['owner', 'admin', 'gerente', 'supervisor_sucursal', 'vendedor', 'cajero', 'bodega', 'compras', 'chofer', 'despachador', 'solo_lectura', 'jefe'];

function isTenantRole(value: unknown): value is TenantRole { return typeof value === 'string' && TENANT_ROLES.includes(value as TenantRole); }
function getBearerToken(request: NextRequest): string { const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization')?.trim() || ''); return match?.[1].trim() || ''; }

export async function requireTenantMember(request: NextRequest, allowedRoles?: TenantRole[]): Promise<TenantContext> {
  const token = getBearerToken(request);
  if (!token) throw new Error('UNAUTHENTICATED');
  const auth = await getSupabaseServer().auth.getUser(token);
  if (auth.error || !auth.data.user) throw new Error('UNAUTHENTICATED');
  const requestedTenant = request.headers.get('x-tenant-id')?.trim();
  if (!requestedTenant || !TENANT_ID_PATTERN.test(requestedTenant)) throw new Error('TENANT_REQUIRED');
  const membership = await findMembership(requestedTenant, auth.data.user.id);
  if (!membership || membership.tenant.status !== 'active') throw new Error('FORBIDDEN');
  const roleValue = membership.member.role;
  if (!isTenantRole(roleValue)) throw new Error('FORBIDDEN');
  const role = roleValue;
  const policyToken = {
    uid: auth.data.user.id,
    email: auth.data.user.email,
    email_verified: Boolean(auth.data.user.email_confirmed_at),
    auth_time: Math.floor(new Date(auth.data.user.last_sign_in_at || auth.data.user.created_at).getTime() / 1000),
  } as never;
  try {
    assertTokenSessionPolicy(policyToken, role);
  } catch (error) {
    if (error instanceof Error && ['EMAIL_NOT_VERIFIED', 'SESSION_EXPIRED', 'MFA_REQUIRED'].includes(error.message)) throw error;
    throw new Error('FORBIDDEN');
  }
  const rate = await consumeDistributedRateLimits({ endpoint: request.nextUrl.pathname, ip: getClientAddress(request), uid: auth.data.user.id, tenantId: membership.tenant.id }, { ip: 120, uid: 300, tenant: 1_000, endpoint: 2_000, composite: 100 }, 60_000);
  if (!rate.allowed) throw new Error(`RATE_LIMITED:${rate.blockedBy || 'composite'}:${rate.retryAfterSeconds}`);
  if (allowedRoles && !allowedRoles.includes(role)) throw new Error('FORBIDDEN');
  return {
    uid: auth.data.user.id,
    tenantId: membership.tenant.id,
    role,
    email: auth.data.user.email,
    branchIds: membership.branchIds,
    subscriptionStatus: typeof membership.tenant.subscription_status === 'string' ? membership.tenant.subscription_status : undefined,
  };
}

export async function requireTenantPermission(request: NextRequest, module: PermissionModule, action: PermissionAction): Promise<TenantContext> {
  const context = await requireTenantMember(request);
  if (['create', 'edit', 'delete', 'export'].includes(action) && ['past_due', 'canceled', 'unpaid', 'incomplete_expired'].includes(context.subscriptionStatus || '')) throw new Error('SUBSCRIPTION_RESTRICTED');
  if (context.role === 'owner') return context;
  const settings = await getSupabaseServer().from('tenant_settings').select('value').eq('tenant_id', context.tenantId).eq('setting_key', 'permissions').maybeSingle();
  if (settings.error) throw new Error(settings.error.message);
  const saved = settings.data?.value && typeof settings.data.value === 'object' ? settings.data.value as Record<string, unknown> : undefined;
  const permissions = normalizePermissions(saved?.[context.role] as Record<string, unknown> | undefined, context.role);
  if (!permissions[module][action]) throw new Error('FORBIDDEN');
  return context;
}

export function tenantErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : 'UNKNOWN';
  const entitlementResponse = entitlementErrorResponse(error);
  if (entitlementResponse) return entitlementResponse;
  if (code.startsWith('SUPABASE_') || code.includes('relation') || code.includes('schema cache')) return { status: 503, body: { error: 'La conexión del servidor con Supabase no está configurada correctamente.' } };
  if (code === 'UNAUTHENTICATED') return { status: 401, body: { error: 'Autenticación requerida.' } };
  if (code === 'TENANT_REQUIRED') return { status: 400, body: { error: 'Falta identificar la empresa.' } };
  if (code === 'FORBIDDEN') return { status: 403, body: { error: 'No tienes permiso para esta empresa.' } };
  if (code === 'BRANCH_OUT_OF_SCOPE') return { status: 403, body: { error: 'No tienes permisos para esa sucursal.', code } };
  if (code === 'BRANCH_NOT_FOUND') return { status: 404, body: { error: 'La sucursal no existe o no está activa.', code } };
  if (code === 'EMAIL_NOT_VERIFIED') return { status: 403, body: { error: 'Verifica tu correo electrónico antes de continuar.', code } };
  if (code === 'SESSION_EXPIRED') return { status: 401, body: { error: 'Tu sesión expiró. Inicia sesión nuevamente.', code } };
  if (code === 'MFA_REQUIRED') return { status: 403, body: { error: 'La autenticación multifactor es obligatoria para este rol.', code } };
  if (code === 'SUBSCRIPTION_RESTRICTED') return { status: 402, body: { error: 'Tu suscripción requiere atención para continuar con esta operación.', code, upgradeUrl: '/workspace/billing' } };
  if (code.startsWith('RATE_LIMITED:')) { const [, scope, retryAfter] = code.split(':'); return { status: 429, body: { error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.', code: 'RATE_LIMITED', scope, retryAfterSeconds: Number(retryAfter) || 1 } }; }
  if (/function .* does not exist|Could not find the function|42883|42P01|schema cache/i.test(code)) return { status: 503, body: { error: 'El módulo no está actualizado en Supabase. Ejecuta las migraciones pendientes.', code: 'DATABASE_MIGRATION_REQUIRED' } };
  if (/permission denied|42501|invalid jwt|JWT expired|PGRST301/i.test(code)) return { status: 403, body: { error: 'La operación fue rechazada por la configuración de seguridad.', code: 'DATABASE_PERMISSION_DENIED' } };
  if (/duplicate key|23505/i.test(code)) return { status: 409, body: { error: 'El registro ya existe o la operación ya fue procesada.', code: 'DUPLICATE_RECORD' } };
  if (/foreign key|23503|violates check|23514/i.test(code)) return { status: 409, body: { error: 'La operación no es válida con los datos relacionados actuales.', code: 'DATA_CONSTRAINT' } };
  return { status: 500, body: { error: 'Error interno del servidor.' } };
}
