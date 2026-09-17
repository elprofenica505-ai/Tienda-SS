import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function money(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0; }
function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const known: Record<string, [string, number]> = {
    PRESALE_NOT_FOUND: ['La preventa no existe en esta empresa.', 404],
    PRESALE_NOT_READY: ['La preventa todavía no está lista para caja.', 409],
    PRESALE_EMPTY: ['La preventa no contiene productos.', 409],
    WAREHOUSE_NOT_FOUND: ['El almacén activo de la sucursal no está configurado.', 404],
    CASH_SESSION_REQUIRED: ['Abre una sesión de caja antes de cobrar el ticket.', 409],
    CASH_SESSION_NOT_OPEN: ['La sesión de caja no está abierta.', 409],
    PRODUCT_NOT_FOUND: ['Uno de los productos ya no está disponible.', 404],
    INSUFFICIENT_STOCK: ['No hay existencias suficientes para completar el cobro.', 409],
    CREDIT_LIMIT_EXCEEDED: ['La venta supera el límite de crédito del cliente.', 409],
    CUSTOMER_CREDIT_BLOCKED: ['El cliente no puede generar nueva deuda.', 409],
    INVALID_PAYMENT_SPLIT: ['La distribución de pagos no es válida.', 400],
    PAYMENT_TOTAL_MISMATCH: ['La suma de los pagos debe coincidir con el total.', 409],
    INVALID_SALE_TOTAL: ['El total de la venta debe ser mayor que cero.', 400],
    CASH_RECEIVED_TOO_LOW: ['El efectivo recibido es menor que el total del ticket.', 400],
    BRANCH_NOT_FOUND: ['La sucursal no existe o no está activa.', 404],
  };
  for (const [key, value] of Object.entries(known)) if (message.includes(key)) return NextResponse.json({ error: value[0] }, { status: value[1] });
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'create');
    const body = await request.json();
    const presaleId = text(body.presaleId, 128);
    const splitPayments = Array.isArray(body.payments) ? body.payments.map((item: Record<string, unknown>) => ({ method: text(item.method, 20), amount: money(item.amount) })).filter((item: { method: string; amount: number }) => item.method && item.amount > 0) : [];
    const paymentMethod = splitPayments.length ? 'mixed' : (['cash', 'card', 'transfer', 'credit'].includes(body.paymentMethod) ? body.paymentMethod : '');
    const branchId = text(body.branchId, 128) || text(request.headers.get('x-branch-id'), 128) || context.branchIds[0] || '';
    if (!presaleId || !paymentMethod) throw new Error('PRESALE_NOT_FOUND');
    if (!branchId) throw new Error('BRANCH_NOT_FOUND');
    assertBranchAccess(context, branchId);

    const supabase = getSupabaseServer();
    const presaleResult = await supabase.from('presales').select('id,ticket_code,items,total,seller_uid,seller_email,status,sale_id,branch_id,warehouse_id,reservation_id').eq('tenant_id', context.tenantId).eq('id', presaleId).maybeSingle();
    if (presaleResult.error) throw new Error(presaleResult.error.message);
    if (!presaleResult.data) throw new Error('PRESALE_NOT_FOUND');
    const presale = presaleResult.data;
    if (presale.branch_id && presale.branch_id !== branchId) throw new Error('BRANCH_NOT_FOUND');
    if (presale.status === 'paid') return NextResponse.json({ ok: true, saleId: presale.sale_id, total: Number(presale.total || 0), alreadyPaid: true });
    if (presale.status !== 'sent_to_cashier') throw new Error('PRESALE_NOT_READY');
    const rawItems = Array.isArray(presale.items) ? presale.items as Array<Record<string, unknown>> : [];
    const itemsMap = new Map<string, number>();
    rawItems.forEach((item: Record<string, unknown>) => { const id = text(item.productId, 128); const quantity = Number(item.quantity); if (id && Number.isInteger(quantity) && quantity > 0) itemsMap.set(id, (itemsMap.get(id) || 0) + quantity); });
    if (!itemsMap.size) throw new Error('PRESALE_EMPTY');
    const presaleTotal = money(Number(presale.total));
    const splitCashAmount = splitPayments.filter((item: { method: string; amount: number }) => item.method !== 'credit').reduce((sum: number, item: { method: string; amount: number }) => sum + item.amount, 0);
    const cashReceived = paymentMethod === 'cash' ? money(body.cashReceived || presaleTotal) : splitCashAmount;
    if (paymentMethod === 'cash' && cashReceived < presaleTotal) throw new Error('CASH_RECEIVED_TOO_LOW');
    const changeAmount = paymentMethod === 'cash' ? Math.round((cashReceived - presaleTotal) * 100) / 100 : 0;

    const requestedWarehouseId = text(body.warehouseId, 128) || text(presale.warehouse_id, 128);
    const warehouse = await supabase.from('warehouses').select('id').eq('tenant_id', context.tenantId).eq('branch_id', branchId).eq('active', true).match(requestedWarehouseId ? { id: requestedWarehouseId } : {}).order('name').limit(1).maybeSingle();
    if (warehouse.error) throw new Error(warehouse.error.message);
    if (!warehouse.data?.id) throw new Error('WAREHOUSE_NOT_FOUND');
    const warehouseId = warehouse.data.id;
    const needsCashSession = paymentMethod !== 'credit' && (paymentMethod !== 'mixed' || splitCashAmount > 0);
    let cashSessionId: string | null = !needsCashSession ? null : text(body.cashSessionId, 128);
    if (needsCashSession && !cashSessionId) {
      const session = await supabase.from('cash_sessions').select('id').eq('tenant_id', context.tenantId).eq('branch_id', branchId).eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle();
      if (session.error) throw new Error(session.error.message);
      cashSessionId = session.data?.id || null;
    }
    if (needsCashSession && !cashSessionId) throw new Error('CASH_SESSION_REQUIRED');

    const items = Array.from(itemsMap.entries()).map(([productId, quantity]) => {
      const source = rawItems.find((item: Record<string, unknown>) => text(item.productId, 128) === productId) || {};
      return { productId, quantity, unitPrice: money(source.unitPrice) };
    });
    const metadata = { presaleId, ticketCode: text(presale.ticket_code, 80), cashReceived, changeAmount, sellerUid: text(presale.seller_uid, 128), sellerEmail: text(presale.seller_email, 160) };
    const result = splitPayments.length
      ? await supabase.rpc('create_sale_with_payments', { target_tenant_id: context.tenantId, target_branch_id: branchId, target_warehouse_id: warehouseId, target_cash_session_id: cashSessionId, target_customer_id: text(body.customerId, 128) || null, target_user_id: context.uid, target_discount: money(body.discount), target_idempotency_key: `presale:${presaleId}`, target_metadata: metadata, target_items: items, target_payments: splitPayments })
      : await supabase.rpc('create_sale', { target_tenant_id: context.tenantId, target_branch_id: branchId, target_warehouse_id: warehouseId, target_cash_session_id: cashSessionId, target_customer_id: text(body.customerId, 128) || null, target_user_id: context.uid, target_payment_method: paymentMethod, target_discount: money(body.discount), target_idempotency_key: `presale:${presaleId}`, target_metadata: metadata, target_items: items });
    if (result.error) throw new Error(result.error.message);
    const data = result.data || {};
    const replayed = data.replayed === true;
    if (presale.reservation_id && !replayed) {
      const consumed = await supabase.rpc('consume_inventory_reservation', { target_tenant_id: context.tenantId, target_reservation_id: presale.reservation_id, target_user_id: context.uid });
      if (consumed.error && !/RESERVATION_CLOSED|RESERVATION_NOT_FOUND/i.test(consumed.error.message || '')) throw new Error(consumed.error.message);
    }
    const fiscalConfig = await supabase.from('fiscal_configs').select('legal_name,tax_id,metadata').eq('tenant_id', context.tenantId).maybeSingle();
    const fiscalMetadata = fiscalConfig.data?.metadata && typeof fiscalConfig.data.metadata === 'object' ? fiscalConfig.data.metadata as Record<string, unknown> : {};
    const issuer = { legalName: fiscalConfig.data?.legal_name || undefined, taxId: fiscalConfig.data?.tax_id || undefined, address: typeof fiscalMetadata.address === 'string' ? fiscalMetadata.address : undefined, phone: typeof fiscalMetadata.phone === 'string' ? fiscalMetadata.phone : undefined, email: typeof fiscalMetadata.email === 'string' ? fiscalMetadata.email : undefined, logoDataUrl: typeof fiscalMetadata.logoDataUrl === 'string' ? fiscalMetadata.logoDataUrl : undefined };
    const sellerProfile = presale.seller_uid ? await supabase.from('profiles').select('display_name,email').eq('auth_user_id', presale.seller_uid).maybeSingle() : { data: null };
    const seller = { name: sellerProfile.data?.display_name || presale.seller_email || presale.seller_uid || 'Vendedor', email: sellerProfile.data?.email || presale.seller_email || undefined };
    const updatedPresale = await supabase.from('presales').update({ status: 'paid', sale_id: data.saleId, paid_by: context.uid, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('tenant_id', context.tenantId).eq('id', presaleId).eq('status', 'sent_to_cashier').select('id').maybeSingle();
    if (updatedPresale.error) throw new Error(updatedPresale.error.message);
    if (!updatedPresale.data) {
      const confirmed = await supabase.from('presales').select('sale_id,status').eq('tenant_id', context.tenantId).eq('id', presaleId).maybeSingle();
      if (confirmed.data?.status === 'paid' && confirmed.data.sale_id === data.saleId) {
        return NextResponse.json({ ok: true, ...data, ticketCode: presale.ticket_code, paymentMethod, cashReceived, changeAmount, items: rawItems, alreadyPaid: true });
      }
      throw new Error('PRESALE_NOT_READY');
    }
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'sale.created_from_presale', entity: 'sale', entityId: data.saleId, after: data, metadata: { presaleId }, result: 'success' });
    return NextResponse.json({ ok: true, ...data, ticketCode: presale.ticket_code, paymentMethod, cashReceived, changeAmount, items: rawItems, issuer, seller, fiscal: { mode: fiscalMetadata.mode || 'manual' }, alreadyPaid: false }, { status: 201 });
  } catch (error: unknown) { return errorResponse(error); }
}
