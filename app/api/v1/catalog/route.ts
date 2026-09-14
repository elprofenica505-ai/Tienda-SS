import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requirePublicApiKey, publicApiError } from '@/lib/public-api';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePublicApiKey(request); const result = await getSupabaseServer().from('products').select('id,name,sku,price,metadata').eq('tenant_id', auth.tenantId).eq('active', true).order('name', { ascending: true }).limit(100); if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ data: (result.data || []).map((item) => { const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata as Record<string, unknown> : {}; return { id: item.id, name: item.name || '', sku: item.sku || '', itemType: metadata.itemType === 'service' ? 'service' : 'physical', price: item.price || 0, currency: 'NIO', active: true }; }), meta: { version: '2026-01', tenantId: auth.tenantId } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { const response = publicApiError(error); return NextResponse.json(response.body, { status: response.status }); }
}
