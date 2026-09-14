import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantMember, tenantErrorResponse } from '@/lib/tenant';

export const runtime = 'nodejs';
function text(value: unknown, max = 128) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantMember(request);
    const result = await getSupabaseServer().from('notifications').select('id,notification_type,title,message,metadata,is_read,created_at,read_at,read_by').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(50);
    if (result.error) throw new Error(result.error.message);
    const notifications = (result.data || []).map((item) => ({ id: item.id, type: item.notification_type, title: item.title, message: item.message, metadata: item.metadata, read: item.is_read, createdAt: item.created_at, readAt: item.read_at, readBy: item.read_by }));
    return NextResponse.json({ ok: true, notifications }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
export async function PATCH(request: NextRequest) {
  try {
    const context = await requireTenantMember(request);
    const body = await request.json(); const id = text(body.id);
    if (!id) return NextResponse.json({ error: 'Alerta inválida.' }, { status: 400 });
    const result = await getSupabaseServer().from('notifications').update({ is_read: true, read_at: new Date().toISOString(), read_by: context.uid }).eq('id', id).eq('tenant_id', context.tenantId).select('id').maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (!result.data) return NextResponse.json({ error: 'Alerta no encontrada.' }, { status: 404 });
    return NextResponse.json({ ok: true, id });
  } catch (error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
