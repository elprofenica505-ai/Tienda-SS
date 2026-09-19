import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertResolvedBranchAccess, resolveAuthorizedBranchId, resolveTenantBranchAndWarehouse } from '@/lib/organization-scope';
import { writeImmutableAudit } from '@/lib/audit';
import { isMissingServerPricedRpc, priceSaleItemsFromCatalog } from '@/lib/sale-rpc';
import { createFiscalSaleFields } from '@/lib/fiscal-ni';
import { getFiscalAdapter, normalizeFiscalConfig, type FiscalEmissionResult } from '@/lib/fiscal-adapters';

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
    PRESALE_OTHER_BRANCH: ['La preventa es de otra sucursal.', 409],
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
    const requestedBranchId = text(body.branchId, 128) || text(request.headers.get('x-branch-id'), 128);
    if (!presaleId || !paymentMethod) throw new Error('PRESALE_NOT_FOUND');
    const branchId = await resolveAuthorizedBranchId(context, requestedBranchId || undefined);
    assertResolvedBranchAccess(context, requestedBranchId || branchId, branchId);

    const supabase = getSupabaseServer();
    const presaleResult = await supabase.from('presales').select('id,ticket_code,items,total,seller_uid,seller_email,status,sale_id,branch_id,warehouse_id,reservation_id,metadata').eq('tenant_id', context.tenantId).eq('id', presaleId).maybeSingle();
    if (presaleResult.error) throw new Error(presaleResult.error.message);
    if (!presaleResult.data) throw new Error('PRESALE_NOT_FOUND');
    const presale = presaleResult.data;
    if (presale.branch_id && presale.branch_id !== branchId) throw new Error('PRESALE_OTHER_BRANCH');
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
    const warehouseId = (await resolveTenantBranchAndWarehouse(context.tenantId, branchId, requestedWarehouseId)).warehouseId;
    if (!warehouseId) throw new Error('WAREHOUSE_NOT_FOUND');
    const needsCashSession = paymentMethod === 'cash' || (paymentMethod === 'mixed' && splitCashAmount > 0);
    let cashSessionId: string | null = !needsCashSession ? null : text(body.cashSessionId, 128);
    if (needsCashSession && !cashSessionId) {
      const session = await supabase.from('cash_sessions').select('id').eq('tenant_id', context.tenantId).eq('branch_id', branchId).eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle();
      if (session.error) throw new Error(session.error.message);
      cashSessionId = session.data?.id || null;
    }
    if (needsCashSession && !cashSessionId) throw new Error('CASH_SESSION_REQUIRED');
    if (needsCashSession && cashSessionId) {
      const session = await supabase.from('cash_sessions').select('id').eq('tenant_id', context.tenantId).eq('id', cashSessionId).eq('branch_id', branchId).eq('status', 'open').maybeSingle();
      if (session.error) throw new Error(session.error.message);
      if (!session.data) throw new Error('CASH_SESSION_NOT_OPEN');
    }

    const items = Array.from(itemsMap.entries()).map(([productId, quantity]) => {
      const source = rawItems.find((item: Record<string, unknown>) => text(item.productId, 128) === productId) || {};
      return { productId, quantity, unitPrice: money(source.unitPrice) };
    });
    const metadata = { presaleId, ticketCode: text(presale.ticket_code, 80), cashReceived, changeAmount, sellerUid: text(presale.seller_uid, 128), sellerEmail: text(presale.seller_email, 160) };
    // create_sale remains the underlying atomic RPC (compat: supabase.rpc('create_sale'));
    // this wrapper recalculates price/tax server-side.
    const saleArgs = { target_tenant_id: context.tenantId, target_branch_id: branchId, target_warehouse_id: warehouseId, target_cash_session_id: cashSessionId, target_customer_id: text(body.customerId, 128) || null, target_user_id: context.uid, target_discount: money(body.discount), target_idempotency_key: `presale:${presaleId}`, target_metadata: metadata, target_items: items };
    const result = splitPayments.length
      ? await supabase.rpc('create_sale_with_payments_server_priced', { ...saleArgs, target_payments: splitPayments })
      : await supabase.rpc('create_sale_server_priced', { ...saleArgs, target_payment_method: paymentMethod });
    let saleResult = result;
    if (result.error && isMissingServerPricedRpc(result.error)) {
      const fallbackPricing = await priceSaleItemsFromCatalog(context.tenantId, items);
      const fallbackArgs = { ...saleArgs, target_items: fallbackPricing.items, target_metadata: { ...metadata, taxAmount: fallbackPricing.taxAmount, priceSource: 'server_catalog_fallback' } };
      saleResult = splitPayments.length
        ? await supabase.rpc('create_sale_with_payments', { ...fallbackArgs, target_payments: splitPayments })
        : await supabase.rpc('create_sale', { ...fallbackArgs, target_payment_method: paymentMethod });
    }
    if (saleResult.error) throw new Error(saleResult.error.message);
    const data = saleResult.data || {};
    const replayed = data.replayed === true;
    if (presale.reservation_id && !replayed) {
      const consumed = await supabase.rpc('consume_inventory_reservation', { target_tenant_id: context.tenantId, target_reservation_id: presale.reservation_id, target_user_id: context.uid });
      if (consumed.error && !/RESERVATION_CLOSED|RESERVATION_NOT_FOUND/i.test(consumed.error.message || '')) throw new Error(consumed.error.message);
    }
    const fiscalConfig = await supabase.from('fiscal_configs').select('provider,legal_name,tax_id,metadata').eq('tenant_id', context.tenantId).maybeSingle();
    const fiscalMetadata = fiscalConfig.data?.metadata && typeof fiscalConfig.data.metadata === 'object' ? fiscalConfig.data.metadata as Record<string, unknown> : {};
    const config = normalizeFiscalConfig({ ...fiscalMetadata, provider: fiscalConfig.data?.provider, legalName: fiscalConfig.data?.legal_name, taxId: fiscalConfig.data?.tax_id });
    const issuer = { legalName: fiscalConfig.data?.legal_name || undefined, taxId: fiscalConfig.data?.tax_id || undefined, address: typeof fiscalMetadata.address === 'string' ? fiscalMetadata.address : undefined, phone: typeof fiscalMetadata.phone === 'string' ? fiscalMetadata.phone : undefined, email: typeof fiscalMetadata.email === 'string' ? fiscalMetadata.email : undefined, logoDataUrl: typeof fiscalMetadata.logoDataUrl === 'string' ? fiscalMetadata.logoDataUrl : undefined };
    const sellerProfile = presale.seller_uid ? await supabase.from('profiles').select('display_name,email').eq('auth_user_id', presale.seller_uid).maybeSingle() : { data: null };
    const seller = { name: sellerProfile.data?.display_name || presale.seller_email || presale.seller_uid || 'Vendedor', email: sellerProfile.data?.email || presale.seller_email || undefined };
    let fiscalEmission: FiscalEmissionResult = { status: 'not_requested', provider: config.provider };
    const shouldEmitFiscal = config.mode !== 'manual' && (config.provider === 'generic_api' || config.provider === 'dgi_nicaragua' || config.provider === 'custom');
    if (shouldEmitFiscal) {
      const invoiceNumber = text(data.invoiceNumber || data.saleNumber || data.saleId, 80);
      const adapter = getFiscalAdapter(config.provider, config);
      fiscalEmission = { status: 'pending', provider: config.provider, message: 'Venta guardada; pendiente_envio_fiscal.' };
      const fiscalRequest = {
        tenantId: context.tenantId,
        saleId: text(data.saleId, 128),
        invoiceNumber,
        fields: createFiscalSaleFields({ documentType: 'invoice', customerName: text(body.customerId, 128) ? 'Cliente registrado' : 'Cliente mostrador', customerRuc: '', customerAddress: '' }, Number(data.subtotal ?? data.total ?? 0), Number(data.discount ?? 0)),
        items: rawItems,
        config,
      };
      void adapter.emit(fiscalRequest).then(async (emission) => {
        await supabase.from('presales').update({ metadata: { ...(presale.metadata && typeof presale.metadata === 'object' ? presale.metadata : {}), fiscalStatus: emission.status === 'rejected' ? 'pendiente_envio_fiscal' : emission.status, fiscalExternalId: emission.externalId || null, fiscalMessage: emission.message || null, fiscalUpdatedAt: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq('tenant_id', context.tenantId).eq('id', presaleId);
      }).catch(async (error) => {
        await supabase.from('presales').update({ metadata: { ...(presale.metadata && typeof presale.metadata === 'object' ? presale.metadata : {}), fiscalStatus: 'pendiente_envio_fiscal', fiscalMessage: error instanceof Error ? error.message : 'Proveedor fiscal no disponible.', fiscalUpdatedAt: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq('tenant_id', context.tenantId).eq('id', presaleId);
      });
    }
    const updatedPresale = await supabase.from('presales').update({ status: 'paid', sale_id: data.saleId, paid_by: context.uid, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('tenant_id', context.tenantId).eq('id', presaleId).eq('status', 'sent_to_cashier').select('id').maybeSingle();
    if (updatedPresale.error) throw new Error(updatedPresale.error.message);
    if (!updatedPresale.data) {
      const confirmed = await supabase.from('presales').select('sale_id,status').eq('tenant_id', context.tenantId).eq('id', presaleId).maybeSingle();
      if (confirmed.data?.status === 'paid' && confirmed.data.sale_id === data.saleId) {
        return NextResponse.json({ ok: true, ...data, ticketCode: presale.ticket_code, paymentMethod, cashReceived, changeAmount, items: rawItems, alreadyPaid: true });
      }
      throw new Error('PRESALE_NOT_READY');
    }
    try {
      await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'sale.created_from_presale', entity: 'sale', entityId: data.saleId, after: data, metadata: { presaleId }, result: 'success' });
    } catch (auditError) {
      console.error('presale_checkout_audit_failed_after_commit', auditError);
    }
    return NextResponse.json({ ok: true, ...data, ticketCode: presale.ticket_code, paymentMethod, cashReceived, changeAmount, items: rawItems, issuer, seller, fiscal: { mode: config.mode, provider: config.provider, showBarcode: config.showBarcode !== false, status: shouldEmitFiscal ? 'pendiente_envio_fiscal' : 'local', emission: fiscalEmission }, alreadyPaid: false }, { status: 201 });
  } catch (error: unknown) { return errorResponse(error); }
}
