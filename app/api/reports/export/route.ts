import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { consumeMonthlyEntitlement } from '@/lib/entitlement-guard';
import { toCsv } from '@/lib/integrations';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'reports', 'export');
    const db = getAdminDb();
    await consumeMonthlyEntitlement(db, context.tenantId, 'monthlyExports');
    const snapshot = await db.collection('tenants').doc(context.tenantId).collection('sales').orderBy('createdAt', 'desc').limit(500).get();
    const rows = snapshot.docs.map((item) => {
      const data = item.data();
      return { id: item.id, saleNumber: data.saleNumber || '', total: data.total || 0, paymentMethod: data.paymentMethod || '', status: data.status || '', createdAt: data.createdAt || '' };
    });
    return new NextResponse(toCsv(rows, ['id', 'saleNumber', 'total', 'paymentMethod', 'status', 'createdAt']), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ventas.csv"', 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const entitlement = tenantErrorResponse(error);
    return NextResponse.json(entitlement.body, { status: entitlement.status });
  }
}
