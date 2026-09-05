import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantMember, tenantErrorResponse, TenantRole } from '@/lib/tenant';
import { defaultPermissions, normalizePermissions, permissionModules } from '@/lib/permissions';

export const runtime = 'nodejs';
const managerRoles: TenantRole[] = ['owner', 'admin', 'jefe'];
const editableRoles: TenantRole[] = ['admin', 'jefe', 'vendedor', 'bodega', 'chofer', 'cajero'];

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantMember(request);
    const doc = await getAdminDb().collection('tenants').doc(context.tenantId).collection('settings').doc('permissions').get();
    const saved = doc.exists ? doc.data()?.roles : {};
    const roles = Object.fromEntries((['owner', ...editableRoles] as TenantRole[]).map((role) => [role, normalizePermissions((saved as Record<string, unknown> | undefined)?.[role], role)]));
    return NextResponse.json({ ok: true, modules: permissionModules, roles });
  } catch (error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireTenantMember(request, managerRoles);
    const body = await request.json(); const role = typeof body.role === 'string' ? body.role as TenantRole : null;
    if (!role || !editableRoles.includes(role)) return NextResponse.json({ error: 'Rol no editable.' }, { status: 400 });
    const permissions = normalizePermissions(body.permissions, role);
    const ref = getAdminDb().collection('tenants').doc(context.tenantId).collection('settings').doc('permissions');
    await ref.set({ roles: { [role]: permissions }, updatedAt: new Date(), updatedBy: context.uid }, { merge: true });
    return NextResponse.json({ ok: true, role, permissions });
  } catch (error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
