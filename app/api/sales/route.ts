import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantMember, tenantErrorResponse, TenantRole } from '@/lib/tenant';

export const runtime = 'nodejs';
const salesRoles: TenantRole[] = ['owner', 'admin', 'jefe', 'vendedor', 'cajero'];

function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function money(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0; }

type SaleLineInput = { productId?: unknown; quantity?: unknown };

type SaleLine = { productId: string; name: string; sku: string; quantity: number; unitPrice: number; total: number };

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantMember(request);
    const snapshot = await getAdminDb().collection('tenants').doc(context.tenantId).collection('sales').orderBy('createdAt', 'desc').limit(50).get();
    return NextResponse.json({ ok: true, sales: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantMember(request, salesRoles);
    const body = await request.json();
    const rawLines = Array.isArray(body.items) ? body.items as SaleLineInput[] : [];
    const paymentMethod = ['cash', 'card', 'transfer', 'credit'].includes(body.paymentMethod) ? body.paymentMethod : '';
    const customerName = text(body.customerName, 120);
    const discount = money(body.discount);
    if (!rawLines.length || !paymentMethod) return NextResponse.json({ error: 'Agrega productos y selecciona un método de pago.' }, { status: 400 });
    if (paymentMethod === 'credit' && !customerName) return NextResponse.json({ error: 'Las ventas a crédito requieren el nombre del cliente.' }, { status: 400 });

    const unique = new Map<string, number>();
    for (const line of rawLines) {
      const productId = text(line.productId, 120);
      const quantity = typeof line.quantity === 'number' && Number.isInteger(line.quantity) ? line.quantity : 0;
      if (productId && quantity > 0) unique.set(productId, (unique.get(productId) || 0) + quantity);
    }
    if (!unique.size) return NextResponse.json({ error: 'Las cantidades de la venta no son válidas.' }, { status: 400 });

    const db = getAdminDb();
    const tenant = db.collection('tenants').doc(context.tenantId);
    const saleRef = tenant.collection('sales').doc();
    const productIds = Array.from(unique.keys());
    const movementRefs = productIds.map(() => tenant.collection('inventoryMovements').doc());
    const productRefs = productIds.map((id) => tenant.collection('products').doc(id));

    const result = await db.runTransaction(async (transaction) => {
      const snapshots = await transaction.getAll(...productRefs);
      const lines: SaleLine[] = [];
      let subtotal = 0;
      snapshots.forEach((snapshot, index) => {
        if (!snapshot.exists || snapshot.data()?.active === false) throw new Error('PRODUCT_NOT_FOUND');
        const data = snapshot.data() || {};
        const quantity = unique.get(productRefs[index].id) || 0;
        if (data.itemType !== 'service' && Number(data.stock || 0) < quantity) throw new Error(`INSUFFICIENT_STOCK:${data.name || productRefs[index].id}`);
        const unitPrice = money(data.price);
        const total = unitPrice * quantity;
        subtotal += total;
        lines.push({ productId: productRefs[index].id, name: text(data.name) || 'Producto', sku: text(data.sku, 50), quantity, unitPrice, total });
      });
      const total = Math.max(0, subtotal - discount);
      const now = new Date();
      snapshots.forEach((snapshot, index) => {
        const data = snapshot.data() || {};
        if (data.itemType === 'service') return;
        const quantity = unique.get(productRefs[index].id) || 0;
        const previousStock = Number(data.stock || 0);
        const newStock = previousStock - quantity;
        transaction.update(productRefs[index], { stock: newStock, updatedAt: now, updatedBy: context.uid });
        transaction.set(movementRefs[index], { productId: productRefs[index].id, type: 'sale', quantity, delta: -quantity, previousStock, newStock, reason: `Venta ${saleRef.id}`, saleId: saleRef.id, createdBy: context.uid, createdAt: now });
      });
      transaction.set(saleRef, { saleNumber: `V-${Date.now().toString(36).toUpperCase()}`, items: lines, subtotal, discount, total, paymentMethod, customerName: customerName || null, status: 'completed', createdBy: context.uid, createdAt: now, updatedAt: now });
      return { saleId: saleRef.id, total, lines };
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'PRODUCT_NOT_FOUND') return NextResponse.json({ error: 'Uno de los productos ya no está disponible.' }, { status: 404 });
    if (message.startsWith('INSUFFICIENT_STOCK:')) return NextResponse.json({ error: `Stock insuficiente para ${message.split(':').slice(1).join(':')}.` }, { status: 409 });
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
