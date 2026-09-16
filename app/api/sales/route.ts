import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
const MANAGER_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);
function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function money(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value * 100) / 100) : 0; }
type SalesCursor = { createdAt: string; id: string };
function decodeSalesCursor(raw: string): SalesCursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<SalesCursor>;
    if (typeof parsed.createdAt !== 'string' || !parsed.createdAt || typeof parsed.id !== 'string' || !parsed.id) throw new Error('invalid');
    if (Number.isNaN(Date.parse(parsed.createdAt))) throw new Error('invalid');
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch { throw new Error('INVALID_SALES_CURSOR'); }
}
function encodeSalesCursor(cursor: SalesCursor) { return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url'); }
function failure(error: unknown) { const message = error instanceof Error ? error.message : ''; const known: Record<string, [string, number]> = { PRODUCT_NOT_FOUND: ['Uno de los productos ya no está disponible.', 404], CUSTOMER_NOT_FOUND: ['El cliente seleccionado no existe o está archivado.', 404], BRANCH_NOT_FOUND: ['La sucursal no existe o no está activa.', 404], WAREHOUSE_NOT_FOUND: ['El almacén no existe o no está activo.', 404], CASH_SESSION_REQUIRED: ['Abre una sesión de caja antes de registrar cobros.', 409], CASH_SESSION_NOT_OPEN: ['La sesión de caja no está abierta.', 409], INSUFFICIENT_STOCK: ['No hay existencias suficientes para completar la venta.', 409], CREDIT_LIMIT_EXCEEDED: ['La venta supera el límite de crédito del cliente.', 409], INVALID_PAYMENT_METHOD: ['El método de pago no es válido.', 400], INVALID_SALE_ITEMS: ['La venta debe contener entre 1 y 50 productos.', 400], INVALID_SALE_QUANTITY: ['Las cantidades de la venta no son válidas.', 400] }; for (const [key, value] of Object.entries(known)) if (message.includes(key)) return NextResponse.json({ error: value[0] }, { status: value[1] }); const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'view');
    const branchId = text(request.headers.get('x-branch-id'), 128);
    const params = request.nextUrl.searchParams;
    const rawLimit = Number(params.get('limit') || 50);
    const pageSize = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.floor(rawLimit))) : 50;
    const rawCursor = text(params.get('cursor'), 512);
    if (branchId) assertBranchAccess(context, branchId);
    let query = getSupabaseServer().from('sales').select('id,tenant_id,branch_id,cash_register_id,customer_id,invoice_number,status,subtotal,tax,discount,total,sold_by,metadata,created_at,updated_at,sale_items(id,tenant_id,sale_id,product_id,warehouse_id,quantity,unit_price,tax,discount,line_total),sale_payments(id,tenant_id,sale_id,payment_method,amount,reference,created_at)').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize + 1);
    let cursor: SalesCursor | null = null;
    if (rawCursor) {
      try { cursor = decodeSalesCursor(rawCursor); } catch { return NextResponse.json({ error: 'Cursor de ventas inválido.' }, { status: 400 }); }
      query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    }
    if (branchId) query = query.eq('branch_id', branchId);
    else if (!MANAGER_ROLES.has(context.role)) query = query.in('branch_id', context.branchIds.slice(0, 100));
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    const fetchedRows = result.data || [];
    const hasMore = fetchedRows.length > pageSize;
    const rows = fetchedRows.slice(0, pageSize);
    const saleIds = rows.map((row: any) => String(row.id));
    const productIds = Array.from(new Set(rows.flatMap((row: any) => (row.sale_items || []).map((item: any) => String(item.product_id)))));
    const [productsResult, returnsResult] = await Promise.all([
      productIds.length ? getSupabaseServer().from('products').select('id,name,sku').eq('tenant_id', context.tenantId).in('id', productIds) : Promise.resolve({ data: [], error: null } as any),
      saleIds.length ? getSupabaseServer().from('sale_return_items').select('sale_id,product_id,quantity').eq('tenant_id', context.tenantId).in('sale_id', saleIds) : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (productsResult.error) throw new Error(productsResult.error.message);
    if (returnsResult.error) throw new Error(returnsResult.error.message);
    const productById = new Map<string, { name?: string; sku?: string }>((productsResult.data || []).map((item: any) => [String(item.id), item] as [string, { name?: string; sku?: string }]));
    const returnedBySale = new Map<string, Record<string, number>>();
    for (const item of returnsResult.data || []) {
      const saleMap = returnedBySale.get(String(item.sale_id)) || {};
      saleMap[String(item.product_id)] = (saleMap[String(item.product_id)] || 0) + Number(item.quantity || 0);
      returnedBySale.set(String(item.sale_id), saleMap);
    }
    const sales = rows.map((row: any) => {
      const payments = row.sale_payments || [];
      const returnedQuantities = returnedBySale.get(String(row.id)) || {};
      const items = (row.sale_items || []).map((item: any) => {
        const product = productById.get(String(item.product_id));
        return { productId: item.product_id, name: product?.name || 'Producto archivado', sku: product?.sku || '', quantity: Number(item.quantity || 0), unitPrice: Number(item.unit_price || 0), total: Number(item.line_total || item.quantity * item.unit_price || 0) };
      });
      return { id: row.id, saleNumber: row.invoice_number || row.id, invoiceNumber: row.invoice_number, branchId: row.branch_id, customerId: row.customer_id, customerName: row.metadata?.customerName || '', status: row.status, subtotal: Number(row.subtotal || 0), tax: Number(row.tax || 0), discount: Number(row.discount || 0), total: Number(row.total || 0), paidAmount: payments.reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0), balanceDue: Number(row.metadata?.balanceDue || 0), soldBy: row.sold_by, paymentMethod: row.metadata?.paymentMethod || payments[0]?.payment_method, createdAt: row.created_at, updatedAt: row.updated_at, items, returnedQuantities, payments };
    });
    const last = rows[rows.length - 1];
    const nextCursor = hasMore && last ? encodeSalesCursor({ createdAt: last.created_at, id: last.id }) : null;
    return NextResponse.json({ ok: true, sales, pagination: { pageSize, hasMore, nextCursor } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'create');
    const body = await request.json();
    const splitPayments = Array.isArray(body.payments) ? body.payments.map((item: Record<string, unknown>) => ({ method: text(item.method, 20), amount: money(item.amount) })).filter((item: { method: string; amount: number }) => item.method && item.amount > 0) : [];
    const paymentMethod = splitPayments.length ? 'mixed' : (['cash', 'card', 'transfer', 'credit'].includes(body.paymentMethod) ? body.paymentMethod : '');
    const branchId = text(body.branchId, 128) || text(request.headers.get('x-branch-id'), 128) || context.branchIds[0] || '';
    let warehouseId = text(body.warehouseId, 128);
    const customerId = text(body.customerId, 128) || null;
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!branchId || !paymentMethod) return NextResponse.json({ error: 'Sucursal, método de pago y productos son obligatorios.' }, { status: 400 });
    assertBranchAccess(context, branchId);
    const supabase = getSupabaseServer();
    if (!warehouseId) {
      const warehouse = await supabase.from('warehouses').select('id').eq('tenant_id', context.tenantId).eq('branch_id', branchId).eq('active', true).order('name').limit(1).maybeSingle();
      if (warehouse.error) throw new Error(warehouse.error.message);
      warehouseId = warehouse.data?.id || '';
    }
    if (!warehouseId) throw new Error('WAREHOUSE_NOT_FOUND');
    const splitCreditAmount = splitPayments.filter((item: { method: string; amount: number }) => item.method === 'credit').reduce((sum: number, item: { method: string; amount: number }) => sum + item.amount, 0);
    const splitCashAmount = splitPayments.filter((item: { method: string; amount: number }) => item.method !== 'credit').reduce((sum: number, item: { method: string; amount: number }) => sum + item.amount, 0);
    if ((paymentMethod === 'credit' || splitCreditAmount > 0) && !customerId) return NextResponse.json({ error: 'Las ventas a crédito requieren seleccionar un cliente.' }, { status: 400 });
    const items = rawItems.map((item: Record<string, unknown>) => ({ productId: text(item.productId, 128), quantity: typeof item.quantity === 'number' && Number.isInteger(item.quantity) ? item.quantity : 0, unitPrice: money(item.unitPrice) })).filter((item: { productId: string; quantity: number }) => item.productId && item.quantity > 0);
    if (!items.length || items.length > 50) return NextResponse.json({ error: 'La venta debe contener entre 1 y 50 productos.' }, { status: 400 });
    const taxAmount = money(body.taxAmount ?? body.tax);
    const cashReceived = paymentMethod === 'cash' ? money(body.cashReceived || 0) : 0;
    const metadata = { taxAmount, documentType: text(body.documentType, 40), customerName: text(body.customerName, 160), customerRuc: text(body.customerRuc, 40), customerAddress: text(body.customerAddress, 300), currency: text(body.currency, 10) || 'NIO', paymentReference: text(body.paymentReference, 160), cashReceived };
    const needsCashSession = paymentMethod !== 'credit' && (paymentMethod !== 'mixed' || splitCashAmount > 0);
    let cashSessionId = !needsCashSession ? null : text(body.cashSessionId, 128);
    if (needsCashSession && !cashSessionId) {
      const session = await supabase.from('cash_sessions').select('id').eq('tenant_id', context.tenantId).eq('branch_id', branchId).eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle();
      if (session.error) throw new Error(session.error.message);
      cashSessionId = session.data?.id || null;
    }
    const result = splitPayments.length
      ? await supabase.rpc('create_sale_with_payments', { target_tenant_id: context.tenantId, target_branch_id: branchId, target_warehouse_id: warehouseId, target_cash_session_id: cashSessionId, target_customer_id: customerId, target_user_id: context.uid, target_discount: money(body.discount), target_idempotency_key: text(request.headers.get('idempotency-key'), 160), target_metadata: metadata, target_items: items, target_payments: splitPayments })
      : await supabase.rpc('create_sale', { target_tenant_id: context.tenantId, target_branch_id: branchId, target_warehouse_id: warehouseId, target_cash_session_id: cashSessionId, target_customer_id: customerId, target_user_id: context.uid, target_payment_method: paymentMethod, target_discount: money(body.discount), target_idempotency_key: text(request.headers.get('idempotency-key'), 160), target_metadata: metadata, target_items: items });
    if (result.error) throw new Error(result.error.message);
    const data = result.data || {};
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: data.replayed ? 'sale.replayed' : 'sale.created', entity: 'sale', entityId: data.saleId, after: data, result: 'success' });
    return NextResponse.json({ ok: true, ...data }, { status: data.replayed ? 200 : 201 });
  } catch (error: unknown) { return failure(error); }
}
