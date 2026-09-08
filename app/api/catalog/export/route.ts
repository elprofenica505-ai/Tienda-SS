import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { consumeMonthlyEntitlement } from '@/lib/entitlement-guard';
import { toCsv } from '@/lib/integrations';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'catalog', 'export');
    const db = getAdminDb();
    await consumeMonthlyEntitlement(db, context.tenantId, 'monthlyExports');
    const snapshot = await db.collection('tenants').doc(context.tenantId).collection('products').orderBy('name').limit(500).get();
    const rows = snapshot.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, name: data.name || '', sku: data.sku || '', itemType: data.itemType || 'physical', price: data.price || 0, stock: data.stock || 0, minStock: data.minStock || 0, active: data.active !== false ? 'true' : 'false' };
    });
    return new NextResponse(`\uFEFF${toCsv(rows, ['id', 'name', 'sku', 'itemType', 'price', 'stock', 'minStock', 'active'])}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="catalogo.csv"', 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
