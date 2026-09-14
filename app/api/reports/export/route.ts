import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import type { TenantRole } from '@/lib/tenant';
import { toCsv } from '@/lib/integrations';

export const runtime = 'nodejs';
const TENANT_WIDE_ROLES = new Set<TenantRole>(['owner', 'admin', 'gerente', 'jefe']);

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'reports', 'export');
    const result = await getSupabaseServer().from('sales').select('id,branch_id,invoice_number,total,status,created_at,metadata,sale_payments(payment_method,amount)').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(500);
    if (result.error) throw new Error(result.error.message);
    const rows = (result.data || []).filter((item) => TENANT_WIDE_ROLES.has(context.role) || context.branchIds.includes(item.branch_id)).map((item) => {
      const payment = Array.isArray(item.sale_payments) ? item.sale_payments[0] : null;
      return { id: item.id, saleNumber: item.invoice_number || '', total: item.total || 0, paymentMethod: payment?.payment_method || item.metadata?.paymentMethod || '', status: item.status || '', createdAt: item.created_at || '' };
    });
    return new NextResponse(toCsv(rows, ['id', 'saleNumber', 'total', 'paymentMethod', 'status', 'createdAt']), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ventas.csv"', 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
