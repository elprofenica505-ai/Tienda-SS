import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { assertBranchAccess } from '@/lib/data-scope';
import { resolveTenantBranchIds } from '@/lib/branch-scope';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';

export const runtime = 'nodejs';
const NO_STORE = { 'Cache-Control': 'no-store' };
const MANAGER_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);
const PAGE_SIZE = 100;

function text(value: unknown, max = 128) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function failure(error: unknown) {
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status, headers: NO_STORE });
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'receivables', 'view');
    const requestedBranch = text(request.headers.get('x-branch-id'));
    if (requestedBranch) assertBranchAccess(context, requestedBranch);
    const supabase = getSupabaseServer();
    const branchIds = requestedBranch
      ? await resolveTenantBranchIds(supabase, context.tenantId, [requestedBranch])
      : MANAGER_ROLES.has(context.role) ? [] : await resolveTenantBranchIds(supabase, context.tenantId, context.branchIds.slice(0, 100));
    if (requestedBranch && !branchIds.length) return NextResponse.json({ error: 'La sucursal no existe o no está activa.' }, { status: 404, headers: NO_STORE });
    if (!requestedBranch && !MANAGER_ROLES.has(context.role) && !branchIds.length) return NextResponse.json({ ok: true, history: [], pagination: { pageSize: PAGE_SIZE } }, { headers: NO_STORE });
    let query = supabase
      .from('receivable_reminder_logs')
      .select('id,tenant_id,branch_id,customer_id,receivable_id,event_type,status,customer_name,message,provider,provider_message_id,error,sent_at,response_at,created_at')
      .eq('tenant_id', context.tenantId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (requestedBranch) query = query.eq('branch_id', branchIds[0]);
    else if (!MANAGER_ROLES.has(context.role)) query = query.in('branch_id', branchIds);

    const result = await query;
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ ok: true, history: result.data || [], pagination: { pageSize: PAGE_SIZE } }, { headers: NO_STORE });
  } catch (error: unknown) {
    return failure(error);
  }
}
