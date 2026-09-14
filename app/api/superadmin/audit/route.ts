import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireSuperadmin, superadminErrorResponse } from '@/lib/superadmin';

export const runtime = 'nodejs';
function text(value: string | null) { return value?.trim().slice(0, 80) || ''; }
export async function GET(request: NextRequest) {
  try {
    await requireSuperadmin(request); const url = new URL(request.url); const action = text(url.searchParams.get('action')); const tenantId = text(url.searchParams.get('tenantId')); const page = Math.max(1, Number(url.searchParams.get('page') || '1')); const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get('pageSize') || '25'))); const from = (page - 1) * pageSize;
    let query = getSupabaseServer().from('platform_audit').select('id,actor_uid,tenant_id,action,details,created_at', { count: 'exact' }).order('created_at', { ascending: false }).range(from, from + pageSize - 1);
    if (action) query = query.eq('action', action); if (tenantId) query = query.eq('tenant_id', tenantId);
    const result = await query; if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ ok: true, logs: (result.data || []).map((item) => ({ id: item.id, actorUid: item.actor_uid, tenantId: item.tenant_id, action: item.action, details: item.details, createdAt: item.created_at })), total: result.count || 0, page, pageSize, hasNext: from + pageSize < (result.count || 0), generatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { const response = superadminErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
