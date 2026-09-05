import { NextRequest } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { normalizePermissions } from '@/lib/permissions';
import type { PermissionAction, PermissionModule } from '@/lib/permissions';

export type TenantRole =
  | 'owner'
  | 'admin'
  | 'jefe'
  | 'vendedor'
  | 'bodega'
  | 'chofer'
  | 'cajero';

export interface TenantContext {
  uid: string;
  tenantId: string;
  role: TenantRole;
  email?: string;
}

export async function requireTenantMember(
  request: NextRequest,
  allowedRoles?: TenantRole[]
): Promise<TenantContext> {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7).trim()
    : '';

  if (!token) {
    throw new Error('UNAUTHENTICATED');
  }

  const decoded = await getAdminAuth().verifyIdToken(token);
  const requestedTenant = request.headers.get('x-tenant-id')?.trim();

  if (!requestedTenant) {
    throw new Error('TENANT_REQUIRED');
  }

  const member = await getAdminDb()
    .collection('tenants')
    .doc(requestedTenant)
    .collection('members')
    .doc(decoded.uid)
    .get();

  if (!member.exists || member.data()?.status !== 'active') {
    throw new Error('FORBIDDEN');
  }

  const role = member.data()?.role as TenantRole;

  if (allowedRoles && !allowedRoles.includes(role)) {
    throw new Error('FORBIDDEN');
  }

  return {
    uid: decoded.uid,
    tenantId: requestedTenant,
    role,
    email: decoded.email
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

  return { status: 500, body: { error: 'Error interno del servidor.' } };
}
