import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePublicApiKey, publicApiError } from '@/lib/public-api';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePublicApiKey(request);
    const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get('limit') || 50)));
    const snapshot = await getAdminDb().collection('tenants').doc(auth.tenantId).collection('sales').orderBy('createdAt', 'desc').limit(limit).get();
    return NextResponse.json({ data: snapshot.docs.map((doc) => { const item = doc.data(); return { id: doc.id, invoiceNumber: item.invoiceNumber || null, saleNumber: item.saleNumber || null, total: item.total || 0, currency: item.currency || 'NIO', status: item.status || 'completed', createdAt: item.createdAt || null }; }), meta: { version: '2026-01', tenantId: auth.tenantId, limit } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { const response = publicApiError(error); return NextResponse.json(response.body, { status: response.status }); }
}
