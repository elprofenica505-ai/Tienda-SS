import { getSupabaseServer } from '@/lib/supabase/server';
import type { TenantRole } from '@/lib/tenant';

export type OrganizationResource = 'branches' | 'warehouses' | 'cashRegisters';
export type OrganizationRow = Record<string, unknown> & { id: string };

const resourceTables: Record<OrganizationResource, string> = {
  branches: 'branches',
  warehouses: 'warehouses',
  cashRegisters: 'cash_registers',
};
const resourceSelect: Record<OrganizationResource, string> = {
  branches: 'id,legacy_firestore_id,tenant_id,code,name,timezone,active,created_at,updated_at',
  warehouses: 'id,legacy_firestore_id,tenant_id,branch_id,code,name,active,created_at,updated_at',
  cashRegisters: 'id,legacy_firestore_id,tenant_id,branch_id,code,name,active,created_at,updated_at',
};

function fail(error: { message?: string } | null, fallback = 'SUPABASE_REQUEST_FAILED'): never {
  throw new Error(error?.message || fallback);
}

function legacyId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function mapTenant(row: OrganizationRow): OrganizationRow {
  return {
    supabaseId: row.id,
    ...row,
    id: String(row.legacy_firestore_id || row.id),
    currencySymbol: row.currency_symbol || 'C$',
    locale: row.locale || 'es-NI',
    onboardingCompleted: row.onboarding_completed === true,
  };
}

function mapMember(row: OrganizationRow, profile?: OrganizationRow | null, branchIds: string[] = []): OrganizationRow {
  return {
    id: String(profile?.legacy_firestore_id || profile?.auth_user_id || row.profile_id),
    uid: String(profile?.legacy_firestore_id || profile?.auth_user_id || row.profile_id),
    profileId: row.profile_id,
    name: profile?.display_name || profile?.email || 'Sin nombre',
    email: profile?.email || '',
    role: row.role,
    status: row.status === 'inactive' ? 'disabled' : row.status,
    branchIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOrganizationRow(resource: OrganizationResource, row: OrganizationRow): OrganizationRow {
  return {
    id: String(row.legacy_firestore_id || row.id),
    supabaseId: row.id,
    ...(resource === 'branches' ? {
      name: row.name,
      code: row.code,
      active: row.active,
      timezone: row.timezone,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } : {
      branchId: String(row.branch_id),
      name: row.name,
      code: row.code,
      ...(resource === 'warehouses' ? { type: row.type || 'warehouse' } : {}),
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  };
}

export function supabaseAuthUserToProfileId(authUserId: string): string {
  return authUserId;
}

export async function findTenantsForAuthUserId(authUserId: string) {
  const supabase = getSupabaseServer();
  const profile = await supabase.from('profiles').select('id,legacy_firestore_id,auth_user_id,email,display_name,created_at,updated_at').eq('auth_user_id', authUserId).maybeSingle();
  if (profile.error) fail(profile.error);
  if (!profile.data) return [];
  const memberships = await supabase.from('members').select('id,legacy_firestore_id,tenant_id,profile_id,role,status,created_at,updated_at,member_branches(branch_id,branches(legacy_firestore_id)),tenants(id,legacy_firestore_id,slug,name,status,platform_status,timezone,currency,plan,onboarding_completed,created_at,updated_at)').eq('profile_id', profile.data.id).eq('status', 'active');
  if (memberships.error) fail(memberships.error);
  return (memberships.data || []).filter((row) => {
    const tenant = row.tenants as unknown as OrganizationRow | null;
    return tenant && tenant.status === 'active' && tenant.platform_status !== 'suspended';
  }).map((row) => ({
    tenant: mapTenant(row.tenants as unknown as OrganizationRow),
    member: mapMember(row as OrganizationRow, profile.data as OrganizationRow, ((row.member_branches as unknown as Array<{ branch_id: string; branches?: OrganizationRow | OrganizationRow[] }> | undefined) || []).map((item) => { const branch = Array.isArray(item.branches) ? item.branches[0] : item.branches; return String(branch?.legacy_firestore_id || item.branch_id); })),
  }));
}

export async function ensureProfile(authUserId: string, email?: string, displayName?: string) {
  const supabase = getSupabaseServer();
  const payload = { id: authUserId, auth_user_id: authUserId, email: email || null, display_name: displayName || email || null };
  const result = await supabase.from('profiles').upsert(payload, { onConflict: 'auth_user_id' }).select('id,legacy_firestore_id,auth_user_id,email,display_name,created_at,updated_at').single();
  if (result.error) fail(result.error);
  return result.data as OrganizationRow;
}

export async function findMembership(tenantId: string, authUserId: string) {
  const supabase = getSupabaseServer();
  const profile = await supabase.from('profiles').select('id,legacy_firestore_id,auth_user_id,email,display_name,created_at,updated_at').eq('auth_user_id', authUserId).maybeSingle();
  if (profile.error) fail(profile.error);
  if (!profile.data) return null;
  const tenant = await supabase.from('tenants').select('id,legacy_firestore_id,status,platform_status,subscription_status').or(`id.eq.${tenantId},legacy_firestore_id.eq.${tenantId}`).maybeSingle();
  if (tenant.error) fail(tenant.error);
  if (!tenant.data || tenant.data.status !== 'active' || tenant.data.platform_status === 'suspended') return null;
  const member = await supabase.from('members').select('id,legacy_firestore_id,tenant_id,profile_id,role,status,created_at,updated_at').eq('tenant_id', tenant.data.id).eq('profile_id', profile.data.id).eq('status', 'active').maybeSingle();
  if (member.error) fail(member.error);
  if (!member.data) return null;
  const assignments = await supabase.from('member_branches').select('branch_id, branches(legacy_firestore_id)').eq('tenant_id', tenant.data.id).eq('member_id', member.data.id);
  if (assignments.error) fail(assignments.error);
  const branchIds = (assignments.data || []).map((item) => {
    const branch = item.branches as unknown as OrganizationRow | null;
    return String(branch?.legacy_firestore_id || item.branch_id);
  });
  return { tenant: tenant.data as OrganizationRow, member: member.data as OrganizationRow, profile: profile.data as OrganizationRow, branchIds };
}

export async function getOrganization(tenantId: string) {
  const supabase = getSupabaseServer();
  const tenant = await supabase.from('tenants').select('id').or(`id.eq.${tenantId},legacy_firestore_id.eq.${tenantId}`).maybeSingle();
  if (tenant.error) fail(tenant.error);
  if (!tenant.data) throw new Error('TENANT_NOT_FOUND');
  const [branches, warehouses, cashRegisters, members] = await Promise.all([
    supabase.from('branches').select('id,legacy_firestore_id,tenant_id,code,name,timezone,active,created_at,updated_at').eq('tenant_id', tenant.data.id).eq('active', true).order('name'),
    supabase.from('warehouses').select('id,legacy_firestore_id,tenant_id,branch_id,code,name,active,created_at,updated_at').eq('tenant_id', tenant.data.id).eq('active', true).order('name'),
    supabase.from('cash_registers').select('id,legacy_firestore_id,tenant_id,branch_id,code,name,active,created_at,updated_at').eq('tenant_id', tenant.data.id).eq('active', true).order('name'),
    supabase.from('members').select('id,legacy_firestore_id,tenant_id,profile_id,role,status,created_at,updated_at,profiles(id,legacy_firestore_id,auth_user_id,email,display_name,created_at,updated_at),member_branches(branch_id,branches(legacy_firestore_id))').eq('tenant_id', tenant.data.id).order('created_at'),
  ]);
  for (const result of [branches, warehouses, cashRegisters, members]) if (result.error) fail(result.error);
  return {
    branches: (branches.data || []).map((row) => mapOrganizationRow('branches', row as OrganizationRow)),
    warehouses: (warehouses.data || []).map((row) => mapOrganizationRow('warehouses', row as OrganizationRow)),
    cashRegisters: (cashRegisters.data || []).map((row) => mapOrganizationRow('cashRegisters', row as OrganizationRow)),
    members: (members.data || []).map((row) => {
      const raw = row as unknown as OrganizationRow & { profiles?: OrganizationRow; member_branches?: Array<{ branch_id: string; branches?: OrganizationRow }> };
      return mapMember(raw, raw.profiles, (raw.member_branches || []).map((item) => String(item.branches?.legacy_firestore_id || item.branch_id)));
    }),
  };
}

export async function findResource(tenantId: string, resource: OrganizationResource, id: string) {
  const supabase = getSupabaseServer();
  const tenant = await supabase.from('tenants').select('id').or(`id.eq.${tenantId},legacy_firestore_id.eq.${tenantId}`).single();
  if (tenant.error) fail(tenant.error);
  const table = resourceTables[resource];
  const result = await supabase.from(table).select(resourceSelect[resource]).eq('tenant_id', tenant.data.id).or(`id.eq.${id},legacy_firestore_id.eq.${id}`).maybeSingle();
  if (result.error) fail(result.error);
  return result.data as OrganizationRow | null;
}

export async function countActiveResource(tenantId: string, resource: OrganizationResource) {
  const supabase = getSupabaseServer();
  const tenant = await supabase.from('tenants').select('id').or(`id.eq.${tenantId},legacy_firestore_id.eq.${tenantId}`).single();
  if (tenant.error) fail(tenant.error);
  const result = await supabase.from(resourceTables[resource]).select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.data.id).eq('active', true);
  if (result.error) fail(result.error);
  return result.count || 0;
}

export async function createOrganizationResource(tenantId: string, resource: OrganizationResource, data: Record<string, unknown>) {
  const supabase = getSupabaseServer();
  const tenant = await supabase.from('tenants').select('id').or(`id.eq.${tenantId},legacy_firestore_id.eq.${tenantId}`).single();
  if (tenant.error) fail(tenant.error);
  const payload = { ...data, tenant_id: tenant.data.id };
  const result = await supabase.from(resourceTables[resource]).insert(payload).select(resourceSelect[resource]).single();
  if (result.error) fail(result.error);
  return mapOrganizationRow(resource, result.data as unknown as OrganizationRow);
}

export async function updateOrganizationResource(tenantId: string, resource: OrganizationResource, id: string, changes: Record<string, unknown>) {
  const current = await findResource(tenantId, resource, id);
  if (!current) return null;
  const supabase = getSupabaseServer();
  const result = await supabase.from(resourceTables[resource]).update(changes).eq('id', current.id).eq('tenant_id', current.tenant_id).select(resourceSelect[resource]).single();
  if (result.error) fail(result.error);
  return { before: current, after: result.data as unknown as OrganizationRow, item: mapOrganizationRow(resource, result.data as unknown as OrganizationRow) };
}

export async function upsertMemberBranches(tenantId: string, authUserId: string, branchIds: string[]) {
  const membership = await findMembership(tenantId, authUserId);
  if (!membership) throw new Error('FORBIDDEN');
  const supabase = getSupabaseServer();
  const resolvedBranches: Array<{ id: string; legacy_firestore_id?: string | null }> = [];
  for (const requestedId of branchIds) {
    const branch = await supabase.from('branches').select('id,legacy_firestore_id').eq('tenant_id', membership.tenant.id).or(`id.eq.${requestedId},legacy_firestore_id.eq.${requestedId}`).eq('active', true).maybeSingle();
    if (branch.error) fail(branch.error);
    if (!branch.data) throw new Error('BRANCH_NOT_FOUND');
    resolvedBranches.push(branch.data);
  }
  const clear = await supabase.from('member_branches').delete().eq('tenant_id', membership.tenant.id).eq('member_id', membership.member.id);
  if (clear.error) fail(clear.error);
  if (resolvedBranches.length) {
    const insert = await supabase.from('member_branches').insert(resolvedBranches.map((branch) => ({ tenant_id: membership.tenant.id, member_id: membership.member.id, branch_id: branch.id })));
    if (insert.error) fail(insert.error);
  }
  return branchIds;
}

export function toTenantContext(tenantId: string, authUserId: string, membership: Awaited<ReturnType<typeof findMembership>>) {
  if (!membership) throw new Error('FORBIDDEN');
  return { uid: authUserId, tenantId, role: membership.member.role as TenantRole, email: membership.profile.email || undefined, branchIds: membership.branchIds, subscriptionStatus: undefined };
}
