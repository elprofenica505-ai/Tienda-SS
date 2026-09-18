import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
function text(value: unknown, max = 300) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function failure(error: unknown) { const message = error instanceof Error ? error.message : ''; const known: Record<string, [string, number]> = { SALE_NOT_FOUND: ['La venta no existe.', 404], SALE_VOID: ['Una venta anulada no puede devolverse.', 409], RETURN_LINES_INVALID: ['La devolución debe contener productos válidos.', 400], RETURN_EXCEEDS_SOLD: ['La devolución supera la cantidad vendida o ya devuelta.', 409], CASH_SESSION_NOT_OPEN: ['Abre una sesión de caja para entregar el reembolso.', 409], INVALID_REFUND_METHOD: ['El método de devolución no es válido.', 400] }; for (const [key, value] of Object.entries(known)) if (message.includes(key)) return NextResponse.json({ error: value[0] }, { status: value[1] }); const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'edit');
    const body = await request.json();
    const saleId = text(body.saleId, 128);
    if (!saleId) return NextResponse.json({ error: 'La venta es obligatoria.' }, { status: 400 });
    const sale = await getSupabaseServer().from('sales').select('branch_id').eq('id', saleId).eq('tenant_id', context.tenantId).single();
    if (sale.error || !sale.data) return NextResponse.json({ error: 'La venta no existe.' }, { status: 404 });
    assertBranchAccess(context, sale.data.branch_id);
    const refundMethod = text(body.refundMethod, 30) || 'cash';
    const idempotencyKey = text(request.headers.get('idempotency-key'), 160) || text(body.idempotencyKey, 160);
    if (!idempotencyKey) return NextResponse.json({ error: 'La llave de idempotencia es obligatoria para devoluciones.' }, { status: 400 });
    const items = Array.isArray(body.items) ? body.items.map((item: Record<string, unknown>) => ({ productId: text(item.productId, 128), quantity: item.quantity })).filter((item: { productId: string; quantity: unknown }) => item.productId) : [];
    const supabase = getSupabaseServer();
    let cashSessionId = text(body.cashSessionId, 128) || '';
    if (refundMethod !== 'credit' && cashSessionId) {
      const requestedSession = await supabase.from('cash_sessions').select('id').eq('tenant_id', context.tenantId).eq('id', cashSessionId).eq('branch_id', sale.data.branch_id).eq('status', 'open').maybeSingle();
      if (requestedSession.error) throw new Error(requestedSession.error.message);
      if (!requestedSession.data) throw new Error('CASH_SESSION_NOT_OPEN');
    }
    if (refundMethod !== 'credit' && !cashSessionId) {
      const session = await supabase.from('cash_sessions').select('id').eq('tenant_id', context.tenantId).eq('branch_id', sale.data.branch_id).eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle();
      if (session.error) throw new Error(session.error.message);
      cashSessionId = session.data?.id || '';
    }
    // The wrapper delegates to create_sale_return and serializes retries by key.
    const result = await supabase.rpc('create_sale_return_idempotent', { target_tenant_id: context.tenantId, target_sale_id: saleId, target_user_id: context.uid, target_refund_method: refundMethod, target_cash_session_id: cashSessionId || null, target_reason: text(body.reason, 300) || 'Devolución', target_items: items, target_idempotency_key: idempotencyKey });
    if (result.error) throw new Error(result.error.message);
    const data = result.data || {};
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'sale.returned', entity: 'sale', entityId: saleId, after: data, result: 'success' });
    return NextResponse.json({ ok: true, ...data }, { status: 201 });
  } catch (error: unknown) { return failure(error); }
}
