import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
function text(value: unknown, max = 300) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function failure(error: unknown) { const message = error instanceof Error ? error.message : ''; const known: Record<string, [string, number]> = { SALE_NOT_FOUND: ['La venta no existe.', 404], SALE_ALREADY_VOID: ['La venta ya está anulada.', 409], SALE_HAS_PAYMENTS: ['Una venta con pagos registrados requiere una nota de crédito.', 409] }; for (const [key, value] of Object.entries(known)) if (message.includes(key)) return NextResponse.json({ error: value[0] }, { status: value[1] }); const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'edit');
    const body = await request.json();
    const saleId = text(body.saleId, 128);
    const reason = text(body.reason, 300);
    if (!saleId || reason.length < 3) return NextResponse.json({ error: 'Venta y motivo de anulación son obligatorios.' }, { status: 400 });
    const sale = await getSupabaseServer().from('sales').select('branch_id').eq('id', saleId).eq('tenant_id', context.tenantId).single();
    if (sale.error || !sale.data) return NextResponse.json({ error: 'La venta no existe.' }, { status: 404 });
    assertBranchAccess(context, sale.data.branch_id);
    const result = await getSupabaseServer().rpc('void_sale', { target_tenant_id: context.tenantId, target_sale_id: saleId, target_user_id: context.uid, target_reason: reason });
    if (result.error) throw new Error(result.error.message);
    const data = result.data || {};
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'sale.voided', entity: 'sale', entityId: saleId, after: { ...data, reason }, result: 'success' });
    return NextResponse.json({ ok: true, ...data });
  } catch (error: unknown) { return failure(error); }
}
