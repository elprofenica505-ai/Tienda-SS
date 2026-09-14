import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
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
    const paymentMethod = ['cash', 'card', 'transfer', 'credit'].includes(body.paymentMethod) ? body.paymentMethod : '';
    const branchId = text(body.branchId, 128) || text(request.headers.get('x-branch-id'), 128) || context.branchIds[0] || '';
    if (!presaleId || !paymentMethod) throw new Error('PRESALE_NOT_FOUND');
    if (!branchId) throw new Error('BRANCH_NOT_FOUND');
    assertBranchAccess(context, branchId);

    const db = getAdminDb();
    const presaleRef = db.collection('tenants').doc(context.tenantId).collection('presales').doc(presaleId);
    const presaleSnapshot = await presaleRef.get();
    if (!presaleSnapshot.exists) throw new Error('PRESALE_NOT_FOUND');
    const presale = presaleSnapshot.data() || {};
    if (presale.status === 'paid') return NextResponse.json({ ok: true, saleId: presale.saleId, total: Number(presale.total || 0), alreadyPaid: true });
    if (presale.status !== 'sent_to_cashier') throw new Error('PRESALE_NOT_READY');
    const rawItems = Array.isArray(presale.items) ? presale.items : [];
    const itemsMap = new Map<string, number>();
    rawItems.forEach((item: Record<string, unknown>) => { const id = text(item.productId, 128); const quantity = Number(item.quantity); if (id && Number.isInteger(quantity) && quantity > 0) itemsMap.set(id, (itemsMap.get(id) || 0) + quantity); });
    if (!itemsMap.size) throw new Error('PRESALE_EMPTY');
    const presaleTotal = money(presale.total);
    const cashReceived = paymentMethod === 'cash' ? money(body.cashReceived || presaleTotal) : 0;
    if (paymentMethod === 'cash' && cashReceived < presaleTotal) throw new Error('CASH_RECEIVED_TOO_LOW');
    const changeAmount = paymentMethod === 'cash' ? Math.round((cashReceived - presaleTotal) * 100) / 100 : 0;

    const supabase = getSupabaseServer();
    const warehouse = await supabase.from('warehouses').select('id').eq('tenant_id', context.tenantId).eq('branch_id', branchId).eq('active', true).order('name').limit(1).maybeSingle();
    if (warehouse.error) throw new Error(warehouse.error.message);
    if (!warehouse.data?.id) throw new Error('WAREHOUSE_NOT_FOUND');
    const warehouseId = warehouse.data.id;
    let cashSessionId: string | null = paymentMethod === 'credit' ? null : text(body.cashSessionId, 128);
    if (paymentMethod !== 'credit' && !cashSessionId) {
      const session = await supabase.from('cash_sessions').select('id').eq('tenant_id', context.tenantId).eq('branch_id', branchId).eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle();
      if (session.error) throw new Error(session.error.message);
      cashSessionId = session.data?.id || null;
    }
    if (paymentMethod !== 'credit' && !cashSessionId) throw new Error('CASH_SESSION_REQUIRED');

    const items = Array.from(itemsMap.entries()).map(([productId, quantity]) => {
      const source = rawItems.find((item: Record<string, unknown>) => text(item.productId, 128) === productId) || {};
      return { productId, quantity, unitPrice: money(source.unitPrice) };
    });
    const result = await supabase.rpc('create_sale', {
      target_tenant_id: context.tenantId,
      target_branch_id: branchId,
      target_warehouse_id: warehouseId,
      target_cash_session_id: cashSessionId,
      target_customer_id: text(body.customerId, 128) || null,
      target_user_id: context.uid,
      target_payment_method: paymentMethod,
      target_discount: money(body.discount),
      target_idempotency_key: `presale:${presaleId}`,
      target_metadata: { presaleId, ticketCode: text(presale.ticketCode, 80), cashReceived, changeAmount, sellerUid: text(presale.vendedorUid, 128), sellerEmail: text(presale.vendedorEmail, 160) },
      target_items: items,
    });
    if (result.error) throw new Error(result.error.message);
    const data = result.data || {};
    const fiscalConfig = await supabase.from('fiscal_configs').select('legal_name,tax_id,metadata').eq('tenant_id', context.tenantId).maybeSingle();
    const fiscalMetadata = fiscalConfig.data?.metadata && typeof fiscalConfig.data.metadata === 'object' ? fiscalConfig.data.metadata as Record<string, unknown> : {};
    const issuer = { legalName: fiscalConfig.data?.legal_name || undefined, taxId: fiscalConfig.data?.tax_id || undefined, address: typeof fiscalMetadata.address === 'string' ? fiscalMetadata.address : undefined, phone: typeof fiscalMetadata.phone === 'string' ? fiscalMetadata.phone : undefined, email: typeof fiscalMetadata.email === 'string' ? fiscalMetadata.email : undefined, logoDataUrl: typeof fiscalMetadata.logoDataUrl === 'string' ? fiscalMetadata.logoDataUrl : undefined };
    const sellerProfile = presale.vendedorUid ? await supabase.from('profiles').select('display_name,email').eq('auth_user_id', presale.vendedorUid).maybeSingle() : { data: null };
    const seller = { name: sellerProfile.data?.display_name || presale.vendedorEmail || presale.vendedorUid || 'Vendedor', email: sellerProfile.data?.email || presale.vendedorEmail || undefined };
    await presaleRef.update({ status: 'paid', saleId: data.saleId, paidBy: context.uid, paidAt: new Date(), updatedAt: new Date() });
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'sale.created_from_presale', entity: 'sale', entityId: data.saleId, after: data, metadata: { presaleId }, result: 'success' });
    return NextResponse.json({ ok: true, ...data, ticketCode: presale.ticketCode, paymentMethod, cashReceived, changeAmount, items: rawItems, issuer, seller, fiscal: { mode: fiscalMetadata.mode || 'manual' }, alreadyPaid: false }, { status: 201 });
  } catch (error: unknown) { return errorResponse(error); }
}
