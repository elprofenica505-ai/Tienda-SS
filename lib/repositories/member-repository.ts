import { getSupabaseServer } from '@/lib/supabase/server';
import { isMissingRelation, supabaseAuthUserToProfileId } from '@/lib/repositories/organization-repository';

export type ResourceAssignments = { warehouseIds?: string[]; cashRegisterIds?: string[] };
type ResourceKind = 'warehouses' | 'cashRegisters';
const resourceConfig: Record<ResourceKind, { table: 'warehouses' | 'cash_registers'; assignmentTable: 'member_warehouses' | 'member_cash_registers'; column: 'warehouse_id' | 'cash_register_id'; notFound: 'WAREHOUSE_NOT_FOUND' | 'CASH_REGISTER_NOT_FOUND' }> = {
  warehouses: { table: 'warehouses', assignmentTable: 'member_warehouses', column: 'warehouse_id', notFound: 'WAREHOUSE_NOT_FOUND' },
  cashRegisters: { table: 'cash_registers', assignmentTable: 'member_cash_registers', column: 'cash_register_id', notFound: 'CASH_REGISTER_NOT_FOUND' },
};

function fail(error: { message?: string } | null): never { throw new Error(error?.message || 'SUPABASE_REQUEST_FAILED'); }

async function tenantRow(tenantId: string) {
  const result = await getSupabaseServer().from('tenants').select('id,legacy_firestore_id').or(`id.eq.${tenantId},legacy_firestore_id.eq.${tenantId}`).single();
  if (result.error) fail(result.error);
  return result.data;
}

async function profileRow(authUserId: string, email?: string, name?: string) {
  const supabase = getSupabaseServer();
  const id = supabaseAuthUserToProfileId(authUserId);
  const result = await supabase.from('profiles').upsert({ id, auth_user_id: id, email: email || null, display_name: name || email || null }, { onConflict: 'auth_user_id' }).select('id,legacy_firestore_id,auth_user_id,email,display_name,created_at,updated_at').single();
  if (result.error) fail(result.error);
  return result.data;
}

/** Referencias (legacy_firestore_id || id) de los recursos asignados a cada miembro. Sin tabla = sin asignación. */
async function resourceReferencesByMember(tenantId: string, kind: ResourceKind): Promise<Map<string, string[]>> {
  const config = resourceConfig[kind];
  const supabase = getSupabaseServer();
  const assignments = await supabase.from(config.assignmentTable).select(`member_id,${config.column}`).eq('tenant_id', tenantId);
  if (assignments.error) {
    if (isMissingRelation(assignments.error)) return new Map();
    fail(assignments.error);
  }
  const resources = await supabase.from(config.table).select('id,legacy_firestore_id').eq('tenant_id', tenantId);
  if (resources.error) fail(resources.error);
  const reference = new Map((resources.data || []).map((row) => [String(row.id), String(row.legacy_firestore_id || row.id)]));
  const byMember = new Map<string, string[]>();
  for (const row of (assignments.data || []) as unknown as Array<Record<string, unknown>>) {
    const resourceId = String(row[config.column]);
    const memberId = String(row.member_id);
    byMember.set(memberId, [...(byMember.get(memberId) || []), reference.get(resourceId) || resourceId]);
  }
  return byMember;
}

export async function listMembers(tenantId: string) {
  const tenant = await tenantRow(tenantId);
  const result = await getSupabaseServer().from('members').select('id,profile_id,role,status,created_at,updated_at,profiles(legacy_firestore_id,auth_user_id,email,display_name),member_branches(branch_id,branches(legacy_firestore_id))').eq('tenant_id', tenant.id).order('created_at');
  if (result.error) fail(result.error);
  const [warehouseRefs, cashRefs] = await Promise.all([resourceReferencesByMember(tenant.id, 'warehouses'), resourceReferencesByMember(tenant.id, 'cashRegisters')]);
  return (result.data || []).map((row) => {
    const item = row as Record<string, any>;
    const profile = item.profiles || {};
    return {
      id: String(profile.legacy_firestore_id || profile.auth_user_id || item.profile_id),
      uid: String(profile.legacy_firestore_id || profile.auth_user_id || item.profile_id),
      name: profile.display_name || profile.email || 'Sin nombre',
      email: profile.email || '',
      role: item.role,
      status: item.status === 'inactive' ? 'disabled' : item.status,
      branchIds: (item.member_branches || []).map((assignment: any) => String(assignment.branches?.legacy_firestore_id || assignment.branch_id)),
      warehouseIds: warehouseRefs.get(String(item.id)) || [],
      cashRegisterIds: cashRefs.get(String(item.id)) || [],
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  });
}

export async function findMemberByAuthUserId(tenantId: string, authUserId: string) {
  const tenant = await tenantRow(tenantId);
  const profile = await getSupabaseServer().from('profiles').select('id,legacy_firestore_id,auth_user_id,email,display_name,created_at,updated_at').eq('auth_user_id', authUserId).maybeSingle();
  if (profile.error) fail(profile.error);
  if (!profile.data) return null;
  const member = await getSupabaseServer().from('members').select('id,tenant_id,profile_id,role,status,created_at,updated_at,member_branches(branch_id,branches(legacy_firestore_id))').eq('tenant_id', tenant.id).eq('profile_id', profile.data.id).maybeSingle();
  if (member.error) fail(member.error);
  if (!member.data) return null;
  return { tenant, profile: profile.data, member: member.data, branchIds: (member.data.member_branches || []).map((item: any) => String(item.branches?.legacy_firestore_id || item.branch_id)) };
}

export async function createMember(tenantId: string, authUserId: string, name: string, email: string, role: string, branchIds: string[]) {
  const tenant = await tenantRow(tenantId);
  const profile = await profileRow(authUserId, email, name);
  const supabase = getSupabaseServer();
  const member = await supabase.from('members').upsert({ tenant_id: tenant.id, profile_id: profile.id, role, status: 'active' }, { onConflict: 'tenant_id,profile_id' }).select('id,legacy_firestore_id,tenant_id,profile_id,role,status,created_at,updated_at').single();
  if (member.error) fail(member.error);
  await replaceBranchAssignments(tenant.id, member.data.id, branchIds);
  return { member: member.data, profile };
}

export async function updateMember(tenantId: string, authUserId: string, changes: Record<string, unknown>, branchIds?: string[], resources?: ResourceAssignments) {
  const current = await findMemberByAuthUserId(tenantId, authUserId);
  if (!current) return null;
  const update = { ...changes, ...(changes.status === 'disabled' ? { status: 'inactive' } : {}) };
  const result = await getSupabaseServer().from('members').update(update).eq('id', current.member.id).eq('tenant_id', current.tenant.id).select('id,legacy_firestore_id,tenant_id,profile_id,role,status,created_at,updated_at').single();
  if (result.error) fail(result.error);
  if (branchIds) await replaceBranchAssignments(current.tenant.id, current.member.id, branchIds);
  if (resources?.warehouseIds) await replaceResourceAssignments(current.tenant.id, current.member.id, 'warehouses', resources.warehouseIds);
  if (resources?.cashRegisterIds) await replaceResourceAssignments(current.tenant.id, current.member.id, 'cashRegisters', resources.cashRegisterIds);
  return { before: current, after: result.data };
}

/**
 * Resuelve referencias de almacenes o cajas (legacy_firestore_id o uuid) a su uuid y a la referencia de su sucursal.
 * Los inactivos se tratan como inexistentes. Todo se valida antes de tocar la asignación.
 */
export async function resolveResourceReferences(tenantId: string, kind: ResourceKind, references: string[]): Promise<Array<{ id: string; branchRef: string }>> {
  const config = resourceConfig[kind];
  const supabase = getSupabaseServer();
  const [resources, branches] = await Promise.all([
    supabase.from(config.table).select('id, legacy_firestore_id, branch_id').eq('tenant_id', tenantId).eq('active', true),
    supabase.from('branches').select('id, legacy_firestore_id').eq('tenant_id', tenantId),
  ]);
  if (resources.error) fail(resources.error);
  if (branches.error) fail(branches.error);
  const branchReference = new Map((branches.data || []).map((row) => [String(row.id), String(row.legacy_firestore_id || row.id)]));
  const byReference = new Map<string, { id: string; branchRef: string }>();
  for (const row of resources.data || []) {
    const entry = { id: String(row.id), branchRef: branchReference.get(String(row.branch_id)) || String(row.branch_id) };
    byReference.set(entry.id, entry);
    if (row.legacy_firestore_id) byReference.set(String(row.legacy_firestore_id), entry);
  }
  const resolved = new Map<string, { id: string; branchRef: string }>();
  for (const reference of references) {
    const entry = byReference.get(reference);
    if (!entry) throw new Error(config.notFound);
    resolved.set(entry.id, entry);
  }
  return Array.from(resolved.values());
}

/** Reemplaza las asignaciones de almacenes o cajas. Sin tabla lanza RESOURCE_ASSIGNMENTS_UNAVAILABLE: nunca se deja abierto el acceso. */
async function replaceResourceAssignments(tenantId: string, memberId: string, kind: ResourceKind, ids: string[]) {
  const config = resourceConfig[kind];
  const supabase = getSupabaseServer();
  const deleted = await supabase.from(config.assignmentTable).delete().eq('tenant_id', tenantId).eq('member_id', memberId);
  if (deleted.error) {
    if (isMissingRelation(deleted.error)) throw new Error('RESOURCE_ASSIGNMENTS_UNAVAILABLE');
    fail(deleted.error);
  }
  if (!ids.length) return;
  const inserted = await supabase.from(config.assignmentTable).insert(ids.map((id) => ({ tenant_id: tenantId, member_id: memberId, [config.column]: id })));
  if (inserted.error) {
    if (isMissingRelation(inserted.error)) throw new Error('RESOURCE_ASSIGNMENTS_UNAVAILABLE');
    fail(inserted.error);
  }
}

/**
 * Reemplaza las sucursales asignadas a un miembro.
 * La UI envía `legacy_firestore_id || id`: una sucursal creada directo en Supabase llega como uuid,
 * así que cada referencia se resuelve contra ambas claves. Todo se valida antes de borrar nada.
 */
async function replaceBranchAssignments(tenantId: string, memberId: string, branchIds: string[]) {
  const supabase = getSupabaseServer();
  const branches = await supabase.from('branches').select('id, legacy_firestore_id, active').eq('tenant_id', tenantId).eq('active', true);
  if (branches.error) fail(branches.error);
  const byReference = new Map<string, string>();
  for (const branch of branches.data || []) {
    byReference.set(String(branch.id), String(branch.id));
    if (branch.legacy_firestore_id) byReference.set(String(branch.legacy_firestore_id), String(branch.id));
  }
  const resolvedIds = new Set<string>();
  for (const reference of branchIds) {
    const branchId = byReference.get(reference);
    if (!branchId) throw new Error('BRANCH_NOT_FOUND');
    resolvedIds.add(branchId);
  }
  const deleted = await supabase.from('member_branches').delete().eq('tenant_id', tenantId).eq('member_id', memberId);
  if (deleted.error) fail(deleted.error);
  if (resolvedIds.size) {
    const inserted = await supabase.from('member_branches').insert(Array.from(resolvedIds).map((branchId) => ({ tenant_id: tenantId, member_id: memberId, branch_id: branchId })));
    if (inserted.error) fail(inserted.error);
  }
}
