import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'reports', 'view');
    const branchId = request.nextUrl.searchParams.get('branchId');
    if (branchId) assertBranchAccess(context, branchId);
    const from = request.nextUrl.searchParams.get('from') || null;
    const to = request.nextUrl.searchParams.get('to') || null;
    const supabase = getSupabaseServer();
    const [sales, inventory, aging, cash] = await Promise.all([
      supabase.rpc('report_sales_consolidated', { target_tenant_id: context.tenantId, target_branch_id: branchId, target_from: from, target_to: to }),
      supabase.rpc('report_inventory_kardex_valuation', { target_tenant_id: context.tenantId, target_branch_id: branchId }),
      supabase.rpc('report_receivables_payables_aging', { target_tenant_id: context.tenantId, target_branch_id: branchId }),
      supabase.rpc('report_cash_movements', { target_tenant_id: context.tenantId, target_branch_id: branchId, target_from: from, target_to: to }),
    ]);
    for (const result of [sales, inventory, aging, cash]) if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ ok: true, branchId, period: { from, to }, sales: sales.data || [], inventory: inventory.data || [], aging: aging.data || [], cash: cash.data || [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
