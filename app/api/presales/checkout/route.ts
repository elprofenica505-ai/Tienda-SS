import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';
import { createFiscalSaleFields, fiscalMoney, formatFiscalNumber, validateFiscalFields } from '@/lib/fiscal-ni';
import { assertPlanCapacity } from '@/lib/entitlement-guard';
import { getEntitlementLimit } from '@/lib/entitlements';

export const runtime = 'nodejs';
function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function money(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0; }

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'create');
    const body = await request.json(); const presaleId = text(body.presaleId, 120); const paymentMethod = ['cash', 'card', 'transfer', 'credit'].includes(body.paymentMethod) ? body.paymentMethod : ''; const customerId = text(body.customerId, 120); const branchId = text(body.branchId, 120) || request.headers.get('x-branch-id')?.trim() || '';
    if (!presaleId || !paymentMethod) return NextResponse.json({ error: 'Preventa y método de pago son obligatorios.' }, { status: 400 });
    if (paymentMethod === 'credit' && !customerId) return NextResponse.json({ error: 'Las ventas a crédito requieren seleccionar un cliente guardado.' }, { status: 400 });
    if (branchId) assertBranchAccess(context, branchId);
    const db = getAdminDb(); const tenant = db.collection('tenants').doc(context.tenantId); const presaleRef = tenant.collection('presales').doc(presaleId); const saleRef = tenant.collection('sales').doc(); const statsRef = tenant.collection('stats').doc('daily').collection('days').doc(new Date().toISOString().slice(0, 10)); const fiscalRef = tenant.collection('settings').doc('fiscal');
    const result = await db.runTransaction(async (transaction) => {
      const presaleSnapshot = await transaction.get(presaleRef);
      if (!presaleSnapshot.exists) throw new Error('PRESALE_NOT_FOUND');
      const presale = presaleSnapshot.data() || {};
      if (presale.status === 'paid') return { saleId: presale.saleId, total: Number(presale.total || 0), alreadyPaid: true };
      if (presale.status !== 'sent_to_cashier') throw new Error('PRESALE_NOT_READY');
      const rawItems = Array.isArray(presale.items) ? presale.items : [];
      const itemMap = new Map<string, number>(); rawItems.forEach((item) => { const id = text(item?.productId, 120); const quantity = Number.isInteger(item?.quantity) ? item.quantity : 0; if (id && quantity > 0) itemMap.set(id, (itemMap.get(id) || 0) + quantity); });
      if (!itemMap.size) throw new Error('PRESALE_EMPTY');
      const productRefs = Array.from(itemMap.keys()).map((id) => tenant.collection('products').doc(id)); const movementRefs = productRefs.map(() => tenant.collection('inventoryMovements').doc()); const customerRef = customerId ? tenant.collection('customers').doc(customerId) : null;
      const tenantSnapshot = await transaction.get(tenant); const fiscalSnapshot = await transaction.get(fiscalRef); const productSnapshots = await transaction.getAll(...productRefs); const customerSnapshot = customerRef ? await transaction.get(customerRef) : null;
      if (customerRef && (!customerSnapshot || !customerSnapshot.exists || customerSnapshot.data()?.active === false)) throw new Error('CUSTOMER_NOT_FOUND');
      const plan = tenantSnapshot.data()?.plan; const monthlyLimit = getEntitlementLimit(plan, 'monthlySales'); const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0); if (Number.isFinite(monthlyLimit)) { const monthlySales = await transaction.get(tenant.collection('sales').where('createdAt', '>=', monthStart).limit(monthlyLimit + 1)); assertPlanCapacity(plan, 'monthlySales', monthlySales.size, 1); }
      const customerName = customerSnapshot ? text(customerSnapshot.data()?.name, 120) : ''; const lines = rawItems.map((item) => ({ productId: text(item.productId, 120), name: text(item.name) || 'Producto', sku: text(item.sku, 50), quantity: Number(item.quantity), unitPrice: money(item.unitPrice), total: money(item.total) }));
      productSnapshots.forEach((snapshot, index) => { if (!snapshot.exists || snapshot.data()?.active === false) throw new Error('PRODUCT_NOT_FOUND'); const stock = Number(snapshot.data()?.stock || 0); const quantity = itemMap.get(productRefs[index].id) || 0; if (snapshot.data()?.itemType !== 'service' && stock < quantity) throw new Error(`INSUFFICIENT_STOCK:${snapshot.data()?.name || productRefs[index].id}`); });
      const subtotal = lines.reduce((sum, line) => sum + line.total, 0); const fiscal = createFiscalSaleFields({ ...body, customerName }, subtotal, 0); const fiscalError = validateFiscalFields(fiscal); if (fiscalError) throw new Error(`FISCAL_INVALID:${fiscalError}`); const fiscalConfig = fiscalSnapshot.exists ? fiscalSnapshot.data() || {} : {}; const sequence = Number(fiscalConfig.nextInvoiceSequence || 1); const invoiceNumber = formatFiscalNumber(typeof fiscalConfig.invoicePrefix === 'string' ? fiscalConfig.invoicePrefix : 'FAC', sequence); const total = fiscalMoney(fiscal.total); const customerCreditBalance = customerSnapshot ? money(customerSnapshot.data()?.creditBalance) : 0; const customerCreditLimit = customerSnapshot ? money(customerSnapshot.data()?.creditLimit) : 0; const creditOverride = body.creditOverride === true && ['owner', 'admin'].includes(context.role); if (paymentMethod === 'credit' && customerCreditBalance + total > customerCreditLimit && !creditOverride) throw new Error(`CREDIT_LIMIT_EXCEEDED:${customerCreditLimit}:${customerCreditBalance}`); const now = new Date();
      productSnapshots.forEach((snapshot, index) => { const data = snapshot.data() || {}; if (data.itemType === 'service') return; const quantity = itemMap.get(productRefs[index].id) || 0; const previousStock = Number(data.stock || 0); transaction.update(productRefs[index], { stock: previousStock - quantity, updatedAt: now, updatedBy: context.uid }); transaction.set(movementRefs[index], { productId: productRefs[index].id, type: 'sale', quantity, delta: -quantity, previousStock, newStock: previousStock - quantity, reason: `Preventa ${presale.ticketCode || presaleId}`, saleId: saleRef.id, presaleId, createdBy: context.uid, createdAt: now }); });
      const paidAmount = paymentMethod === 'credit' ? 0 : total;
      transaction.set(saleRef, { saleNumber: `V-${Date.now().toString(36).toUpperCase()}`, invoiceNumber, presaleId, ticketCode: presale.ticketCode, items: lines, subtotal, discount: 0, taxableBase: fiscal.taxableBase, exemptAmount: fiscal.exemptAmount, taxRate: fiscal.taxRate, taxAmount: fiscal.taxAmount, total, paidAmount, balanceDue: paymentMethod === 'credit' ? total : 0, paymentStatus: paymentMethod === 'credit' ? 'pending' : 'paid', dueAt: paymentMethod === 'credit' ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) : null, currency: fiscal.currency, customerId: customerId || null, customerName: customerName || fiscal.customerName || null, customerRuc: fiscal.customerRuc || null, customerAddress: fiscal.customerAddress || null, paymentMethod, branchId: branchId || null, fiscal: { provider: 'manual', status: 'pending_adapter', adapterVersion: 'preview-2026-01' }, status: 'completed', createdBy: context.uid, vendedorUid: presale.vendedorUid, createdAt: now, updatedAt: now });
      if (paymentMethod === 'credit' && customerRef) { transaction.update(customerRef, { creditBalance: customerCreditBalance + total, updatedAt: now, updatedBy: context.uid }); transaction.create(tenant.collection('creditMovements').doc(), { customerId, saleId: saleRef.id, presaleId, type: 'charge', amount: total, balanceAfter: customerCreditBalance + total, createdBy: context.uid, createdAt: now }); }
      transaction.update(presaleRef, { status: 'paid', saleId: saleRef.id, paidBy: context.uid, paidAt: now, updatedAt: now }); transaction.set(fiscalRef, { nextInvoiceSequence: sequence + 1, invoicePrefix: typeof fiscalConfig.invoicePrefix === 'string' ? fiscalConfig.invoicePrefix : 'FAC', currency: 'NIO', updatedAt: now }, { merge: true }); transaction.set(statsRef, { salesCount: FieldValue.increment(1), salesTotal: FieldValue.increment(total), updatedAt: now }, { merge: true }); return { saleId: saleRef.id, total, ticketCode: presale.ticketCode, saleNumber: `V-${Date.now().toString(36).toUpperCase()}`, invoiceNumber, items: lines, paymentMethod, customerName, alreadyPaid: false };
    });
    if (!result.alreadyPaid) await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'sale.created_from_presale', entity: 'sale', entityId: result.saleId, after: result, metadata: { presaleId }, result: 'success' });
    return NextResponse.json({ ok: true, ...result }, { status: result.alreadyPaid ? 200 : 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'PRESALE_NOT_FOUND') return NextResponse.json({ error: 'La preventa no existe en esta empresa.' }, { status: 404 });
    if (message === 'PRESALE_NOT_READY') return NextResponse.json({ error: 'La preventa todavía no está lista para caja.' }, { status: 409 });
    if (message === 'PRESALE_EMPTY') return NextResponse.json({ error: 'La preventa no contiene productos.' }, { status: 409 });
    if (message === 'PRODUCT_NOT_FOUND') return NextResponse.json({ error: 'Uno de los productos ya no está disponible.' }, { status: 404 });
    if (message === 'CUSTOMER_NOT_FOUND') return NextResponse.json({ error: 'El cliente seleccionado no existe o está archivado.' }, { status: 404 });
    if (message.startsWith('INSUFFICIENT_STOCK:')) return NextResponse.json({ error: `Stock insuficiente para ${message.split(':').slice(1).join(':')}.` }, { status: 409 });
    if (message.startsWith('FISCAL_INVALID:')) return NextResponse.json({ error: message.slice('FISCAL_INVALID:'.length) }, { status: 400 });
    if (message.startsWith('CREDIT_LIMIT_EXCEEDED:')) return NextResponse.json({ error: `El crédito disponible es insuficiente. Límite: $${message.split(':')[1]}, saldo actual: $${message.split(':')[2]}.` }, { status: 409 });
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}
