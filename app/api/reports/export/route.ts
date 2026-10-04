import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import type { TenantRole } from '@/lib/tenant';
import { toCsv } from '@/lib/integrations';
import { resolveTenantBranchIds } from '@/lib/organization-scope';
import { reportExportQuotaFailure } from '@/lib/report-export-quota';
import { normalizeFinancialTimeZone } from '@/lib/financial-period';

export const runtime = 'nodejs';
const TENANT_WIDE_ROLES = new Set<TenantRole>(['owner', 'admin', 'gerente', 'jefe']);

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'reports', 'export');
    const supabase = getSupabaseServer();
    const tenantResult = await supabase.from('tenants').select('name,timezone').eq('id', context.tenantId).single();
    if (tenantResult.error) throw new Error(tenantResult.error.message);
    const wide = TENANT_WIDE_ROLES.has(context.role);
    const branchIds = wide ? [] : await resolveTenantBranchIds(context.tenantId, context.branchIds);

    let result: { data: Array<Record<string, any>> | null; error: { message: string } | null };
    if (!wide && branchIds.length === 0) {
      result = { data: [], error: null };
    } else {
      let query = supabase
        .from('sales')
        .select('id,branch_id,invoice_number,total,status,created_at,metadata,sale_payments(payment_method,amount)')
        .eq('tenant_id', context.tenantId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (!wide) query = query.in('branch_id', branchIds);
      result = await query;
    }
    if (result.error) throw new Error(result.error.message);
    const rows = (result.data || []).map((item) => {
      const paymentRows = Array.isArray(item.sale_payments) ? item.sale_payments as Array<Record<string, any>> : [];
      const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata as Record<string, unknown> : {};
      return {
        id: item.id,
        saleNumber: item.invoice_number || '',
        total: item.total || 0,
        paymentMethod: paymentRows.map((payment) => payment.payment_method).filter(Boolean).join(', ') || metadata.paymentMethod || '',
        status: item.status || '',
        createdAt: item.created_at || '',
      };
    });

    const quota = await supabase.rpc('consume_financial_report_export', {
      target_tenant_id: context.tenantId,
      target_user_id: context.uid,
    });
    if (quota.error) throw new Error(quota.error.message);
    const quotaResult = quota.data && typeof quota.data === 'object' ? quota.data as Record<string, unknown> : {};
    const blocked = reportExportQuotaFailure(quotaResult, String(tenantResult.data.name || 'la empresa'), normalizeFinancialTimeZone(tenantResult.data.timezone));
    if (blocked) return blocked;

    return new NextResponse(toCsv(rows, ['id', 'saleNumber', 'total', 'paymentMethod', 'status', 'createdAt']), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ventas.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
