import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function quantity(value: unknown) { return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0; }

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'inventory', 'edit');
    const body = await request.json();
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items = new Map<string, number>();
    for (const item of rawItems) {
      const productId = text(item?.productId, 120);
      const requested = quantity(item?.quantity);
      if (productId && requested) items.set(productId, (items.get(productId) || 0) + requested);
    }
    if (!items.size) return NextResponse.json({ error: 'La reserva debe contener productos y cantidades válidas.' }, { status: 400 });
    const db = getAdminDb();
    const tenant = db.collection('tenants').doc(context.tenantId);
    const reservationRef = tenant.collection('stockReservations').doc();
    const productRefs = Array.from(items.keys()).map((id) => tenant.collection('products').doc(id));
    const result = await db.runTransaction(async (transaction) => {
      const snapshots = await transaction.getAll(...productRefs);
      const reservationItems: Array<{ productId: string; quantity: number }> = [];
      snapshots.forEach((snapshot, index) => {
        const productId = productRefs[index].id;
        const requested = items.get(productId) || 0;
        if (!snapshot.exists || snapshot.data()?.active === false) throw new Error('PRODUCT_NOT_FOUND');
        const data = snapshot.data() || {};
        if (data.itemType === 'service') return;
        const currentStock = Math.max(0, Number(data.stock || 0));
        if (currentStock < requested) throw new Error('INSUFFICIENT_STOCK');
        const newStock = currentStock - requested;
        transaction.update(productRefs[index], { stock: newStock, updatedAt: new Date(), updatedBy: context.uid });
        transaction.set(tenant.collection('inventoryMovements').doc(), { productId, type: 'reserve', quantity: requested, delta: -requested, previousStock: currentStock, newStock, reason: `Reserva ${reservationRef.id}`, reservationId: reservationRef.id, createdBy: context.uid, createdAt: new Date() });
        reservationItems.push({ productId, quantity: requested });
      });
      if (!reservationItems.length) throw new Error('RESERVATION_EMPTY');
      const now = new Date();
      transaction.create(reservationRef, { items: reservationItems, status: 'active', reason: text(body.reason, 300) || 'Reserva de stock', createdBy: context.uid, createdAt: now, expiresAt: new Date(now.getTime() + 30 * 60 * 1000) });
      return { reservationId: reservationRef.id, items: reservationItems, status: 'active' };
    });
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'inventory.stock_reserved', entity: 'stockReservation', entityId: result.reservationId, after: result, request: { requestId: request.headers.get('x-correlation-id') || undefined, method: 'POST', path: '/api/inventory/reservations' }, result: 'success' });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'PRODUCT_NOT_FOUND') return NextResponse.json({ error: 'Uno de los productos no existe o está archivado.' }, { status: 404 });
    if (message === 'INSUFFICIENT_STOCK') return NextResponse.json({ error: 'No hay stock suficiente para completar la reserva.' }, { status: 409 });
    if (message === 'RESERVATION_EMPTY') return NextResponse.json({ error: 'No se puede reservar únicamente servicios.' }, { status: 400 });
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'inventory', 'edit');
    const reservationId = text(new URL(request.url).searchParams.get('id'), 120);
    if (!reservationId) return NextResponse.json({ error: 'La reserva es obligatoria.' }, { status: 400 });
    const db = getAdminDb();
    const tenant = db.collection('tenants').doc(context.tenantId);
    const reservationRef = tenant.collection('stockReservations').doc(reservationId);
    const result = await db.runTransaction(async (transaction) => {
      const reservationSnapshot = await transaction.get(reservationRef);
      if (!reservationSnapshot.exists) throw new Error('RESERVATION_NOT_FOUND');
      const reservation = reservationSnapshot.data() || {};
      if (reservation.status !== 'active') throw new Error('RESERVATION_CLOSED');
      const items = Array.isArray(reservation.items) ? reservation.items as Array<Record<string, unknown>> : [];
      const productRefs = items.map((item) => tenant.collection('products').doc(text(item.productId, 120)));
      const snapshots = await transaction.getAll(...productRefs);
      snapshots.forEach((snapshot, index) => {
        const requested = quantity(items[index]?.quantity);
        if (!snapshot.exists || requested <= 0) return;
        const previousStock = Math.max(0, Number(snapshot.data()?.stock || 0));
        const newStock = previousStock + requested;
        transaction.update(productRefs[index], { stock: newStock, updatedAt: new Date(), updatedBy: context.uid });
        transaction.set(tenant.collection('inventoryMovements').doc(), { productId: productRefs[index].id, type: 'release', quantity: requested, delta: requested, previousStock, newStock, reason: `Liberación ${reservationId}`, reservationId, createdBy: context.uid, createdAt: new Date() });
      });
      const now = new Date();
      transaction.update(reservationRef, { status: 'released', releasedBy: context.uid, releasedAt: now, updatedAt: now });
      return { reservationId, status: 'released' };
    });
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'inventory.stock_reservation_released', entity: 'stockReservation', entityId: reservationId, after: result, request: { requestId: request.headers.get('x-correlation-id') || undefined, method: 'DELETE', path: '/api/inventory/reservations' }, result: 'success' });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'RESERVATION_NOT_FOUND') return NextResponse.json({ error: 'La reserva no existe.' }, { status: 404 });
    if (message === 'RESERVATION_CLOSED') return NextResponse.json({ error: 'La reserva ya fue cerrada.' }, { status: 409 });
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}
