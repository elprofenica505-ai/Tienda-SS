import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';

export const runtime = 'nodejs';
function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function money(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(0, value) * 100) / 100 : 0; }
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const known: Record<string, [string, number]> = {
    PAYABLE_NOT_FOUND: ['La cuenta por pagar no existe.', 404],
    PAYABLE_CLOSED: ['La cuenta por pagar ya está cerrada.', 409],
    PAYMENT_EXCEEDS_PAYABLE: ['El pago supera el saldo pendiente del proveedor.', 409],
    CASH_SESSION_NOT_OPEN: ['La sesión de caja no está abierta.', 409],
    IDEMPOTENCY_KEY_REQUIRED: ['La llave de idempotencia es obligatoria.', 400],
    INVALID_PAYABLE_PAYMENT: ['El monto o método de pago no es válido.', 400],
  };
  for (const [key, value] of Object.entries(known)) if (message.includes(key)) return NextResponse.json({ error: value[0] }, { status: value[1] });
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'inventory', 'edit');
    const body = await request.json();
    const payableId = text(body.payableId, 128);
    const paymentMethod = ['cash', 'bank_transfer', 'card', 'other'].includes(body.paymentMethod) ? body.paymentMethod : '';
    const amount = money(body.amount);
    const idempotencyKey = text(request.headers.get('idempotency-key'), 160) || text(body.idempotencyKey, 160);
    if (!payableId || !paymentMethod || amount <= 0 || !idempotencyKey) return NextResponse.json({ error: 'Cuenta, monto, método y llave de idempotencia son obligatorios.' }, { status: 400 });
    const result = await getSupabaseServer().rpc('payable_payment_idempotent', {
      target_tenant_id: context.tenantId,
      target_payable_id: payableId,
      target_amount: amount,
      target_payment_method: paymentMethod,
      target_user_id: context.uid,
      target_notes: text(body.notes, 300),
      target_idempotency_key: idempotencyKey,
      target_cash_session_id: text(body.cashSessionId, 128) || null,
    });
    if (result.error) throw new Error(result.error.message);
    const data = result.data || {};
    return NextResponse.json({ ok: true, ...data }, { status: data.replayed ? 200 : 201 });
  } catch (error: unknown) { return failure(error); }
}
