import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
function text(value: unknown, max = 180) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function money(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value * 100) / 100) : 0; }
export async function GET(request: NextRequest) {
  try { const context = await requireTenantPermission(request, 'inventory', 'view'); const snapshot = await getAdminDb().collection('tenants').doc(context.tenantId).collection('purchases').orderBy('createdAt', 'desc').limit(25).get(); return NextResponse.json({ ok: true, purchases: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'inventory', 'create'); const body = await request.json(); const supplierName = text(body.supplierName, 180); const evidenceRef = text(body.evidenceRef, 500); const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length || rawItems.length > 50) return NextResponse.json({ error: 'La compra debe contener entre 1 y 50 productos.' }, { status: 400 });
    const items: Array<{ productId: string; quantity: number; unitCost: number }> = rawItems.map((item: Record<string, unknown>) => { const quantity = typeof item.quantity === 'number' && Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 0; return { productId: text(item.productId, 120), quantity, unitCost: money(item.unitCost) }; }).filter((item: { productId: string; quantity: number }) => item.productId && item.quantity > 0);
    if (!items.length) return NextResponse.json({ error: 'Los ítems de la compra no son válidos.' }, { status: 400 });
    const db = getAdminDb(); const tenant = db.collection('tenants').doc(context.tenantId); const purchaseRef = tenant.collection('purchases').doc(); const productRefs = Array.from(new Set(items.map((item) => item.productId))).map((id) => tenant.collection('products').doc(id)); const now = new Date();
    const result = await db.runTransaction(async (transaction) => {
      const products = await transaction.getAll(...productRefs); const byId = new Map(products.map((snapshot) => [snapshot.id, snapshot])); const movements: Array<Record<string, unknown>> = []; let total = 0;
      for (const item of items) { const product = byId.get(item.productId); if (!product?.exists || product.data()?.active === false) throw new Error('PRODUCT_NOT_FOUND'); const current = Number(product.data()?.stock || 0); const lineTotal = item.quantity * item.unitCost; total += lineTotal; transaction.update(product.ref, { stock: current + item.quantity, updatedAt: now, updatedBy: context.uid }); const movementRef = tenant.collection('inventoryMovements').doc(); transaction.set(movementRef, { productId: item.productId, type: 'purchase', quantity: item.quantity, delta: item.quantity, previousStock: current, newStock: current + item.quantity, reason: `Compra ${purchaseRef.id}`, purchaseId: purchaseRef.id, createdBy: context.uid, createdAt: now }); movements.push({ productId: item.productId, quantity: item.quantity, unitCost: item.unitCost, lineTotal }); }
      transaction.create(purchaseRef, { supplierName: supplierName || 'Proveedor no especificado', items: movements, total: money(total), evidenceRef: evidenceRef && !evidenceRef.startsWith('data:') ? evidenceRef : null, status: 'confirmed', createdBy: context.uid, createdAt: now, updatedAt: now }); return { purchaseId: purchaseRef.id, total: money(total), itemCount: movements.length };
    });
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'purchase.created', entity: 'purchase', entityId: result.purchaseId, after: result, result: 'success' }); return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error: unknown) { const message = error instanceof Error ? error.message : ''; if (message === 'PRODUCT_NOT_FOUND') return NextResponse.json({ error: 'Uno de los productos no existe o está archivado.' }, { status: 404 }); const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
