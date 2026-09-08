import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';

export const runtime = 'nodejs';

function dateKey(value: string | null) {
  const candidate = value || new Date().toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'reports', 'view');
    const key = dateKey(new URL(request.url).searchParams.get('date'));
    if (!key) return NextResponse.json({ error: 'La fecha debe tener formato YYYY-MM-DD.' }, { status: 400 });
    const snapshot = await getAdminDb().collection('tenants').doc(context.tenantId).collection('stats').doc('daily').collection('days').doc(key).get();
    const data = snapshot.exists ? snapshot.data() : {};
    return NextResponse.json({ ok: true, date: key, stats: { salesCount: Number(data?.salesCount || 0), salesTotal: Number(data?.salesTotal || 0), updatedAt: data?.updatedAt || null } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
