import { NextRequest } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { assertTokenSessionPolicy } from '@/lib/auth-policy';
import { normalizePermissions } from '@/lib/permissions';
import type { PermissionAction, PermissionModule } from '@/lib/permissions';

export type TenantRole =
  | 'owner'
  | 'admin'
  | 'gerente'
  | 'supervisor_sucursal'
  | 'vendedor'
  | 'cajero'
  | 'bodega'
  | 'compras'
  | 'chofer'
  | 'despachador'
  | 'solo_lectura'
  | 'jefe';

export interface TenantContext {
  uid: string;
  tenantId: string;
  role: TenantRole;
  email?: string;
  branchIds: string[];
}

const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const TENANT_ROLES: readonly TenantRole[] = [
  'owner',
  'admin',
  'gerente',
  'supervisor_sucursal',
  'vendedor',
  'cajero',
  'bodega',
  'compras',
  'chofer',
  'despachador',
  'solo_lectura',
  'jefe',
];

function isTenantRole(value: unknown): value is TenantRole {
  return typeof value === 'string' && TENANT_ROLES.includes(value as TenantRole);
}

function getBearerToken(request: NextRequest): string {
  const header = request.headers.get('authorization')?.trim() || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1].trim() || '';
}

export async function requireTenantMember(
  request: NextRequest,
  allowedRoles?: TenantRole[]
): Promise<TenantContext> {
  const token = getBearerToken(request);
  if (!token) {
    throw new Error('UNAUTHENTICATED');
  }

  const decoded = await getAdminAuth().verifyIdToken(token, true);
  const requestedTenant = request.headers.get('x-tenant-id')?.trim();

  if (!requestedTenant) {
    throw new Error('TENANT_REQUIRED');
  }
  if (!TENANT_ID_PATTERN.test(requestedTenant)) {
    throw new Error('TENANT_REQUIRED');
  }

  const tenantRef = getAdminDb().collection('tenants').doc(requestedTenant);
  const tenantSnapshot = await tenantRef.get();
  if (tenantSnapshot.exists && tenantSnapshot.data()?.platformStatus === 'suspended') {
    throw new Error('FORBIDDEN');
  }

  const member = await tenantRef
    .collection('members')
    .doc(decoded.uid)
    .get();

  if (!member.exists || member.data()?.status !== 'active') {
    throw new Error('FORBIDDEN');
  }

  const roleValue = member.data()?.role;
  if (!isTenantRole(roleValue)) {
    throw new Error('FORBIDDEN');
  }
  const role = roleValue;
  try {
    assertTokenSessionPolicy(decoded, role);
  } catch (error) {
    if (error instanceof Error && ['EMAIL_NOT_VERIFIED', 'SESSION_EXPIRED', 'MFA_REQUIRED'].includes(error.message)) {
      throw error;
    }
    throw new Error('FORBIDDEN');
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    throw new Error('FORBIDDEN');
  }

  const rawBranchIds = member.data()?.branchIds;
  const branchIds = Array.isArray(rawBranchIds)
    ? rawBranchIds.filter((value): value is string => typeof value === 'string').slice(0, 100)
    : [];

  return {
    uid: decoded.uid,
    tenantId: requestedTenant,
    role,
    email: decoded.email,
    branchIds,
  };
}

export async function requireTenantPermission(
  request: NextRequest,
  module: PermissionModule,
  action: PermissionAction
): Promise<TenantContext> {
  const context = await requireTenantMember(request);
  if (context.role === 'owner') return context;
  const settings = await getAdminDb().collection('tenants').doc(context.tenantId).collection('settings').doc('permissions').get();
  const saved = settings.exists ? settings.data()?.roles : undefined;
  const permissions = normalizePermissions((saved as Record<string, unknown> | undefined)?.[context.role], context.role);
  if (!permissions[module][action]) throw new Error('FORBIDDEN');
  return context;
}

export function tenantErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : 'UNKNOWN';

  if (code === 'UNAUTHENTICATED') {
    return { status: 401, body: { error: 'Autenticación requerida.' } };
  }

  if (code === 'TENANT_REQUIRED') {
    return { status: 400, body: { error: 'Falta identificar la empresa.' } };
  }

  if (code === 'FORBIDDEN') {
    return { status: 403, body: { error: 'No tienes permiso para esta empresa.' } };
  }

  if (code === 'EMAIL_NOT_VERIFIED') {
    return { status: 403, body: { error: 'Verifica tu correo electrónico antes de continuar.', code } };
  }

  if (code === 'SESSION_EXPIRED') {
    return { status: 401, body: { error: 'Tu sesión expiró. Inicia sesión nuevamente.', code } };
  }

  if (code === 'MFA_REQUIRED') {
    return { status: 403, body: { error: 'La autenticación multifactor es obligatoria para este rol.', code } };
  }

  return { status: 500, body: { error: 'Error interno del servidor.' } };
}
