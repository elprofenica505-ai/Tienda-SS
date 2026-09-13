import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
const MANAGER_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);
function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function money(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value * 100) / 100) : 0; }
function failure(error: unknown) { const message = error instanceof Error ? error.message : ''; const known: Record<string, [string, number]> = { PRODUCT_NOT_FOUND: ['Uno de los productos ya no está disponible.', 404], CUSTOMER_NOT_FOUND: ['El cliente seleccionado no existe o está archivado.', 404], BRANCH_NOT_FOUND: ['La sucursal no existe o no está activa.', 404], WAREHOUSE_NOT_FOUND: ['El almacén no existe o no está activo.', 404], CASH_SESSION_REQUIRED: ['Abre una sesión de caja antes de registrar cobros.', 409], CASH_SESSION_NOT_OPEN: ['La sesión de caja no está abierta.', 409], INSUFFICIENT_STOCK: ['No hay existencias suficientes para completar la venta.', 409], CREDIT_LIMIT_EXCEEDED: ['La venta supera el límite de crédito del cliente.', 409], INVALID_PAYMENT_METHOD: ['El método de pago no es válido.', 400], INVALID_SALE_ITEMS: ['La venta debe contener entre 1 y 50 productos.', 400], INVALID_SALE_QUANTITY: ['Las cantidades de la venta no son válidas.', 400] }; for (const [key, value] of Object.entries(known)) if (message.includes(key)) return NextResponse.json({ error: value[0] }, { status: value[1] }); const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'view');
    const branchId = text(request.headers.get('x-branch-id'), 128);
    if (branchId) assertBranchAccess(context, branchId);
    let query = getSupabaseServer().from('sales').select('*, sale_items(*), sale_payments(*)').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(50);
    if (branchId) query = query.eq('branch_id', branchId);
    else if (!MANAGER_ROLES.has(context.role)) query = query.in('branch_id', context.branchIds.slice(0, 100));
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    const sales = (result.data || []).map((row: any) => ({ id: row.id, invoiceNumber: row.invoice_number, branchId: row.branch_id, customerId: row.customer_id, status: row.status, subtotal: Number(row.subtotal || 0), tax: Number(row.tax || 0), discount: Number(row.discount || 0), total: Number(row.total || 0), soldBy: row.sold_by, paymentMethod: row.metadata?.paymentMethod || row.sale_payments?.[0]?.payment_method, createdAt: row.created_at, updatedAt: row.updated_at, items: row.sale_items || [], payments: row.sale_payments || [] }));
    return NextResponse.json({ ok: true, sales }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'create');
    const body = await request.json();
    const paymentMethod = ['cash', 'card', 'transfer', 'credit'].includes(body.paymentMethod) ? body.paymentMethod : '';
    const branchId = text(body.branchId, 128) || text(request.headers.get('x-branch-id'), 128) || context.branchIds[0] || '';
    const warehouseId = text(body.warehouseId, 128);
    const customerId = text(body.customerId, 128) || null;
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!branchId || !warehouseId || !paymentMethod) return NextResponse.json({ error: 'Sucursal, almacén, método de pago y productos son obligatorios.' }, { status: 400 });
    assertBranchAccess(context, branchId);
    if (paymentMethod === 'credit' && !customerId) return NextResponse.json({ error: 'Las ventas a crédito requieren seleccionar un cliente.' }, { status: 400 });
    const items = rawItems.map((item: Record<string, unknown>) => ({ productId: text(item.productId, 128), quantity: typeof item.quantity === 'number' && Number.isInteger(item.quantity) ? item.quantity : 0, unitPrice: money(item.unitPrice) })).filter((item: { productId: string; quantity: number }) => item.productId && item.quantity > 0);
    if (!items.length || items.length > 50) return NextResponse.json({ error: 'La venta debe contener entre 1 y 50 productos.' }, { status: 400 });
    const taxAmount = money(body.taxAmount ?? body.tax);
    const metadata = { taxAmount, documentType: text(body.documentType, 40), customerName: text(body.customerName, 160), customerRuc: text(body.customerRuc, 40), customerAddress: text(body.customerAddress, 300), currency: text(body.currency, 10) || 'NIO', paymentReference: text(body.paymentReference, 160) };
    const result = await getSupabaseServer().rpc('create_sale', { target_tenant_id: context.tenantId, target_branch_id: branchId, target_warehouse_id: warehouseId, target_cash_session_id: paymentMethod === 'credit' ? null : (text(body.cashSessionId, 128) || null), target_customer_id: customerId, target_user_id: context.uid, target_payment_method: paymentMethod, target_discount: money(body.discount), target_idempotency_key: text(request.headers.get('idempotency-key'), 160), target_metadata: metadata, target_items: items });
    if (result.error) throw new Error(result.error.message);
    const data = result.data || {};
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: data.replayed ? 'sale.replayed' : 'sale.created', entity: 'sale', entityId: data.saleId, after: data, result: 'success' });
    return NextResponse.json({ ok: true, ...data }, { status: data.replayed ? 200 : 201 });
  } catch (error: unknown) { return failure(error); }
}
