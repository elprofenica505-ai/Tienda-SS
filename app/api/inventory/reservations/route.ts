import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';
import { inventoryNumber, stockAfterDelta, stockKey } from '@/lib/inventory-cost';

export const runtime = 'nodejs';
function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function quantity(value: unknown) { return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0; }

async function warehouseFor(tenant: FirebaseFirestore.DocumentReference, context: Parameters<typeof assertBranchAccess>[0], warehouseId: string) {
  const snapshot = await tenant.collection('warehouses').doc(warehouseId).get();
  if (!snapshot.exists || snapshot.data()?.active === false) throw new Error('WAREHOUSE_NOT_FOUND');
  const branchId = text(snapshot.data()?.branchId, 128);
  if (!branchId) throw new Error('WAREHOUSE_BRANCH_REQUIRED');
  assertBranchAccess(context, branchId);
  return { id: warehouseId, branchId, ...snapshot.data() };
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'inventory', 'edit');
    const body = await request.json();
    const branchId = text(body.branchId, 128) || request.headers.get('x-branch-id')?.trim() || context.branchIds[0] || '';
    const warehouseId = text(body.warehouseId, 128) || 'warehouse-main';
    if (!branchId) return NextResponse.json({ error: 'La sucursal es obligatoria para reservar inventario.' }, { status: 400 });
    assertBranchAccess(context, branchId);
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
    const warehouse = await warehouseFor(tenant, context, warehouseId);
    if (warehouse.branchId !== branchId) return NextResponse.json({ error: 'El almacén no pertenece a la sucursal indicada.' }, { status: 400 });
    const reservationRef = tenant.collection('stockReservations').doc();
    const productRefs = Array.from(items.keys()).map((id) => tenant.collection('products').doc(id));
    const stockRefs = Array.from(items.keys()).map((id) => tenant.collection('inventoryStocks').doc(stockKey(warehouseId, id)));
    const result = await db.runTransaction(async (transaction) => {
      const snapshots = await transaction.getAll(...productRefs);
      const stocks = await transaction.getAll(...stockRefs);
      const stockById = new Map(stocks.map((snapshot) => [snapshot.id, snapshot]));
      const reservationItems: Array<{ productId: string; quantity: number }> = [];
      snapshots.forEach((snapshot, index) => {
        const productId = productRefs[index].id;
        const requested = items.get(productId) || 0;
        if (!snapshot.exists || snapshot.data()?.active === false) throw new Error('PRODUCT_NOT_FOUND');
        const data = snapshot.data() || {};
        if (data.itemType === 'service') return;
        const stock = stockById.get(stockRefs[index].id);
        const currentStock = stock?.exists ? inventoryNumber(stock.data()?.quantity) : warehouseId === 'warehouse-main' ? inventoryNumber(data.stock) : 0;
        const newStock = stockAfterDelta(currentStock, -requested);
        transaction.set(stockRefs[index], { warehouseId, branchId, productId, quantity: newStock, averageCost: inventoryNumber(stock?.data()?.averageCost || data.averageCost), updatedAt: new Date(), updatedBy: context.uid }, { merge: true });
        if (warehouseId === 'warehouse-main') transaction.update(productRefs[index], { stock: newStock, updatedAt: new Date(), updatedBy: context.uid });
        transaction.set(tenant.collection('inventoryMovements').doc(), { warehouseId, branchId, productId, type: 'reserve', quantity: requested, delta: -requested, previousStock: currentStock, newStock, reason: `Reserva ${reservationRef.id}`, reservationId: reservationRef.id, createdBy: context.uid, createdAt: new Date() });
        reservationItems.push({ productId, quantity: requested });
      });
      if (!reservationItems.length) throw new Error('RESERVATION_EMPTY');
      const now = new Date();
      transaction.create(reservationRef, { branchId, warehouseId, items: reservationItems, status: 'active', reason: text(body.reason, 300) || 'Reserva de stock', createdBy: context.uid, createdAt: now, expiresAt: new Date(now.getTime() + 30 * 60 * 1000) });
      return { reservationId: reservationRef.id, branchId, warehouseId, items: reservationItems, status: 'active' };
    });
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'inventory.stock_reserved', entity: 'stockReservation', entityId: result.reservationId, after: result, request: { requestId: request.headers.get('x-correlation-id') || undefined, method: 'POST', path: '/api/inventory/reservations' }, result: 'success' });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'PRODUCT_NOT_FOUND') return NextResponse.json({ error: 'Uno de los productos no existe o está archivado.' }, { status: 404 });
    if (message === 'INSUFFICIENT_WAREHOUSE_STOCK') return NextResponse.json({ error: 'No hay stock suficiente para completar la reserva.' }, { status: 409 });
    if (message === 'RESERVATION_EMPTY') return NextResponse.json({ error: 'No se puede reservar únicamente servicios.' }, { status: 400 });
    if (message === 'WAREHOUSE_NOT_FOUND') return NextResponse.json({ error: 'El almacén no existe o no está activo.' }, { status: 404 });
    if (message === 'WAREHOUSE_BRANCH_REQUIRED') return NextResponse.json({ error: 'El almacén no tiene una sucursal válida.' }, { status: 409 });
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
      const branchId = text(reservation.branchId, 128);
      const warehouseId = text(reservation.warehouseId, 128) || 'warehouse-main';
      assertBranchAccess(context, branchId);
      const items = Array.isArray(reservation.items) ? reservation.items as Array<Record<string, unknown>> : [];
      const productRefs = items.map((item) => tenant.collection('products').doc(text(item.productId, 120)));
      const stockRefs = items.map((item) => tenant.collection('inventoryStocks').doc(stockKey(warehouseId, text(item.productId, 120))));
      const [productSnapshots, stockSnapshots] = await Promise.all([transaction.getAll(...productRefs), transaction.getAll(...stockRefs)]);
      stockSnapshots.forEach((stockSnapshot, index) => {
        const requested = quantity(items[index]?.quantity);
        if (requested <= 0) return;
        const product = productSnapshots[index];
        const currentStock = stockSnapshot.exists ? inventoryNumber(stockSnapshot.data()?.quantity) : warehouseId === 'warehouse-main' ? inventoryNumber(product?.data()?.stock) : 0;
        const newStock = stockAfterDelta(currentStock, requested);
        transaction.set(stockRefs[index], { warehouseId, branchId, productId: productRefs[index].id, quantity: newStock, averageCost: inventoryNumber(stockSnapshot.data()?.averageCost || product?.data()?.averageCost), updatedAt: new Date(), updatedBy: context.uid }, { merge: true });
        if (warehouseId === 'warehouse-main' && product?.exists) transaction.update(productRefs[index], { stock: newStock, updatedAt: new Date(), updatedBy: context.uid });
        transaction.set(tenant.collection('inventoryMovements').doc(), { warehouseId, branchId, productId: productRefs[index].id, type: 'release', quantity: requested, delta: requested, previousStock: currentStock, newStock, reason: `Liberación ${reservationId}`, reservationId, createdBy: context.uid, createdAt: new Date() });
      });
      const now = new Date();
      transaction.update(reservationRef, { status: 'released', releasedBy: context.uid, releasedAt: now, updatedAt: now });
      return { reservationId, branchId, warehouseId, status: 'released' };
    });
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'inventory.stock_reservation_released', entity: 'stockReservation', entityId: reservationId, after: result, request: { requestId: request.headers.get('x-correlation-id') || undefined, method: 'DELETE', path: '/api/inventory/reservations' }, result: 'success' });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'RESERVATION_NOT_FOUND') return NextResponse.json({ error: 'La reserva no existe.' }, { status: 404 });
    if (message === 'RESERVATION_CLOSED') return NextResponse.json({ error: 'La reserva ya fue cerrada.' }, { status: 409 });
    if (message === 'INSUFFICIENT_WAREHOUSE_STOCK') return NextResponse.json({ error: 'No se pudo liberar la reserva por inconsistencia de stock.' }, { status: 409 });
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}
