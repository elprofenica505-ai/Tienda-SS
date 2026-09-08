import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse, TenantRole } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';
import { FieldValue } from 'firebase-admin/firestore';
import { assertPlanCapacity } from '@/lib/entitlement-guard';
import { getEntitlementLimit } from '@/lib/entitlements';
import { createFiscalSaleFields, fiscalMoney, formatFiscalNumber, validateFiscalFields } from '@/lib/fiscal-ni';

export const runtime = 'nodejs';
const salesRoles: TenantRole[] = ['owner', 'admin', 'jefe', 'vendedor', 'cajero'];

function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function money(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0; }
function getMonthlyLimit(plan: unknown) { return getEntitlementLimit(plan, 'monthlySales'); }

type SaleLineInput = { productId?: unknown; quantity?: unknown };

type SaleLine = { productId: string; name: string; sku: string; quantity: number; unitPrice: number; total: number };

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'view');
    const snapshot = await getAdminDb().collection('tenants').doc(context.tenantId).collection('sales').orderBy('createdAt', 'desc').limit(50).get();
    return NextResponse.json({ ok: true, sales: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'create');
    const body = await request.json();
    const rawLines = Array.isArray(body.items) ? body.items as SaleLineInput[] : [];
    const paymentMethod = ['cash', 'card', 'transfer', 'credit'].includes(body.paymentMethod) ? body.paymentMethod : '';
    const customerId = text(body.customerId, 120);
    const branchId = text(body.branchId, 120) || request.headers.get('x-branch-id')?.trim() || '';
    if (branchId) assertBranchAccess(context, branchId);
    const idempotencyKey = request.headers.get('idempotency-key')?.trim().slice(0, 160) || '';
    const discount = money(body.discount);
    if (!rawLines.length || rawLines.length > 50 || !paymentMethod) return NextResponse.json({ error: 'La venta debe contener entre 1 y 50 líneas de productos.' }, { status: 400 });
    if (paymentMethod === 'credit' && !customerId) return NextResponse.json({ error: 'Las ventas a crédito requieren seleccionar un cliente guardado.' }, { status: 400 });

    const unique = new Map<string, number>();
    for (const line of rawLines) {
      const productId = text(line.productId, 120);
      const quantity = typeof line.quantity === 'number' && Number.isInteger(line.quantity) ? line.quantity : 0;
      if (productId && quantity > 0) unique.set(productId, (unique.get(productId) || 0) + quantity);
    }
    if (!unique.size) return NextResponse.json({ error: 'Las cantidades de la venta no son válidas.' }, { status: 400 });
    if (unique.size > 50) return NextResponse.json({ error: 'Una venta no puede contener más de 50 productos distintos.' }, { status: 400 });

    const db = getAdminDb();
    const tenant = db.collection('tenants').doc(context.tenantId);
    const saleRef = tenant.collection('sales').doc();
      const statsRef = tenant.collection('stats').doc('daily').collection('days').doc(new Date().toISOString().slice(0, 10));
    const productIds = Array.from(unique.keys());
    const movementRefs = productIds.map(() => tenant.collection('inventoryMovements').doc());
    const productRefs = productIds.map((id) => tenant.collection('products').doc(id));
    const customerRef = customerId ? tenant.collection('customers').doc(customerId) : null;
    const idempotencyRef = idempotencyKey ? tenant.collection('idempotencyKeys').doc(`sale-${idempotencyKey}`) : null;

    const fiscalRef = tenant.collection('settings').doc('fiscal');
    const result = await db.runTransaction(async (transaction) => {
      const tenantSnapshot = await transaction.get(tenant);
      const fiscalSnapshot = await transaction.get(fiscalRef);
      const plan = tenantSnapshot.data()?.plan;
      const monthlyLimit = Number.isFinite(getMonthlyLimit(plan)) ? getMonthlyLimit(plan) : null;
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const monthlySales = monthlyLimit === null ? null : await transaction.get(tenant.collection('sales').where('createdAt', '>=', monthStart).limit(monthlyLimit + 1));
      if (monthlySales && monthlyLimit !== null) assertPlanCapacity(plan, 'monthlySales', monthlySales.size, 1);
      const readRefs = customerRef ? [...productRefs, customerRef] : productRefs;
      if (idempotencyRef) readRefs.push(idempotencyRef);
      const snapshots = await transaction.getAll(...readRefs);
      const productSnapshots = snapshots.slice(0, productRefs.length);
      const customerSnapshot = customerRef ? snapshots[productRefs.length] : null;
      const idempotencySnapshot = idempotencyRef ? snapshots[snapshots.length - 1] : null;
      if (idempotencySnapshot?.exists) return idempotencySnapshot.data()?.response as { saleId: string; total: number; lines: SaleLine[] };
      if (customerRef && (!customerSnapshot || !customerSnapshot.exists || customerSnapshot.data()?.active === false)) throw new Error('CUSTOMER_NOT_FOUND');
      const customerName = customerSnapshot ? text(customerSnapshot.data()?.name, 120) : '';
      const lines: SaleLine[] = [];
      let subtotal = 0;
      productSnapshots.forEach((snapshot, index) => {
        if (!snapshot.exists || snapshot.data()?.active === false) throw new Error('PRODUCT_NOT_FOUND');
        const data = snapshot.data() || {};
        const quantity = unique.get(productRefs[index].id) || 0;
        if (data.itemType !== 'service' && Number(data.stock || 0) < quantity) throw new Error(`INSUFFICIENT_STOCK:${data.name || productRefs[index].id}`);
        const unitPrice = money(data.price);
        const total = unitPrice * quantity;
        subtotal += total;
        lines.push({ productId: productRefs[index].id, name: text(data.name) || 'Producto', sku: text(data.sku, 50), quantity, unitPrice, total });
      });
      const fiscal = createFiscalSaleFields({ ...body, customerName: body.customerName || customerName }, subtotal, discount);
      const fiscalError = validateFiscalFields(fiscal);
      if (fiscalError) throw new Error(`FISCAL_INVALID:${fiscalError}`);
      const fiscalConfig = fiscalSnapshot.exists ? fiscalSnapshot.data() || {} : {};
      const sequence = Number(fiscalConfig.nextInvoiceSequence || 1);
      const invoiceNumber = formatFiscalNumber(typeof fiscalConfig.invoicePrefix === 'string' ? fiscalConfig.invoicePrefix : 'FAC', sequence);
      const total = fiscalMoney(fiscal.total);
      const customerCreditBalance = customerSnapshot ? money(customerSnapshot.data()?.creditBalance) : 0;
      const customerCreditLimit = customerSnapshot ? money(customerSnapshot.data()?.creditLimit) : 0;
      const creditOverride = body.creditOverride === true && ['owner', 'admin'].includes(context.role);
      if (paymentMethod === 'credit' && customerCreditBalance + total > customerCreditLimit && !creditOverride) throw new Error(`CREDIT_LIMIT_EXCEEDED:${customerCreditLimit}:${customerCreditBalance}`);
      const now = new Date();
      productSnapshots.forEach((snapshot, index) => {
        const data = snapshot.data() || {};
        if (data.itemType === 'service') return;
        const quantity = unique.get(productRefs[index].id) || 0;
        const previousStock = Number(data.stock || 0);
        const newStock = previousStock - quantity;
        transaction.update(productRefs[index], { stock: newStock, updatedAt: now, updatedBy: context.uid });
        transaction.set(movementRefs[index], { productId: productRefs[index].id, type: 'sale', quantity, delta: -quantity, previousStock, newStock, reason: `Venta ${saleRef.id}`, saleId: saleRef.id, createdBy: context.uid, createdAt: now });
      });
      const response = { saleId: saleRef.id, total, lines, invoiceNumber };
      const paidAmount = paymentMethod === 'credit' ? 0 : total;
      transaction.set(saleRef, { saleNumber: `V-${Date.now().toString(36).toUpperCase()}`, invoiceNumber, documentType: fiscal.documentType, items: lines, subtotal, discount, taxableBase: fiscal.taxableBase, exemptAmount: fiscal.exemptAmount, taxRate: fiscal.taxRate, taxAmount: fiscal.taxAmount, total, paidAmount, balanceDue: paymentMethod === 'credit' ? total : 0, paymentStatus: paymentMethod === 'credit' ? 'pending' : 'paid', dueAt: paymentMethod === 'credit' ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) : null, currency: fiscal.currency, customerId: customerId || null, customerName: customerName || fiscal.customerName || null, customerRuc: fiscal.customerRuc || null, customerAddress: fiscal.customerAddress || null, paymentMethod, branchId: branchId || null, fiscal: { provider: 'manual', status: 'pending_adapter', adapterVersion: 'preview-2026-01' }, status: 'completed', createdBy: context.uid, createdAt: now, updatedAt: now });
      if (paymentMethod === 'credit' && customerRef) {
        transaction.update(customerRef, { creditBalance: customerCreditBalance + total, updatedAt: now, updatedBy: context.uid });
        transaction.create(tenant.collection('creditMovements').doc(), { customerId, saleId: saleRef.id, type: 'charge', amount: total, balanceAfter: customerCreditBalance + total, createdBy: context.uid, createdAt: now });
      }
      transaction.set(fiscalRef, { nextInvoiceSequence: sequence + 1, invoicePrefix: typeof fiscalConfig.invoicePrefix === 'string' ? fiscalConfig.invoicePrefix : 'FAC', currency: 'NIO', updatedAt: now }, { merge: true });
      transaction.set(statsRef, { salesCount: FieldValue.increment(1), salesTotal: FieldValue.increment(total), updatedAt: now }, { merge: true });
      if (idempotencyRef) transaction.create(idempotencyRef, { response, createdBy: context.uid, createdAt: now, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) });
      return response;
    });
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'sale.created', entity: 'sale', entityId: result.saleId, after: result, request: { method: 'POST', path: '/api/sales', requestId: request.headers.get('x-correlation-id') || undefined }, result: 'success' });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'PRODUCT_NOT_FOUND') return NextResponse.json({ error: 'Uno de los productos ya no está disponible.' }, { status: 404 });
    if (message === 'CUSTOMER_NOT_FOUND') return NextResponse.json({ error: 'El cliente seleccionado no existe o está archivado.' }, { status: 404 });
    if (message.startsWith('INSUFFICIENT_STOCK:')) return NextResponse.json({ error: `Stock insuficiente para ${message.split(':').slice(1).join(':')}.` }, { status: 409 });
    if (message.startsWith('FISCAL_INVALID:')) return NextResponse.json({ error: message.slice('FISCAL_INVALID:'.length) }, { status: 400 });
    if (message.startsWith('CREDIT_LIMIT_EXCEEDED:')) return NextResponse.json({ error: `El crédito disponible es insuficiente. Límite: $${message.split(':')[1]}, saldo actual: $${message.split(':')[2]}.` }, { status: 409 });
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
