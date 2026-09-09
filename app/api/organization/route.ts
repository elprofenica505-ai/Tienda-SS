import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { assertPlanCapacity } from '@/lib/entitlement-guard';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { writeImmutableAudit } from '@/lib/audit';
import { assertOrganizationResource, branchIdsFrom, getOrganization, organizationCollection, organizationDocumentRef, organizationName, organizationParentId, safeCode, type OrganizationResource } from '@/lib/organization';

export const runtime = 'nodejs';

function text(value: unknown, max = 120) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'dashboard', 'view');
    const memberRef = getAdminDb().collection('tenants').doc(context.tenantId).collection('members').doc(context.uid);
    const memberSnapshot = await memberRef.get();
    if (memberSnapshot.exists && (!Array.isArray(memberSnapshot.data()?.branchIds) || memberSnapshot.data()?.branchIds.length === 0)) {
      await memberRef.update({ branchIds: ['branch-main'], updatedAt: new Date() });
      context.branchIds = ['branch-main'];
    }
    const organization = await getOrganization(context.tenantId);
    const visibleBranches = context.role === 'owner' || context.role === 'admin' || context.role === 'gerente' || context.role === 'jefe'
      ? organization.branches
      : organization.branches.filter((branch) => context.branchIds.includes(String(branch.id)));
    const branchSet = new Set(visibleBranches.map((branch) => String(branch.id)));
    return NextResponse.json({ ok: true, organization: {
      branches: visibleBranches,
      warehouses: organization.warehouses.filter((item) => branchSet.has(String(item.branchId))),
      cashRegisters: organization.cashRegisters.filter((item) => branchSet.has(String(item.branchId))),
      members: organization.members,
    } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'dashboard', 'edit');
    const body = await request.json();
    assertOrganizationResource(body.resource);
    const resource = body.resource as OrganizationResource;
    const name = organizationName(body.name, resource);
    const code = safeCode(body.code, `${resource.slice(0, 3)}-${Date.now().toString(36)}`);
    const branchId = organizationParentId(resource, body.branchId);
    if (branchId) {
      const branch = await organizationCollection(context.tenantId, 'branches').doc(branchId).get();
      if (!branch.exists || branch.data()?.active === false) return NextResponse.json({ error: 'La sucursal seleccionada no existe o está inactiva.' }, { status: 404 });
    }
    const collection = organizationCollection(context.tenantId, resource);
    const duplicate = await collection.where('code', '==', code).limit(1).get();
    if (!duplicate.empty) return NextResponse.json({ error: 'Ya existe un registro con ese código.' }, { status: 409 });
    if (resource === 'branches') {
      const tenant = await getAdminDb().collection('tenants').doc(context.tenantId).get();
      const count = (await collection.where('active', '==', true).get()).size;
      assertPlanCapacity(tenant.data()?.plan, 'branches', count, 1);
    }
    const ref = organizationDocumentRef(context.tenantId, resource);
    const now = new Date();
    const data = resource === 'branches'
      ? { name, code, active: true, timezone: text(body.timezone, 50) || 'America/Managua', createdAt: now, updatedAt: now }
      : resource === 'warehouses'
        ? { branchId, name, code, type: body.type === 'transit' || body.type === 'store' ? body.type : 'warehouse', active: true, createdAt: now, updatedAt: now }
        : { branchId, name, code, active: true, createdAt: now, updatedAt: now };
    await ref.create(data);
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: `organization.${resource}.created`, entity: resource, entityId: ref.id, after: data, result: 'success' });
    return NextResponse.json({ ok: true, resource, item: { id: ref.id, ...data } }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'ORGANIZATION_RESOURCE_INVALID') return NextResponse.json({ error: 'Recurso organizativo inválido.' }, { status: 400 });
    if (message === 'BRANCH_REQUIRED') return NextResponse.json({ error: 'La sucursal es obligatoria para almacenes y cajas.' }, { status: 400 });
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'dashboard', 'edit');
    const body = await request.json();
    const resource = body.resource as OrganizationResource;
    assertOrganizationResource(resource);
    const id = text(body.id, 128);
    if (!id) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 });
    const ref = organizationCollection(context.tenantId, resource).doc(id);
    const current = await ref.get();
    if (!current.exists) return NextResponse.json({ error: 'El registro organizativo no existe.' }, { status: 404 });
    const changes: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.name === 'string' && body.name.trim()) changes.name = text(body.name);
    if (typeof body.code === 'string' && body.code.trim()) changes.code = safeCode(body.code, String(current.data()?.code || 'REGISTRO'));
    if (typeof body.active === 'boolean') changes.active = body.active;
    if (resource === 'branches' && typeof body.timezone === 'string' && body.timezone.trim()) changes.timezone = text(body.timezone, 50);
    if ((resource === 'warehouses' || resource === 'cashRegisters') && typeof body.branchId === 'string') {
      const branch = await organizationCollection(context.tenantId, 'branches').doc(body.branchId).get();
      if (!branch.exists || branch.data()?.active === false) return NextResponse.json({ error: 'La sucursal seleccionada no existe o está inactiva.' }, { status: 404 });
      changes.branchId = body.branchId;
    }
    if (Object.keys(changes).length === 1) return NextResponse.json({ error: 'No hay cambios válidos.' }, { status: 400 });
    await ref.update(changes);
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: `organization.${resource}.updated`, entity: resource, entityId: id, before: current.data(), after: { ...current.data(), ...changes }, result: 'success' });
    return NextResponse.json({ ok: true, resource, id, changes });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'members', 'edit');
    const body = await request.json();
    const uid = text(body.uid, 128);
    if (!uid) return NextResponse.json({ error: 'Usuario inválido.' }, { status: 400 });
    const memberRef = getAdminDb().collection('tenants').doc(context.tenantId).collection('members').doc(uid);
    const member = await memberRef.get();
    if (!member.exists || member.data()?.status !== 'active') return NextResponse.json({ error: 'El usuario no existe o está inactivo.' }, { status: 404 });
    const branchIds = branchIdsFrom(body.branchIds);
    if (member.data()?.role === 'owner' && branchIds.length === 0) return NextResponse.json({ error: 'El owner debe conservar al menos una sucursal asignada.' }, { status: 400 });
    const branches = await Promise.all(branchIds.map((id) => organizationCollection(context.tenantId, 'branches').doc(id).get()));
    if (branches.some((branch) => !branch.exists || branch.data()?.active === false)) return NextResponse.json({ error: 'Una de las sucursales seleccionadas no existe o está inactiva.' }, { status: 404 });
    await memberRef.update({ branchIds, updatedAt: new Date(), updatedBy: context.uid });
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'organization.member_branches.updated', entity: 'member', entityId: uid, before: { branchIds: member.data()?.branchIds || [] }, after: { branchIds }, result: 'success' });
    return NextResponse.json({ ok: true, uid, branchIds });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
