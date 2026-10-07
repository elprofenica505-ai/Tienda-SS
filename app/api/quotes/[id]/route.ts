import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
function text(value: unknown, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function fail(error: unknown) { const message = error instanceof Error ? error.message : ''; const known: Record<string, [string, number]> = { QUOTE_EXPIRED: ['La cotización ya venció.', 409], QUOTE_NOT_CONVERTIBLE: ['La cotización no está lista para convertirse.', 409], QUOTE_NOT_FOUND: ['La cotización no existe.', 404] }; for (const [key, value] of Object.entries(known)) if (message.includes(key)) return NextResponse.json({ error: value[0], code: key }, { status: value[1] }); const r = tenantErrorResponse(error); return NextResponse.json(r.body, { status: r.status }); }

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireTenantPermission(request, 'quotes', 'edit');
    const { id } = await params; const body = await request.json(); const action = text(body.action, 30);
    const supabase = getSupabaseServer();
    const current = await supabase.from('quotes').select('*').eq('tenant_id', context.tenantId).eq('id', id).maybeSingle();
    if (current.error) throw new Error(current.error.message); if (!current.data) return NextResponse.json({ error: 'La cotización no existe.' }, { status: 404 });
    assertBranchAccess(context, current.data.branch_id);
    if (context.role === 'vendedor' && current.data.seller_uid !== context.uid) throw new Error('FORBIDDEN');
    let result: unknown;
    if (action === 'convert') {
      const converted = await supabase.rpc('convert_quote_to_presale', { target_tenant_id: context.tenantId, target_quote_id: id, target_user_id: context.uid });
      if (converted.error) throw new Error(converted.error.message); result = converted.data;
    } else {
      const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (action === 'send' && current.data.status === 'draft') Object.assign(changes, { status: 'sent', sent_at: new Date().toISOString() });
      else if (action === 'accept' && current.data.status === 'sent') Object.assign(changes, { status: 'accepted', decided_at: new Date().toISOString() });
      else if (action === 'reject' && ['draft', 'sent', 'accepted'].includes(current.data.status)) { const reason = text(body.reason, 500); if (!reason) return NextResponse.json({ error: 'Escribe el motivo del rechazo.' }, { status: 400 }); Object.assign(changes, { status: 'rejected', rejection_reason: reason, decided_at: new Date().toISOString() }); }
      else return NextResponse.json({ error: 'La acción no corresponde al estado actual.' }, { status: 409 });
      const updated = await supabase.from('quotes').update(changes).eq('tenant_id', context.tenantId).eq('id', id).eq('status', current.data.status).select('*').maybeSingle();
      if (updated.error) throw new Error(updated.error.message); if (!updated.data) return NextResponse.json({ error: 'La cotización cambió mientras la actualizabas. Recarga la pantalla.' }, { status: 409 }); result = updated.data;
    }
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: `quote.${action}`, entity: 'quote', entityId: id, before: current.data, after: result, result: 'success' });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return fail(error); }
}
