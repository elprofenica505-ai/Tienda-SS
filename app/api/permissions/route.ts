import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantMember, tenantErrorResponse, TenantRole } from '@/lib/tenant';
import { normalizePermissions, permissionModules } from '@/lib/permissions';

export const runtime = 'nodejs';
const managerRoles: TenantRole[] = ['owner', 'admin', 'gerente'];
const roleOrder: TenantRole[] = [
  'owner', 'admin', 'gerente', 'supervisor_sucursal', 'vendedor', 'cajero',
  'bodega', 'compras', 'chofer', 'despachador', 'solo_lectura',
];
const editableRoles: TenantRole[] = roleOrder.filter((role) => role !== 'owner');

function responseFor(error: unknown) {
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantMember(request);
    const result = await getSupabaseServer().from('tenant_settings').select('value').eq('tenant_id', context.tenantId).eq('setting_key', 'permissions').maybeSingle();
    if (result.error) throw new Error(result.error.message);
    const value = result.data?.value && typeof result.data.value === 'object' ? result.data.value as Record<string, unknown> : {};
    const roles = Object.fromEntries(roleOrder.map((role) => [role, normalizePermissions(value[role] as Record<string, unknown> | undefined, role)]));
    return NextResponse.json({ ok: true, modules: permissionModules, roles });
  } catch (error: unknown) {
    return responseFor(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireTenantMember(request, managerRoles);
    const body = await request.json();
    const role = typeof body.role === 'string' ? body.role as TenantRole : null;
    if (!role || !editableRoles.includes(role)) return NextResponse.json({ error: 'Rol no editable.' }, { status: 400 });
    const permissions = normalizePermissions(body.permissions, role);
    const supabase = getSupabaseServer();
    const current = await supabase.from('tenant_settings').select('value').eq('tenant_id', context.tenantId).eq('setting_key', 'permissions').maybeSingle();
    if (current.error) throw new Error(current.error.message);
    const value = current.data?.value && typeof current.data.value === 'object' ? current.data.value as Record<string, unknown> : {};
    value[role] = permissions;
    const result = await supabase.from('tenant_settings').upsert({
      tenant_id: context.tenantId,
      setting_key: 'permissions',
      value,
      updated_by: context.uid,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,setting_key' });
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ ok: true, role, permissions });
  } catch (error: unknown) {
    return responseFor(error);
  }
}
