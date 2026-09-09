import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';
import { findOpenCashSession, validCashMethod } from '@/lib/cash';

export const runtime = 'nodejs';
function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function money(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(0, value) * 100) / 100 : 0; }
type ReturnLine = { productId: string; quantity: number; unitPrice: number; amount: number };

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'edit');
    const body = await request.json();
    const saleId = text(body.saleId, 120);
    const rawLines = Array.isArray(body.items) ? body.items : [];
    if (!saleId) return NextResponse.json({ error: 'La venta es obligatoria.' }, { status: 400 });
    const branchId = text(body.branchId, 120) || request.headers.get('x-branch-id')?.trim() || context.branchIds[0] || '';
    if (!branchId) return NextResponse.json({ error: 'Selecciona una sucursal para procesar la devolución.' }, { status: 400 });
    assertBranchAccess(context, branchId);
    const db = getAdminDb();
    const tenant = db.collection('tenants').doc(context.tenantId);
    const saleRef = tenant.collection('sales').doc(saleId);
    const saleSnapshot = await saleRef.get();
    if (!saleSnapshot.exists) return NextResponse.json({ error: 'La venta no existe.' }, { status: 404 });
    const salePreview = saleSnapshot.data() || {};
    if (salePreview.branchId && salePreview.branchId !== branchId) return NextResponse.json({ error: 'La venta no pertenece a la sucursal activa.' }, { status: 403 });
    const paidAmount = money(salePreview.paidAmount);
    const refundMethod = text(body.refundMethod, 30) || (salePreview.paymentMethod === 'credit' ? 'credit' : salePreview.paymentMethod);
    if (!validCashMethod(refundMethod) && refundMethod !== 'credit') return NextResponse.json({ error: 'El método de devolución no es válido.' }, { status: 400 });
    const openSession = refundMethod === 'credit' ? null : await findOpenCashSession(context.tenantId, branchId);
    if (refundMethod !== 'credit' && !openSession) return NextResponse.json({ error: 'Abre una sesión de caja para entregar el reembolso.' }, { status: 409 });
    const returnRef = tenant.collection('salesReturns').doc();
    const result = await db.runTransaction(async (transaction) => {
      const saleSnapshot = await transaction.get(saleRef);
      if (!saleSnapshot.exists) throw new Error('SALE_NOT_FOUND');
      const sale = saleSnapshot.data() || {};
      if (sale.status === 'void') throw new Error('SALE_VOID');
      const originalItems = Array.isArray(sale.items) ? sale.items as Array<Record<string, unknown>> : [];
      const alreadyReturned = (sale.returnedQuantities && typeof sale.returnedQuantities === 'object' ? sale.returnedQuantities : {}) as Record<string, unknown>;
      const requested = new Map<string, number>();
      if (rawLines.length === 0) for (const line of originalItems) { const id = text(line.productId, 120); const quantity = Number.isInteger(Number(line.quantity)) ? Number(line.quantity) : 0; if (id && quantity > 0) requested.set(id, quantity); }
      else for (const line of rawLines) { const id = text(line?.productId, 120); const quantity = Number.isInteger(line?.quantity) ? line.quantity : 0; if (id && quantity > 0) requested.set(id, (requested.get(id) || 0) + quantity); }
      if (!requested.size) throw new Error('RETURN_LINES_INVALID');
      const originalByProduct = new Map(originalItems.map((line) => [text(line.productId, 120), { quantity: Number(line.quantity) || 0, unitPrice: money(line.unitPrice) }]));
      const productRefs = Array.from(requested.keys()).map((id) => tenant.collection('products').doc(id));
      const customerRef = sale.customerId ? tenant.collection('customers').doc(text(sale.customerId, 120)) : null;
      const customerSnapshot = customerRef ? await transaction.get(customerRef) : null;
      const productSnapshots = await transaction.getAll(...productRefs);
      const lines: ReturnLine[] = []; let refundTotal = 0; const nextReturned = { ...alreadyReturned };
      productSnapshots.forEach((productSnapshot, index) => {
        const productId = productRefs[index].id; const quantity = requested.get(productId) || 0; const original = originalByProduct.get(productId); const returned = Math.max(0, Number(alreadyReturned[productId] || 0));
        if (!original || returned + quantity > original.quantity) throw new Error('RETURN_EXCEEDS_SOLD');
        const lineAmount = Math.round(original.unitPrice * quantity * 100) / 100; nextReturned[productId] = returned + quantity; refundTotal += lineAmount; lines.push({ productId, quantity, unitPrice: original.unitPrice, amount: lineAmount });
        const data = productSnapshot.data() || {};
        if (data.itemType !== 'service') { const previousStock = Math.max(0, Number(data.stock || 0)); const newStock = previousStock + quantity; transaction.update(productRefs[index], { stock: newStock, updatedAt: new Date(), updatedBy: context.uid }); transaction.set(tenant.collection('inventoryMovements').doc(), { productId, type: 'return', quantity, delta: quantity, previousStock, newStock, reason: `Devolución ${returnRef.id}`, saleId, returnId: returnRef.id, branchId, createdBy: context.uid, createdAt: new Date() }); }
      });
      const alreadyRefunded = money(sale.refundedAmount); if (alreadyRefunded + refundTotal > paidAmount && refundMethod !== 'credit') throw new Error('REFUND_EXCEEDS_PAID');
      const totalUnits = originalItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0); const returnedUnits = Object.values(nextReturned).reduce<number>((sum, value) => sum + Number(value || 0), 0); const status = returnedUnits >= totalUnits ? 'returned' : 'partially_returned'; const now = new Date();
      const nextRefunded = alreadyRefunded + refundTotal; const nextBalance = Math.max(0, money(sale.balanceDue) - (refundMethod === 'credit' ? refundTotal : 0));
      transaction.update(saleRef, { returnedQuantities: nextReturned, returnedTotal: money(sale.returnedTotal) + refundTotal, refundedAmount: nextRefunded, balanceDue: nextBalance, status, paymentStatus: nextBalance === 0 && sale.paymentMethod === 'credit' ? 'paid' : sale.paymentStatus, updatedAt: now, updatedBy: context.uid });
      transaction.create(returnRef, { saleId, branchId, cashSessionId: openSession?.id || null, items: lines, amount: refundTotal, refundMethod, reason: text(body.reason, 300) || 'Devolución', status: 'completed', createdBy: context.uid, createdAt: now });
      if (refundMethod !== 'credit' && openSession) transaction.create(tenant.collection('cashMovements').doc(), { cashSessionId: openSession.id, branchId, direction: 'out', amount: refundTotal, paymentMethod: refundMethod, description: `Reembolso de devolución ${returnRef.id}`, saleId, returnId: returnRef.id, createdBy: context.uid, createdAt: now });
      if (refundMethod === 'credit' && customerRef && customerSnapshot?.exists) { const currentBalance = money(customerSnapshot.data()?.creditBalance); transaction.update(customerRef, { creditBalance: Math.max(0, currentBalance - refundTotal), updatedAt: now, updatedBy: context.uid }); transaction.create(tenant.collection('creditMovements').doc(), { customerId: text(sale.customerId, 120), saleId, returnId: returnRef.id, type: 'return', amount: refundTotal, balanceAfter: Math.max(0, currentBalance - refundTotal), createdBy: context.uid, createdAt: now }); }
      return { returnId: returnRef.id, saleId, amount: refundTotal, refundMethod, status, items: lines, before: { status: sale.status || 'completed', returnedQuantities: alreadyReturned, returnedTotal: money(sale.returnedTotal), refundedAmount: alreadyRefunded }, after: { status, returnedQuantities: nextReturned, returnedTotal: money(sale.returnedTotal) + refundTotal, refundedAmount: nextRefunded } };
    });
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'sale.returned', entity: 'sale', entityId: saleId, before: result.before, after: result.after, metadata: { returnId: result.returnId, refundMethod: result.refundMethod, items: result.items }, request: { requestId: request.headers.get('x-correlation-id') || undefined, method: 'POST', path: '/api/sales/returns' }, result: 'success' });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'SALE_NOT_FOUND') return NextResponse.json({ error: 'La venta no existe.' }, { status: 404 });
    if (message === 'SALE_VOID') return NextResponse.json({ error: 'Una venta anulada no puede devolverse.' }, { status: 409 });
    if (message === 'RETURN_LINES_INVALID') return NextResponse.json({ error: 'La devolución debe contener productos válidos.' }, { status: 400 });
    if (message === 'RETURN_EXCEEDS_SOLD') return NextResponse.json({ error: 'La devolución supera la cantidad vendida o ya devuelta.' }, { status: 409 });
    if (message === 'REFUND_EXCEEDS_PAID') return NextResponse.json({ error: 'El reembolso supera el monto efectivamente pagado.' }, { status: 409 });
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}
