import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';
import { inventoryNumber, stockAfterDelta, stockKey, weightedAverageCost } from '@/lib/inventory-cost';

export const runtime = 'nodejs';

function text(value: unknown, max = 180) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function money(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value * 100) / 100) : 0; }
const TENANT_WIDE_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);

async function warehouseFor(tenant: FirebaseFirestore.DocumentReference, context: Parameters<typeof assertBranchAccess>[0], warehouseId: string) {
  const snapshot = await tenant.collection('warehouses').doc(warehouseId).get();
  if (!snapshot.exists || snapshot.data()?.active === false) throw new Error('WAREHOUSE_NOT_FOUND');
  const branchId = text(snapshot.data()?.branchId, 128);
  if (!branchId) throw new Error('WAREHOUSE_BRANCH_REQUIRED');
  assertBranchAccess(context, branchId);
  return { id: warehouseId, branchId, ...snapshot.data() };
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'inventory', 'view');
    const tenant = getAdminDb().collection('tenants').doc(context.tenantId);
    const snapshot = await tenant.collection('purchases').orderBy('createdAt', 'desc').limit(100).get();
    const purchases = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() } as Record<string, unknown> & { id: string }))
      .filter((purchase) => TENANT_WIDE_ROLES.has(context.role) || (typeof purchase.branchId === 'string' && context.branchIds.includes(purchase.branchId)));
    return NextResponse.json({ ok: true, purchases }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'inventory', 'create');
    const body = await request.json();
    const supplierName = text(body.supplierName, 180);
    const evidenceRef = text(body.evidenceRef, 500);
    const branchId = text(body.branchId, 128);
    const warehouseId = text(body.warehouseId, 128);
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!branchId || !warehouseId) return NextResponse.json({ error: 'La sucursal y el almacén son obligatorios.' }, { status: 400 });
    if (!rawItems.length || rawItems.length > 50) return NextResponse.json({ error: 'La compra debe contener entre 1 y 50 productos.' }, { status: 400 });
    try { assertBranchAccess(context, branchId); } catch (error) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
    const items: Array<{ productId: string; quantity: number; unitCost: number }> = rawItems
      .map((item: Record<string, unknown>) => {
        const quantity = typeof item.quantity === 'number' && Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 0;
        return { productId: text(item.productId, 120), quantity, unitCost: money(item.unitCost) };
      })
      .filter((item: { productId: string; quantity: number }) => item.productId && item.quantity > 0);
    if (!items.length) return NextResponse.json({ error: 'Los ítems de la compra no son válidos.' }, { status: 400 });

    const db = getAdminDb();
    const tenant = db.collection('tenants').doc(context.tenantId);
    const warehouse = await warehouseFor(tenant, context, warehouseId);
    if (warehouse.branchId !== branchId) return NextResponse.json({ error: 'El almacén no pertenece a la sucursal indicada.' }, { status: 400 });
    const purchaseRef = tenant.collection('purchases').doc();
    const productRefs = Array.from(new Set(items.map((item) => item.productId))).map((id) => tenant.collection('products').doc(id));
    const stockRefs = Array.from(new Set(items.map((item) => item.productId))).map((id) => tenant.collection('inventoryStocks').doc(stockKey(warehouseId, id)));
    const now = new Date();

    const result = await db.runTransaction(async (transaction) => {
      const products = await transaction.getAll(...productRefs);
      const stocks = await transaction.getAll(...stockRefs);
      const byId = new Map(products.map((snapshot) => [snapshot.id, snapshot]));
      const stockById = new Map(stocks.map((snapshot) => [snapshot.id, snapshot]));
      const movements: Array<Record<string, unknown>> = [];
      let total = 0;

      for (const item of items) {
        const product = byId.get(item.productId);
        if (!product?.exists || product.data()?.active === false) throw new Error('PRODUCT_NOT_FOUND');
        const stockRef = tenant.collection('inventoryStocks').doc(stockKey(warehouseId, item.productId));
        const stock = stockById.get(stockRef.id);
        const current = stock?.exists
          ? inventoryNumber(stock.data()?.quantity)
          : warehouseId === 'warehouse-main' ? inventoryNumber(product.data()?.stock) : 0;
        const currentCost = stock?.exists ? inventoryNumber(stock.data()?.averageCost) : inventoryNumber(product.data()?.averageCost);
        const next = stockAfterDelta(current, item.quantity);
        const nextCost = weightedAverageCost(current, currentCost, item.quantity, item.unitCost);
        const lineTotal = item.quantity * item.unitCost;
        total += lineTotal;
        transaction.set(stockRef, { warehouseId, branchId, productId: item.productId, quantity: next, averageCost: nextCost, updatedAt: now, updatedBy: context.uid }, { merge: true });
        if (warehouseId === 'warehouse-main') transaction.update(product.ref, { stock: next, averageCost: nextCost, updatedAt: now, updatedBy: context.uid });
        const movementRef = tenant.collection('inventoryMovements').doc();
        transaction.set(movementRef, { warehouseId, branchId, productId: item.productId, type: 'purchase', quantity: item.quantity, delta: item.quantity, previousStock: current, newStock: next, unitCost: item.unitCost || currentCost, averageCost: nextCost, reason: `Compra ${purchaseRef.id}`, purchaseId: purchaseRef.id, createdBy: context.uid, createdAt: now });
        movements.push({ productId: item.productId, quantity: item.quantity, unitCost: item.unitCost, lineTotal, previousStock: current, newStock: next, averageCost: nextCost });
      }

      transaction.create(purchaseRef, { supplierName: supplierName || 'Proveedor no especificado', branchId, warehouseId, items: movements, total: money(total), evidenceRef: evidenceRef && !evidenceRef.startsWith('data:') ? evidenceRef : null, status: 'confirmed', createdBy: context.uid, createdAt: now, updatedAt: now });
      return { purchaseId: purchaseRef.id, branchId, warehouseId, total: money(total), itemCount: movements.length };
    });

    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'purchase.created', entity: 'purchase', entityId: result.purchaseId, after: result, result: 'success' });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'PRODUCT_NOT_FOUND') return NextResponse.json({ error: 'Uno de los productos no existe o está archivado.' }, { status: 404 });
    if (message === 'WAREHOUSE_NOT_FOUND') return NextResponse.json({ error: 'El almacén no existe o no está activo.' }, { status: 404 });
    if (message === 'WAREHOUSE_BRANCH_REQUIRED') return NextResponse.json({ error: 'El almacén no tiene una sucursal válida.' }, { status: 409 });
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
