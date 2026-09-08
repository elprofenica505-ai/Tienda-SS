import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';

function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function money(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0; }

type ReturnLine = { productId: string; quantity: number };

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'edit');
    const body = await request.json();
    const saleId = text(body.saleId, 120);
    const rawLines = Array.isArray(body.items) ? body.items : [];
    if (!saleId) return NextResponse.json({ error: 'La venta es obligatoria.' }, { status: 400 });

    const db = getAdminDb();
    const tenant = db.collection('tenants').doc(context.tenantId);
    const saleRef = tenant.collection('sales').doc(saleId);
    const returnRef = tenant.collection('salesReturns').doc();
    const result = await db.runTransaction(async (transaction) => {
      const saleSnapshot = await transaction.get(saleRef);
      if (!saleSnapshot.exists) throw new Error('SALE_NOT_FOUND');
      const sale = saleSnapshot.data() || {};
      if (sale.status === 'void') throw new Error('SALE_VOID');
      const originalItems = Array.isArray(sale.items) ? sale.items as Array<Record<string, unknown>> : [];
      const alreadyReturned = (sale.returnedQuantities && typeof sale.returnedQuantities === 'object' ? sale.returnedQuantities : {}) as Record<string, unknown>;
      const requested = new Map<string, number>();
      if (rawLines.length === 0) {
        for (const line of originalItems) {
          const id = text(line.productId, 120);
          const quantity = typeof line.quantity === 'number' ? Math.floor(line.quantity) : 0;
          if (id && quantity > 0) requested.set(id, quantity);
        }
      } else {
        for (const line of rawLines) {
          const id = text(line?.productId, 120);
          const quantity = typeof line?.quantity === 'number' ? Math.floor(line.quantity) : 0;
          if (id && quantity > 0) requested.set(id, (requested.get(id) || 0) + quantity);
        }
      }
      if (!requested.size) throw new Error('RETURN_LINES_INVALID');
      const originalByProduct = new Map(originalItems.map((line) => [text(line.productId, 120), typeof line.quantity === 'number' ? Math.floor(line.quantity) : 0]));
      const productRefs = Array.from(requested.keys()).map((id) => tenant.collection('products').doc(id));
      const productSnapshots = await transaction.getAll(...productRefs);
      const lines: ReturnLine[] = [];
      let refundTotal = 0;
      const nextReturned = { ...alreadyReturned };
      productSnapshots.forEach((productSnapshot, index) => {
        const productId = productRefs[index].id;
        const quantity = requested.get(productId) || 0;
        const sold = originalByProduct.get(productId) || 0;
        const returned = Math.max(0, Number(alreadyReturned[productId] || 0));
        if (!sold || returned + quantity > sold) throw new Error('RETURN_EXCEEDS_SOLD');
        const data = productSnapshot.data() || {};
        const unitPrice = money(originalItems.find((item) => text(item.productId, 120) === productId)?.unitPrice);
        nextReturned[productId] = returned + quantity;
        refundTotal += unitPrice * quantity;
        lines.push({ productId, quantity });
        if (data.itemType !== 'service') {
          const previousStock = Math.max(0, Number(data.stock || 0));
          const newStock = previousStock + quantity;
          transaction.update(productRefs[index], { stock: newStock, updatedAt: new Date(), updatedBy: context.uid });
          transaction.set(tenant.collection('inventoryMovements').doc(), { productId, type: 'return', quantity, delta: quantity, previousStock, newStock, reason: `Devolución ${returnRef.id}`, saleId, returnId: returnRef.id, createdBy: context.uid, createdAt: new Date() });
        }
      });
      const totalUnits = originalItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      const returnedUnits = Object.values(nextReturned).reduce<number>((sum, value) => sum + Number(value || 0), 0);
      const status = returnedUnits >= totalUnits ? 'returned' : 'partially_returned';
      const now = new Date();
      transaction.update(saleRef, { returnedQuantities: nextReturned, returnedTotal: money(sale.returnedTotal) + refundTotal, status, updatedAt: now, updatedBy: context.uid });
      transaction.create(returnRef, { saleId, items: lines, amount: refundTotal, reason: text(body.reason, 300) || 'Devolución', createdBy: context.uid, createdAt: now });
      return { returnId: returnRef.id, saleId, amount: refundTotal, status, items: lines, before: { status: sale.status || 'completed', returnedQuantities: alreadyReturned, returnedTotal: money(sale.returnedTotal) }, after: { status, returnedQuantities: nextReturned, returnedTotal: money(sale.returnedTotal) + refundTotal } };
    });
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'sale.returned', entity: 'sale', entityId: saleId, before: result.before, after: result.after, metadata: { returnId: result.returnId, items: result.items }, request: { requestId: request.headers.get('x-correlation-id') || undefined, method: 'POST', path: '/api/sales/returns' }, result: 'success' });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'SALE_NOT_FOUND') return NextResponse.json({ error: 'La venta no existe.' }, { status: 404 });
    if (message === 'SALE_VOID') return NextResponse.json({ error: 'Una venta anulada no puede devolverse.' }, { status: 409 });
    if (message === 'RETURN_LINES_INVALID') return NextResponse.json({ error: 'La devolución debe contener productos válidos.' }, { status: 400 });
    if (message === 'RETURN_EXCEEDS_SOLD') return NextResponse.json({ error: 'La devolución supera la cantidad vendida o ya devuelta.' }, { status: 409 });
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}
