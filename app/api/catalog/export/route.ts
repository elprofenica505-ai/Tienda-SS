import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { toCsv } from '@/lib/integrations';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'catalog', 'export');
    const entitlement = await getSupabaseServer().rpc('consume_catalog_export', { target_tenant_id: context.tenantId, target_user_id: context.uid });
    if (entitlement.error) throw new Error(entitlement.error.message);
    const result = await getSupabaseServer().from('products').select('id,name,sku,price,active,metadata').eq('tenant_id', context.tenantId).order('name', { ascending: true }).limit(500);
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
