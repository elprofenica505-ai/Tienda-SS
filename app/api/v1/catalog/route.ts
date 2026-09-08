import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePublicApiKey, publicApiError } from '@/lib/public-api';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePublicApiKey(request);
    const snapshot = await getAdminDb().collection('tenants').doc(auth.tenantId).collection('products').where('active', '==', true).orderBy('name').limit(100).get();
    return NextResponse.json({ data: snapshot.docs.map((doc) => { const item = doc.data(); return { id: doc.id, name: item.name || '', sku: item.sku || '', itemType: item.itemType || 'physical', price: item.price || 0, currency: 'NIO', active: true }; }), meta: { version: '2026-01', tenantId: auth.tenantId } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { const response = publicApiError(error); return NextResponse.json(response.body, { status: response.status }); }
}
