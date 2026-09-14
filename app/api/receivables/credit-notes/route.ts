import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { writeImmutableAudit } from '@/lib/audit';
import { assertBranchAccess } from '@/lib/data-scope';

export const runtime = 'nodejs';
function text(value: unknown, max = 300) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function amount(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(0, value) * 100) / 100 : 0; }
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const known: Record<string, [string, number]> = { SALE_NOT_FOUND: ['La venta no existe.', 404], SALE_VOID: ['Una venta anulada no admite nota de crédito.', 409], INVALID_CREDIT_NOTE: ['Venta, monto y motivo son obligatorios.', 400], CREDIT_NOTE_EXCEEDS_TOTAL: ['La nota de crédito supera el total disponible de la venta.', 409], SALE_WRONG_BRANCH: ['La venta no pertenece a la sucursal activa.', 403] };
  for (const [key, value] of Object.entries(known)) if (message.includes(key)) return NextResponse.json({ error: value[0] }, { status: value[1] });
  const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'receivables', 'edit');
    const body = await request.json();
    const saleId = text(body.saleId, 128);
    const noteAmount = amount(body.amount);
    const reason = text(body.reason);
    if (!saleId || noteAmount <= 0 || reason.length < 3) return NextResponse.json({ error: 'Venta, monto y motivo son obligatorios.' }, { status: 400 });
    const branchId = text(body.branchId, 120) || request.headers.get('x-branch-id')?.trim() || context.branchIds[0] || '';
    if (!branchId) return NextResponse.json({ error: 'Selecciona una sucursal para crear la nota de crédito.' }, { status: 400 });
    assertBranchAccess(context, branchId);
    const sale = await getSupabaseServer().from('sales').select('id,branch_id,total,metadata,status').eq('id', saleId).eq('tenant_id', context.tenantId).single();
    if (sale.error || !sale.data) throw new Error('SALE_NOT_FOUND');
    if (sale.data.branch_id !== branchId) throw new Error('SALE_WRONG_BRANCH');
    const result = await getSupabaseServer().rpc('create_credit_note', { target_tenant_id: context.tenantId, target_sale_id: saleId, target_branch_id: sale.data.branch_id, target_user_id: context.uid, target_amount: noteAmount, target_reason: reason });
    if (result.error) throw new Error(result.error.message);
    const data = result.data as Record<string, unknown>;
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'receivable.credit_note_created', entity: 'sale', entityId: saleId, before: { total: sale.data.total, metadata: sale.data.metadata }, after: data, metadata: { creditNoteId: data.creditNoteId, amount: noteAmount }, request: { requestId: request.headers.get('x-correlation-id') || undefined, method: 'POST', path: '/api/receivables/credit-notes' }, result: 'success' });
    return NextResponse.json({ ok: true, ...data }, { status: 201 });
  } catch (error: unknown) { return failure(error); }
}
