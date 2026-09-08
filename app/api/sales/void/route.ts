import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
function text(value: unknown, max = 300) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'edit');
    const body = await request.json();
    const saleId = text(body.saleId, 120);
    const reason = text(body.reason);
    if (!saleId || reason.length < 3) return NextResponse.json({ error: 'Venta y motivo de anulación son obligatorios.' }, { status: 400 });
    const db = getAdminDb();
    const tenant = db.collection('tenants').doc(context.tenantId);
    const saleRef = tenant.collection('sales').doc(saleId);
    const result = await db.runTransaction(async (transaction) => {
      const saleSnapshot = await transaction.get(saleRef);
      if (!saleSnapshot.exists) throw new Error('SALE_NOT_FOUND');
      const sale = saleSnapshot.data() || {};
      if (sale.status === 'void') throw new Error('SALE_ALREADY_VOID');
      if (Number(sale.paidAmount || 0) > 0) throw new Error('SALE_HAS_PAYMENTS');
      const items = Array.isArray(sale.items) ? sale.items as Array<Record<string, unknown>> : [];
      const productIds = Array.from(new Set(items.map((item) => text(item.productId, 120)).filter(Boolean)));
      const productRefs = productIds.map((id) => tenant.collection('products').doc(id));
      const snapshots = await transaction.getAll(...productRefs);
      const movements: Array<{ productId: string; quantity: number; previousStock: number; newStock: number }> = [];
      snapshots.forEach((snapshot, index) => {
        const item = items.find((candidate) => text(candidate.productId, 120) === productRefs[index].id);
        const quantity = Number(item?.quantity || 0);
        if (!snapshot.exists || snapshot.data()?.itemType === 'service' || quantity <= 0) return;
        const previousStock = Math.max(0, Number(snapshot.data()?.stock || 0));
        const newStock = previousStock + quantity;
        transaction.update(productRefs[index], { stock: newStock, updatedAt: new Date(), updatedBy: context.uid });
        transaction.set(tenant.collection('inventoryMovements').doc(), { productId: productRefs[index].id, type: 'void', quantity, delta: quantity, previousStock, newStock, reason, saleId, createdBy: context.uid, createdAt: new Date() });
        movements.push({ productId: productRefs[index].id, quantity, previousStock, newStock });
      });
      const now = new Date();
      transaction.update(saleRef, { status: 'void', voidReason: reason, voidedBy: context.uid, voidedAt: now, updatedAt: now, updatedBy: context.uid });
      return { saleId, status: 'void', movements, before: { status: sale.status || 'completed', paidAmount: Number(sale.paidAmount || 0) }, after: { status: 'void', voidReason: reason } };
    });
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'sale.voided', entity: 'sale', entityId: saleId, before: result.before, after: result.after, metadata: { movements: result.movements }, request: { requestId: request.headers.get('x-correlation-id') || undefined, method: 'POST', path: '/api/sales/void' }, result: 'success' });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'SALE_NOT_FOUND') return NextResponse.json({ error: 'La venta no existe.' }, { status: 404 });
    if (message === 'SALE_ALREADY_VOID') return NextResponse.json({ error: 'La venta ya está anulada.' }, { status: 409 });
    if (message === 'SALE_HAS_PAYMENTS') return NextResponse.json({ error: 'Una venta con pagos registrados requiere una nota de crédito.' }, { status: 409 });
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}
