import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';
import { inventoryNumber, stockAfterDelta, stockKey, weightedAverageCost } from '@/lib/inventory-cost';

export const runtime = 'nodejs';
const MANAGERS = new Set(['owner', 'admin', 'gerente', 'jefe']);
function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function quantity(value: unknown) { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value * 10000) / 10000 : 0; }

async function warehouseFor(tenant: FirebaseFirestore.DocumentReference, context: { role: Parameters<typeof assertBranchAccess>[0]['role']; branchIds: string[] }, warehouseId: string) {
  const snapshot = await tenant.collection('warehouses').doc(warehouseId).get();
  if (!snapshot.exists || snapshot.data()?.active === false) throw new Error('WAREHOUSE_NOT_FOUND');
  const branchId = text(snapshot.data()?.branchId, 128);
  assertBranchAccess(context, branchId);
  return { id: warehouseId, branchId, ...snapshot.data() };
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'inventory', 'view');
    const supabase = getSupabaseServer();
    const warehouseId = text(new URL(request.url).searchParams.get('warehouseId'), 128);
    const [warehouseResult, stockResult] = await Promise.all([
      supabase.from('warehouses').select('id,tenant_id,branch_id,code,name,active').eq('tenant_id', context.tenantId).eq('active', true).order('name').limit(100),
      warehouseId ? supabase.from('inventory_stocks').select('id,warehouse_id,product_id,quantity,reorder_point,updated_at,products(id,name,sku,price,cost,item_type,active)').eq('tenant_id', context.tenantId).eq('warehouse_id', warehouseId).limit(500) : Promise.resolve({ data: [], error: null }),
    ]);
    if (warehouseResult.error) throw new Error(warehouseResult.error.message);
    if (stockResult.error) throw new Error(stockResult.error.message);
    const visibleWarehouses = (warehouseResult.data || []).filter((item) => ['owner', 'admin', 'gerente', 'jefe'].includes(context.role) || context.branchIds.includes(String(item.branch_id)));
    if (warehouseId && !visibleWarehouses.some((item) => item.id === warehouseId)) return NextResponse.json({ error: 'El almacén no está autorizado para este usuario.' }, { status: 403 });
    const stocks = (stockResult.data || []).map((row: any) => ({ id: row.id, warehouseId: row.warehouse_id, productId: row.product_id, quantity: Number(row.quantity || 0), averageCost: Number(row.products?.cost || 0), reorderPoint: Number(row.reorder_point || 0), updatedAt: row.updated_at }));
    return NextResponse.json({ ok: true, warehouses: visibleWarehouses.map((item) => ({ id: item.id, branchId: item.branch_id, code: item.code, name: item.name, active: item.active })), stocks, transfers: [] }, { headers: { 'Cache-Control': 'no-store' } });
    /* The legacy Firestore reader below remains only for historical data not yet migrated. */
    const tenant = getAdminDb().collection('tenants').doc(context.tenantId);
    const warehouseDocs = (await tenant.collection('warehouses').where('active', '==', true).orderBy('name').get()).docs;
    const warehouses: Array<Record<string, unknown> & { id: string }> = warehouseDocs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
    const legacyVisibleWarehouses = warehouses.filter((item) => context.branchIds.includes(String(item.branchId)) || ['owner', 'admin', 'gerente', 'jefe'].includes(context.role));
    if (warehouseId && !legacyVisibleWarehouses.some((item) => item.id === warehouseId)) {
      return NextResponse.json({ error: 'El almacén no está autorizado para este usuario.' }, { status: 403 });
    }
    const stocksSnapshot = warehouseId
      ? await tenant.collection('inventoryStocks').where('warehouseId', '==', warehouseId).orderBy('updatedAt', 'desc').limit(500).get()
      : null;
    const transferSnapshot = await tenant.collection('inventoryTransfers').orderBy('createdAt', 'desc').limit(100).get();
    const transfers = transferSnapshot.docs
      .map<Record<string, unknown> & { id: string }>((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
      .filter((item) => legacyVisibleWarehouses.some((warehouse) => warehouse.id === String(item['fromWarehouseId'] || '') || warehouse.id === String(item['toWarehouseId'] || '')));
    return NextResponse.json({ ok: true, warehouses: legacyVisibleWarehouses, stocks: stocksSnapshot?.docs.map((doc) => ({ id: doc.id, ...doc.data() })) || [], transfers }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = text(body.action, 30);
    const permission = action === 'approve-count' ? 'edit' : 'create';
    const context = await requireTenantPermission(request, 'inventory', permission);
    const db = getAdminDb(); const tenant = db.collection('tenants').doc(context.tenantId); const now = new Date();
    if (['create-transfer', 'approve-transfer', 'dispatch-transfer', 'receive-transfer', 'cancel-transfer'].includes(action)) {
      const transferId = text(body.transferId, 128);
      if (action === 'create-transfer') {
        const fromWarehouseId = text(body.fromWarehouseId, 128); const toWarehouseId = text(body.toWarehouseId, 128); const productId = text(body.productId, 128); const moveQuantity = quantity(body.quantity); const reason = text(body.reason, 300) || 'Transferencia entre almacenes';
        if (!fromWarehouseId || !toWarehouseId || fromWarehouseId === toWarehouseId || !productId || moveQuantity <= 0) return NextResponse.json({ error: 'Almacenes origen/destino, producto y cantidad son obligatorios.' }, { status: 400 });
        const [fromWarehouse, toWarehouse] = await Promise.all([warehouseFor(tenant, context, fromWarehouseId), warehouseFor(tenant, context, toWarehouseId)]);
        const productSnapshot = await tenant.collection('products').doc(productId).get();
        if (!productSnapshot.exists || productSnapshot.data()?.active === false) return NextResponse.json({ error: 'El producto no existe o está archivado.' }, { status: 404 });
        const transferRef = tenant.collection('inventoryTransfers').doc();
        const data = { fromWarehouseId, toWarehouseId, fromBranchId: fromWarehouse.branchId, toBranchId: toWarehouse.branchId, productId, quantity: moveQuantity, receivedQuantity: 0, reason, status: 'draft', createdBy: context.uid, createdAt: now, updatedAt: now };
        await transferRef.create(data); await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'inventory.transfer_created', entity: 'inventoryTransfer', entityId: transferRef.id, after: data, result: 'success' });
        return NextResponse.json({ ok: true, transferId: transferRef.id, ...data }, { status: 201 });
      }
      if (!transferId) return NextResponse.json({ error: 'La transferencia es obligatoria.' }, { status: 400 });
      const transferRef = tenant.collection('inventoryTransfers').doc(transferId);
      const transferSnapshot = await transferRef.get();
      if (!transferSnapshot.exists) return NextResponse.json({ error: 'La transferencia no existe.' }, { status: 404 });
      const transfer = transferSnapshot.data() || {};
      const status = text(transfer.status, 40);
      if (action === 'approve-transfer') {
        if (!MANAGERS.has(context.role)) return NextResponse.json({ error: 'Solo un responsable puede aprobar transferencias.' }, { status: 403 });
        if (status !== 'draft' && status !== 'requested') return NextResponse.json({ error: 'La transferencia no está pendiente de aprobación.' }, { status: 409 });
        await transferRef.update({ status: 'approved', approvedBy: context.uid, approvedAt: now, updatedAt: now });
        return NextResponse.json({ ok: true, transferId, status: 'approved' });
      }
      if (action === 'cancel-transfer') {
        if (!['draft', 'requested', 'approved'].includes(status)) return NextResponse.json({ error: 'Solo se puede cancelar una transferencia antes del despacho.' }, { status: 409 });
        await transferRef.update({ status: 'cancelled', cancelledBy: context.uid, cancelledAt: now, updatedAt: now });
        return NextResponse.json({ ok: true, transferId, status: 'cancelled' });
      }
      const fromWarehouseId = text(transfer.fromWarehouseId, 128); const toWarehouseId = text(transfer.toWarehouseId, 128); const productId = text(transfer.productId, 128); const totalQuantity = quantity(transfer.quantity);
      const [fromWarehouse, toWarehouse] = await Promise.all([warehouseFor(tenant, context, fromWarehouseId), warehouseFor(tenant, context, toWarehouseId)]);
      if (action === 'dispatch-transfer') {
        if (status !== 'approved') return NextResponse.json({ error: 'La transferencia debe estar aprobada antes del despacho.' }, { status: 409 });
        const fromRef = tenant.collection('inventoryStocks').doc(stockKey(fromWarehouseId, productId)); const productRef = tenant.collection('products').doc(productId); const movementRef = tenant.collection('inventoryMovements').doc();
        const result = await db.runTransaction(async (transaction) => { const [fromSnapshot, productSnapshot] = await Promise.all([transaction.get(fromRef), transaction.get(productRef)]); if (!productSnapshot.exists) throw new Error('PRODUCT_NOT_FOUND'); const current = fromSnapshot.exists ? inventoryNumber(fromSnapshot.data()?.quantity) : 0; const next = stockAfterDelta(current, -totalQuantity); const unitCost = inventoryNumber(fromSnapshot.data()?.averageCost || productSnapshot.data()?.averageCost); transaction.set(fromRef, { warehouseId: fromWarehouseId, branchId: fromWarehouse.branchId, productId, quantity: next, averageCost: unitCost, updatedAt: now, updatedBy: context.uid }, { merge: true }); if (fromWarehouseId === 'warehouse-main') transaction.update(productRef, { stock: next, updatedAt: now, updatedBy: context.uid }); transaction.set(movementRef, { warehouseId: fromWarehouseId, branchId: fromWarehouse.branchId, productId, type: 'transfer_dispatch', quantity: totalQuantity, delta: -totalQuantity, previousStock: current, newStock: next, transferId, createdBy: context.uid, createdAt: now }); transaction.update(transferRef, { status: 'in_transit', dispatchedBy: context.uid, dispatchedAt: now, unitCost, updatedAt: now }); return { current, next, unitCost }; });
        return NextResponse.json({ ok: true, transferId, status: 'in_transit', ...result });
      }
      if (status !== 'in_transit') return NextResponse.json({ error: 'La transferencia no está en tránsito.' }, { status: 409 });
      const receiveQuantity = quantity(body.receivedQuantity ?? body.quantity); const alreadyReceived = quantity(transfer.receivedQuantity); const remaining = Math.max(0, totalQuantity - alreadyReceived);
      if (receiveQuantity <= 0 || receiveQuantity > remaining) return NextResponse.json({ error: 'La recepción supera la cantidad pendiente.' }, { status: 409 });
      const toRef = tenant.collection('inventoryStocks').doc(stockKey(toWarehouseId, productId)); const productRef = tenant.collection('products').doc(productId); const movementRef = tenant.collection('inventoryMovements').doc();
      const result = await db.runTransaction(async (transaction) => { const [toSnapshot, productSnapshot] = await Promise.all([transaction.get(toRef), transaction.get(productRef)]); if (!productSnapshot.exists) throw new Error('PRODUCT_NOT_FOUND'); const current = toSnapshot.exists ? inventoryNumber(toSnapshot.data()?.quantity) : 0; const next = stockAfterDelta(current, receiveQuantity); const nextReceived = alreadyReceived + receiveQuantity; const nextStatus = nextReceived >= totalQuantity ? 'received' : 'in_transit'; const unitCost = inventoryNumber(transfer.unitCost || toSnapshot.data()?.averageCost || productSnapshot.data()?.averageCost); transaction.set(toRef, { warehouseId: toWarehouseId, branchId: toWarehouse.branchId, productId, quantity: next, averageCost: inventoryNumber(toSnapshot.data()?.averageCost || unitCost), updatedAt: now, updatedBy: context.uid }, { merge: true }); transaction.set(movementRef, { warehouseId: toWarehouseId, branchId: toWarehouse.branchId, productId, type: 'transfer_receive', quantity: receiveQuantity, delta: receiveQuantity, previousStock: current, newStock: next, transferId, createdBy: context.uid, createdAt: now }); transaction.update(transferRef, { status: nextStatus, receivedQuantity: nextReceived, receivedBy: context.uid, receivedAt: now, updatedAt: now }); return { current, next, receivedQuantity: nextReceived, remaining: totalQuantity - nextReceived, status: nextStatus }; });
      return NextResponse.json({ ok: true, transferId, ...result });
    }
    if (action === 'transfer') {
      const fromWarehouseId = text(body.fromWarehouseId, 128); const toWarehouseId = text(body.toWarehouseId, 128); const productId = text(body.productId, 128); const moveQuantity = quantity(body.quantity); const reason = text(body.reason, 300) || 'Transferencia entre almacenes';
      if (!fromWarehouseId || !toWarehouseId || fromWarehouseId === toWarehouseId || !productId || moveQuantity <= 0) return NextResponse.json({ error: 'Almacenes origen/destino, producto y cantidad son obligatorios.' }, { status: 400 });
      const [fromWarehouse, toWarehouse] = await Promise.all([warehouseFor(tenant, context, fromWarehouseId), warehouseFor(tenant, context, toWarehouseId)]);
      const fromRef = tenant.collection('inventoryStocks').doc(stockKey(fromWarehouseId, productId)); const toRef = tenant.collection('inventoryStocks').doc(stockKey(toWarehouseId, productId)); const productRef = tenant.collection('products').doc(productId); const transferRef = tenant.collection('inventoryTransfers').doc();
      const result = await db.runTransaction(async (transaction) => {
        const [fromSnapshot, toSnapshot, productSnapshot] = await Promise.all([transaction.get(fromRef), transaction.get(toRef), transaction.get(productRef)]);
        if (!productSnapshot.exists || productSnapshot.data()?.active === false) throw new Error('PRODUCT_NOT_FOUND');
        const currentFrom = fromSnapshot.exists ? inventoryNumber(fromSnapshot.data()?.quantity) : 0; const currentTo = toSnapshot.exists ? inventoryNumber(toSnapshot.data()?.quantity) : 0; const nextFrom = stockAfterDelta(currentFrom, -moveQuantity); const nextTo = stockAfterDelta(currentTo, moveQuantity); const unitCost = inventoryNumber(fromSnapshot.data()?.averageCost || productSnapshot.data()?.averageCost);
        transaction.set(fromRef, { warehouseId: fromWarehouseId, branchId: fromWarehouse.branchId, productId, quantity: nextFrom, averageCost: unitCost, updatedAt: now, updatedBy: context.uid }, { merge: true }); transaction.set(toRef, { warehouseId: toWarehouseId, branchId: toWarehouse.branchId, productId, quantity: nextTo, averageCost: inventoryNumber(toSnapshot.data()?.averageCost || unitCost), updatedAt: now, updatedBy: context.uid }, { merge: true });
        transaction.create(transferRef, { fromWarehouseId, toWarehouseId, productId, quantity: moveQuantity, unitCost, reason, status: 'completed', createdBy: context.uid, createdAt: now });
        transaction.create(tenant.collection('inventoryMovements').doc(), { warehouseId: fromWarehouseId, branchId: fromWarehouse.branchId, productId, type: 'transfer_out', quantity: moveQuantity, delta: -moveQuantity, previousStock: currentFrom, newStock: nextFrom, transferId: transferRef.id, reason, createdBy: context.uid, createdAt: now });
        transaction.create(tenant.collection('inventoryMovements').doc(), { warehouseId: toWarehouseId, branchId: toWarehouse.branchId, productId, type: 'transfer_in', quantity: moveQuantity, delta: moveQuantity, previousStock: currentTo, newStock: nextTo, transferId: transferRef.id, reason, createdBy: context.uid, createdAt: now });
        return { transferId: transferRef.id, fromQuantity: nextFrom, toQuantity: nextTo, unitCost };
      });
      await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'inventory.transferred', entity: 'inventoryTransfer', entityId: result.transferId, after: result, result: 'success' }); return NextResponse.json({ ok: true, ...result }, { status: 201 });
    }
    if (action === 'count') {
      const warehouseId = text(body.warehouseId, 128); const productId = text(body.productId, 128); const countedQuantity = typeof body.countedQuantity === 'number' && Number.isFinite(body.countedQuantity) && body.countedQuantity >= 0 ? Math.round(body.countedQuantity * 10000) / 10000 : -1; const reason = text(body.reason, 300) || 'Conteo físico';
      if (!warehouseId || !productId || countedQuantity < 0) return NextResponse.json({ error: 'Almacén, producto y cantidad contada son obligatorios.' }, { status: 400 });
      const warehouse = await warehouseFor(tenant, context, warehouseId); const stockRef = tenant.collection('inventoryStocks').doc(stockKey(warehouseId, productId)); const productRef = tenant.collection('products').doc(productId); const countRef = tenant.collection('inventoryCounts').doc();
      const stockSnapshot = await stockRef.get(); const productSnapshot = await productRef.get(); if (!productSnapshot.exists || productSnapshot.data()?.active === false) return NextResponse.json({ error: 'El producto no existe o está archivado.' }, { status: 404 }); const currentQuantity = stockSnapshot.exists ? inventoryNumber(stockSnapshot.data()?.quantity) : 0;
      const data = { warehouseId, branchId: warehouse.branchId, productId, previousQuantity: currentQuantity, countedQuantity, difference: countedQuantity - currentQuantity, reason, status: 'pending_review', countedBy: context.uid, countedAt: now, createdAt: now };
      await countRef.create(data); await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'inventory.count_submitted', entity: 'inventoryCount', entityId: countRef.id, after: data, result: 'success' }); return NextResponse.json({ ok: true, countId: countRef.id, ...data }, { status: 201 });
    }
    if (action === 'approve-count') {
      if (!MANAGERS.has(context.role)) return NextResponse.json({ error: 'Solo un responsable puede aprobar un conteo físico.' }, { status: 403 });
      const countId = text(body.countId, 128); if (!countId) return NextResponse.json({ error: 'El conteo es obligatorio.' }, { status: 400 }); const countRef = tenant.collection('inventoryCounts').doc(countId); const countSnapshot = await countRef.get(); if (!countSnapshot.exists) return NextResponse.json({ error: 'El conteo no existe.' }, { status: 404 }); const count = countSnapshot.data() || {}; const warehouse = await warehouseFor(tenant, context, text(count.warehouseId, 128)); const stockRef = tenant.collection('inventoryStocks').doc(stockKey(text(count.warehouseId, 128), text(count.productId, 128))); const productRef = tenant.collection('products').doc(text(count.productId, 128)); const movementRef = tenant.collection('inventoryMovements').doc();
      const result = await db.runTransaction(async (transaction) => { const [stockSnapshot, productSnapshot] = await Promise.all([transaction.get(stockRef), transaction.get(productRef)]); if (!productSnapshot.exists) throw new Error('PRODUCT_NOT_FOUND'); const current = stockSnapshot.exists ? inventoryNumber(stockSnapshot.data()?.quantity) : 0; const countedQuantity = inventoryNumber(count.countedQuantity); const difference = countedQuantity - current; transaction.set(stockRef, { warehouseId: count.warehouseId, branchId: warehouse.branchId, productId: count.productId, quantity: countedQuantity, averageCost: inventoryNumber(stockSnapshot.data()?.averageCost || productSnapshot.data()?.averageCost), updatedAt: now, updatedBy: context.uid }, { merge: true }); transaction.set(movementRef, { warehouseId: count.warehouseId, branchId: warehouse.branchId, productId: count.productId, type: 'count_adjustment', quantity: Math.abs(difference), delta: difference, previousStock: current, newStock: countedQuantity, countId, reason: count.reason || 'Conteo físico aprobado', createdBy: context.uid, createdAt: now }); transaction.update(countRef, { status: 'approved', approvedBy: context.uid, approvedAt: now, appliedDifference: difference }); return { current, countedQuantity, difference }; });
      await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'inventory.count_approved', entity: 'inventoryCount', entityId: countId, after: result, result: 'success' }); return NextResponse.json({ ok: true, countId, ...result });
    }
    const warehouseId = text(body.warehouseId, 128); const productId = text(body.productId, 128); const moveQuantity = quantity(body.quantity); const movementType = body.movementType === 'receive' || body.movementType === 'remove' ? body.movementType : ''; const unitCost = inventoryNumber(body.unitCost); const reason = text(body.reason, 300) || (movementType === 'receive' ? 'Recepción de inventario' : 'Ajuste de inventario');
    if (!warehouseId || !productId || !movementType || moveQuantity <= 0) return NextResponse.json({ error: 'Almacén, producto, tipo y cantidad son obligatorios.' }, { status: 400 });
    const warehouse = await warehouseFor(tenant, context, warehouseId); const stockRef = tenant.collection('inventoryStocks').doc(stockKey(warehouseId, productId)); const productRef = tenant.collection('products').doc(productId); const movementRef = tenant.collection('inventoryMovements').doc();
    const result = await db.runTransaction(async (transaction) => { const [stockSnapshot, productSnapshot] = await Promise.all([transaction.get(stockRef), transaction.get(productRef)]); if (!productSnapshot.exists || productSnapshot.data()?.active === false) throw new Error('PRODUCT_NOT_FOUND'); const current = stockSnapshot.exists ? inventoryNumber(stockSnapshot.data()?.quantity) : warehouseId === 'warehouse-main' ? inventoryNumber(productSnapshot.data()?.stock) : 0; const currentCost = stockSnapshot.exists ? inventoryNumber(stockSnapshot.data()?.averageCost) : inventoryNumber(productSnapshot.data()?.averageCost); const delta = movementType === 'receive' ? moveQuantity : -moveQuantity; const next = stockAfterDelta(current, delta); const nextCost = movementType === 'receive' ? weightedAverageCost(current, currentCost, moveQuantity, unitCost) : currentCost; transaction.set(stockRef, { warehouseId, branchId: warehouse.branchId, productId, quantity: next, averageCost: nextCost, updatedAt: now, updatedBy: context.uid }, { merge: true }); if (warehouseId === 'warehouse-main') transaction.update(productRef, { stock: next, averageCost: nextCost, updatedAt: now, updatedBy: context.uid }); transaction.create(movementRef, { warehouseId, branchId: warehouse.branchId, productId, type: movementType === 'receive' ? 'warehouse_receive' : 'warehouse_remove', quantity: moveQuantity, delta, previousStock: current, newStock: next, unitCost: unitCost || currentCost, reason, createdBy: context.uid, createdAt: now }); return { current, next, delta, averageCost: nextCost }; });
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'inventory.warehouse_adjusted', entity: 'inventoryStock', entityId: stockRef.id, before: { quantity: result.current }, after: result, result: 'success' }); return NextResponse.json({ ok: true, warehouseId, productId, ...result }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'WAREHOUSE_NOT_FOUND') return NextResponse.json({ error: 'El almacén no existe o no está activo.' }, { status: 404 });
    if (message === 'PRODUCT_NOT_FOUND') return NextResponse.json({ error: 'El producto no existe o está archivado.' }, { status: 404 });
    if (message === 'INSUFFICIENT_WAREHOUSE_STOCK') return NextResponse.json({ error: 'El movimiento dejaría el almacén en inventario negativo.' }, { status: 409 });
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}
