import { getSupabaseServer } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant';

function safe(value: string) {
  return value.trim().slice(0, 128);
}

export async function resolveTenantBranchId(tenantId: string, requestedId: string) {
  const id = safe(requestedId);
  if (!id) return '';
  const supabase = getSupabaseServer();
  const direct = await supabase.from('branches').select('id,legacy_firestore_id,active').eq('tenant_id', tenantId).eq('id', id).maybeSingle();
  if (direct.error) throw new Error(direct.error.message);
  if (direct.data) return direct.data.active ? String(direct.data.id) : '';
  const legacy = await supabase.from('branches').select('id,legacy_firestore_id,active').eq('tenant_id', tenantId).eq('legacy_firestore_id', id).maybeSingle();
  if (legacy.error) throw new Error(legacy.error.message);
  return legacy.data?.active ? String(legacy.data.id) : '';
}

export async function resolveTenantWarehouseId(tenantId: string, branchId: string, requestedId?: string) {
  const id = safe(requestedId || '');
  const supabase = getSupabaseServer();
  if (id) {
    const direct = await supabase.from('warehouses').select('id,legacy_firestore_id,active').eq('tenant_id', tenantId).eq('branch_id', branchId).eq('id', id).eq('active', true).maybeSingle();
    if (direct.error) throw new Error(direct.error.message);
    if (direct.data) return String(direct.data.id);
    const legacy = await supabase.from('warehouses').select('id,legacy_firestore_id,active').eq('tenant_id', tenantId).eq('branch_id', branchId).eq('legacy_firestore_id', id).eq('active', true).maybeSingle();
    if (legacy.error) throw new Error(legacy.error.message);
    if (legacy.data) return String(legacy.data.id);
    return '';
  }
  const fallback = await supabase.from('warehouses').select('id').eq('tenant_id', tenantId).eq('branch_id', branchId).eq('active', true).order('name').limit(1).maybeSingle();
  if (fallback.error) throw new Error(fallback.error.message);
  return fallback.data?.id ? String(fallback.data.id) : '';
}

export async function resolveTenantBranchAndWarehouse(tenantId: string, branchId: string, warehouseId?: string) {
  const resolvedBranchId = await resolveTenantBranchId(tenantId, branchId);
  if (!resolvedBranchId) return { branchId: '', warehouseId: '' };
  return { branchId: resolvedBranchId, warehouseId: await resolveTenantWarehouseId(tenantId, resolvedBranchId, warehouseId) };
}

export function assertResolvedBranchAccess(context: Pick<TenantContext, 'role' | 'branchIds'>, requestedId: string, resolvedId: string) {
  const admin = new Set(['owner', 'admin', 'gerente', 'jefe']);
  if (admin.has(context.role)) return;
  if (!context.branchIds.includes(requestedId) && !context.branchIds.includes(resolvedId)) throw new Error('BRANCH_OUT_OF_SCOPE');
}
