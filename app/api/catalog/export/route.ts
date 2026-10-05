import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { toCsv } from '@/lib/integrations';
import { reportExportQuotaFailure } from '@/lib/report-export-quota';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'catalog', 'export');
    const supabase = getSupabaseServer();
    // Cuota compartida diaria de 3 exportaciones para reportes, catálogo y Excel maestro
    const quota = await supabase.rpc('consume_financial_report_export', { target_tenant_id: context.tenantId, target_user_id: context.uid });
    if (quota.error) throw new Error(quota.error.message);
    const tenantResult = await (supabase as any).from('tenants').select('name, timezone').eq('id', context.tenantId).maybeSingle();
    const tenantName = typeof tenantResult.data?.name === 'string' ? tenantResult.data.name : 'Empresa';
    const tenantTimezone = typeof tenantResult.data?.timezone === 'string' && tenantResult.data.timezone ? tenantResult.data.timezone : 'America/Managua';
    const quotaData = quota.data && typeof quota.data === 'object' ? quota.data as Record<string, unknown> : {};
    const blocked = reportExportQuotaFailure(quotaData, tenantName, tenantTimezone);
    if (blocked) return blocked;
    const result = await supabase.from('products').select('id,name,sku,price,active,metadata').eq('tenant_id', context.tenantId).order('name', { ascending: true }).limit(500);
    if (result.error) throw new Error(result.error.message);
    const rows = (result.data || []).map((product) => {
      const metadata = product.metadata && typeof product.metadata === 'object' ? product.metadata as Record<string, unknown> : {};
      return { id: product.id, name: product.name || '', sku: product.sku || '', itemType: metadata.itemType === 'service' ? 'service' : 'physical', price: product.price || 0, stock: metadata.initialStock || 0, minStock: metadata.minStock || 0, active: product.active !== false ? 'true' : 'false' };
    });
    return new NextResponse(`\uFEFF${toCsv(rows, ['id', 'name', 'sku', 'itemType', 'price', 'stock', 'minStock', 'active'])}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="catalogo.csv"', 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}
