import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import type { TenantRole } from '@/lib/tenant';
import { toCsv } from '@/lib/integrations';
import { assertEntitlementCapacity } from '@/lib/entitlements';

export const runtime = 'nodejs';
const TENANT_WIDE_ROLES = new Set<TenantRole>(['owner', 'admin', 'gerente', 'jefe']);

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'reports', 'export');
    const supabase = getSupabaseServer();
    const month = new Date().toISOString().slice(0, 7);
    const [tenantResult, usageResult] = await Promise.all([
      supabase.from('tenants').select('plan').eq('id', context.tenantId).single(),
      supabase.from('entitlement_usage').select('monthly_exports').eq('tenant_id', context.tenantId).eq('month', month).maybeSingle(),
    ]);
    if (tenantResult.error) throw new Error(tenantResult.error.message);
    if (usageResult.error) throw new Error(usageResult.error.message);
    assertEntitlementCapacity(tenantResult.data.plan, 'monthlyExports', Number(usageResult.data?.monthly_exports || 0));
    const result = await supabase.from('sales').select('id,branch_id,invoice_number,total,status,created_at,metadata,sale_payments(payment_method,amount)').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(500);
    if (result.error) throw new Error(result.error.message);
    const rows = (result.data || []).filter((item) => TENANT_WIDE_ROLES.has(context.role) || context.branchIds.includes(item.branch_id)).map((item) => {
      const payment = Array.isArray(item.sale_payments) ? item.sale_payments[0] : null;
      return { id: item.id, saleNumber: item.invoice_number || '', total: item.total || 0, paymentMethod: payment?.payment_method || item.metadata?.paymentMethod || '', status: item.status || '', createdAt: item.created_at || '' };
    });
    const usage = await supabase.from('entitlement_usage').upsert({ tenant_id: context.tenantId, month, monthly_exports: Number(usageResult.data?.monthly_exports || 0) + 1, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id,month' });
    if (usage.error) throw new Error(usage.error.message);
    return new NextResponse(toCsv(rows, ['id', 'saleNumber', 'total', 'paymentMethod', 'status', 'createdAt']), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ventas.csv"', 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
