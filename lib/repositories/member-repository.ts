import { getSupabaseServer } from '@/lib/supabase/server';
import { firebaseUidToProfileId } from '@/lib/repositories/organization-repository';

function fail(error: { message?: string } | null): never { throw new Error(error?.message || 'SUPABASE_REQUEST_FAILED'); }

async function tenantRow(tenantId: string) {
  const result = await getSupabaseServer().from('tenants').select('*').or(`id.eq.${tenantId},legacy_firestore_id.eq.${tenantId}`).single();
  if (result.error) fail(result.error);
  return result.data;
}

async function profileRow(firebaseUid: string, email?: string, name?: string) {
  const supabase = getSupabaseServer();
  const id = firebaseUidToProfileId(firebaseUid);
  const result = await supabase.from('profiles').upsert({ id, auth_user_id: id, legacy_firestore_id: firebaseUid, email: email || null, display_name: name || email || null }, { onConflict: 'auth_user_id' }).select('*').single();
  if (result.error) fail(result.error);
  return result.data;
}

export async function listMembers(tenantId: string) {
  const tenant = await tenantRow(tenantId);
  const result = await getSupabaseServer().from('members').select('*, profiles(*), member_branches(branch_id, branches(legacy_firestore_id))').eq('tenant_id', tenant.id).order('created_at');
  if (result.error) fail(result.error);
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
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  });
}

export async function findMemberByFirebaseUid(tenantId: string, firebaseUid: string) {
  const tenant = await tenantRow(tenantId);
  const profile = await getSupabaseServer().from('profiles').select('*').eq('legacy_firestore_id', firebaseUid).maybeSingle();
  if (profile.error) fail(profile.error);
  if (!profile.data) return null;
  const member = await getSupabaseServer().from('members').select('*, member_branches(branch_id, branches(legacy_firestore_id))').eq('tenant_id', tenant.id).eq('profile_id', profile.data.id).maybeSingle();
  if (member.error) fail(member.error);
  if (!member.data) return null;
  return { tenant, profile: profile.data, member: member.data, branchIds: (member.data.member_branches || []).map((item: any) => String(item.branches?.legacy_firestore_id || item.branch_id)) };
}

export async function createMember(tenantId: string, firebaseUid: string, name: string, email: string, role: string, branchIds: string[]) {
  const tenant = await tenantRow(tenantId);
  const profile = await profileRow(firebaseUid, email, name);
  const supabase = getSupabaseServer();
  const member = await supabase.from('members').upsert({ tenant_id: tenant.id, profile_id: profile.id, role, status: 'active' }, { onConflict: 'tenant_id,profile_id' }).select('*').single();
  if (member.error) fail(member.error);
  await replaceBranchAssignments(tenant.id, member.data.id, branchIds);
  return { member: member.data, profile };
}

export async function updateMember(tenantId: string, firebaseUid: string, changes: Record<string, unknown>, branchIds?: string[]) {
  const current = await findMemberByFirebaseUid(tenantId, firebaseUid);
  if (!current) return null;
  const update = { ...changes, ...(changes.status === 'disabled' ? { status: 'inactive' } : {}) };
  const result = await getSupabaseServer().from('members').update(update).eq('id', current.member.id).eq('tenant_id', current.tenant.id).select('*').single();
  if (result.error) fail(result.error);
  if (branchIds) await replaceBranchAssignments(current.tenant.id, current.member.id, branchIds);
  return { before: current, after: result.data };
}

async function replaceBranchAssignments(tenantId: string, memberId: string, branchIds: string[]) {
  const supabase = getSupabaseServer();
  const branches = await supabase.from('branches').select('id, legacy_firestore_id').eq('tenant_id', tenantId).in('legacy_firestore_id', branchIds);
  if (branches.error) fail(branches.error);
  if ((branches.data || []).length !== branchIds.length) throw new Error('BRANCH_NOT_FOUND');
  const deleted = await supabase.from('member_branches').delete().eq('tenant_id', tenantId).eq('member_id', memberId);
  if (deleted.error) fail(deleted.error);
  if (branches.data?.length) {
    const inserted = await supabase.from('member_branches').insert(branches.data.map((branch) => ({ tenant_id: tenantId, member_id: memberId, branch_id: branch.id })));
    if (inserted.error) fail(inserted.error);
  }
}
