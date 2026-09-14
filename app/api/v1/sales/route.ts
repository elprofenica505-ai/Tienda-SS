import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requirePublicApiKey, publicApiError } from '@/lib/public-api';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePublicApiKey(request); const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get('limit') || 50))); const result = await getSupabaseServer().from('sales').select('id,invoice_number,total,status,created_at,metadata').eq('tenant_id', auth.tenantId).order('created_at', { ascending: false }).limit(limit); if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ data: (result.data || []).map((item) => { const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata as Record<string, unknown> : {}; return { id: item.id, invoiceNumber: item.invoice_number || null, saleNumber: metadata.saleNumber || null, total: item.total || 0, currency: 'NIO', status: item.status || 'completed', createdAt: item.created_at || null }; }), meta: { version: '2026-01', tenantId: auth.tenantId, limit } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { const response = publicApiError(error); return NextResponse.json(response.body, { status: response.status }); }
}
