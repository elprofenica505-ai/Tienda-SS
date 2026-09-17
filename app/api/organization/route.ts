import { NextRequest, NextResponse } from 'next/server';
import { requireSupabaseTenantPermission } from '@/lib/supabase/tenant-access';
import { getSupabaseServer } from '@/lib/supabase/server';
import { tenantErrorResponse } from '@/lib/tenant';
import { assertOrganizationResource, branchIdsFrom, filterOrganizationMembers, organizationName, organizationParentId, safeCode, type OrganizationResource } from '@/lib/organization';
import { countActiveResource, createOrganizationResource, findResource, getOrganization, updateOrganizationResource } from '@/lib/repositories/organization-repository';
import { upsertMemberBranches } from '@/lib/repositories/organization-repository';

export const runtime = 'nodejs';
function text(value: unknown, max = 120) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function responseFor(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('SUPABASE_') || message.includes('relation') || message.includes('schema cache')) return NextResponse.json({ error: 'La conexión del servidor con Supabase no está configurada correctamente.' }, { status: 503 });
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireSupabaseTenantPermission(request, 'dashboard', 'view');
    const organization = await getOrganization(context.tenantId);
    const visibleBranches = ['owner', 'admin', 'gerente', 'jefe'].includes(context.role)
      ? organization.branches
      : organization.branches.filter((branch) => context.branchIds.includes(String(branch.id)));
    const branchSet = new Set(visibleBranches.map((branch) => String(branch.id)));
    return NextResponse.json({ ok: true, organization: {
      branches: visibleBranches,
      warehouses: organization.warehouses.filter((item) => branchSet.has(String(item.branchId))),
      cashRegisters: organization.cashRegisters.filter((item) => branchSet.has(String(item.branchId))),
      members: filterOrganizationMembers(organization.members, context.role, context.branchIds),
    } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { return responseFor(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireSupabaseTenantPermission(request, 'dashboard', 'edit');
    const body = await request.json();
    assertOrganizationResource(body.resource);
    const resource = body.resource as OrganizationResource;
    const name = organizationName(body.name, resource);
    const code = safeCode(body.code, `${resource.slice(0, 3)}-${Date.now().toString(36)}`);
    const branchId = organizationParentId(resource, body.branchId);
    if (branchId) {
      const branch = await findResource(context.tenantId, 'branches', branchId);
      if (!branch || branch.active === false) return NextResponse.json({ error: 'La sucursal seleccionada no existe o está inactiva.' }, { status: 404 });
    }
    if (resource === 'branches' && await countActiveResource(context.tenantId, resource) >= 100) {
      return NextResponse.json({ error: 'Se alcanzó el límite de sucursales del plan.' }, { status: 403 });
    }
    const data: Record<string, unknown> = resource === 'branches'
      ? { name, code, active: true, timezone: text(body.timezone, 50) || 'America/Managua' }
      : { branch_id: branchId, name, code, active: true };
    const item = await createOrganizationResource(context.tenantId, resource, data);
    if (resource === 'branches') {
      const branchDbId = String((item as Record<string, unknown>).supabaseId || (item as Record<string, unknown>).id);
      const supabase = getSupabaseServer();
      const warehouse = await supabase.from('warehouses').insert({ tenant_id: context.tenantId, branch_id: branchDbId, code: `${code}-ALM`, name: `Almacén ${name}`, active: true }).select('id').single();
      if (warehouse.error) throw new Error(warehouse.error.message);
      const register = await supabase.from('cash_registers').insert({ tenant_id: context.tenantId, branch_id: branchDbId, code: `${code}-CAJA`, name: `Caja ${name}`, active: true }).select('id').single();
      if (register.error) throw new Error(register.error.message);
      const owner = await supabase.from('members').select('id').eq('tenant_id', context.tenantId).eq('role', 'owner').eq('status', 'active').limit(1).maybeSingle();
      if (owner.error) throw new Error(owner.error.message);
      if (owner.data) {
        const assignment = await supabase.from('member_branches').upsert({ tenant_id: context.tenantId, member_id: owner.data.id, branch_id: branchDbId }, { onConflict: 'tenant_id,member_id,branch_id' });
        if (assignment.error) throw new Error(assignment.error.message);
      }
    }
    return NextResponse.json({ ok: true, resource, item }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'ORGANIZATION_RESOURCE_INVALID') return NextResponse.json({ error: 'Recurso organizativo inválido.' }, { status: 400 });
    if (message === 'BRANCH_REQUIRED') return NextResponse.json({ error: 'La sucursal es obligatoria para almacenes y cajas.' }, { status: 400 });
    if (message.includes('duplicate') || message.includes('unique')) return NextResponse.json({ error: 'Ya existe un registro con ese código.' }, { status: 409 });
    return responseFor(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireSupabaseTenantPermission(request, 'dashboard', 'edit');
    const body = await request.json();
    assertOrganizationResource(body.resource);
    const resource = body.resource as OrganizationResource;
    const id = text(body.id, 128);
    if (!id) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 });
    const current = await findResource(context.tenantId, resource, id);
    if (!current) return NextResponse.json({ error: 'El registro organizativo no existe.' }, { status: 404 });
    const changes: Record<string, unknown> = {};
    if (typeof body.name === 'string' && body.name.trim()) changes.name = text(body.name);
    if (typeof body.code === 'string' && body.code.trim()) changes.code = safeCode(body.code, String(current.code || 'REGISTRO'));
    if (typeof body.active === 'boolean') changes.active = body.active;
    if (resource === 'branches' && typeof body.timezone === 'string' && body.timezone.trim()) changes.timezone = text(body.timezone, 50);
    if ((resource === 'warehouses' || resource === 'cashRegisters') && typeof body.branchId === 'string') {
      const branch = await findResource(context.tenantId, 'branches', body.branchId);
      if (!branch || branch.active === false) return NextResponse.json({ error: 'La sucursal seleccionada no existe o está inactiva.' }, { status: 404 });
      changes.branch_id = branch.id;
    }
    if (!Object.keys(changes).length) return NextResponse.json({ error: 'No hay cambios válidos.' }, { status: 400 });
    const updated = await updateOrganizationResource(context.tenantId, resource, id, changes);
    if (!updated) return NextResponse.json({ error: 'El registro organizativo no existe.' }, { status: 404 });
    const { item } = updated;
    return NextResponse.json({ ok: true, resource, id, changes, item });
  } catch (error: unknown) { return responseFor(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await requireSupabaseTenantPermission(request, 'members', 'edit');
    const body = await request.json();
    const uid = text(body.uid, 128);
    if (!uid) return NextResponse.json({ error: 'Usuario inválido.' }, { status: 400 });
    const branchIds = branchIdsFrom(body.branchIds);
    if (!branchIds.length && context.role === 'owner') return NextResponse.json({ error: 'El owner debe conservar al menos una sucursal asignada.' }, { status: 400 });
    await upsertMemberBranches(context.tenantId, uid, branchIds);
    return NextResponse.json({ ok: true, uid, branchIds });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'BRANCH_NOT_FOUND') return NextResponse.json({ error: 'Una de las sucursales seleccionadas no existe o está inactiva.' }, { status: 404 });
    return responseFor(error);
  }
}
