import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse, TenantRole } from '@/lib/tenant';

export const runtime = 'nodejs';

const inventoryRoles: TenantRole[] = ['owner', 'admin', 'jefe', 'bodega'];

function text(value: unknown, max = 180) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function positiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'inventory', 'view');
    const db = getAdminDb();
    const tenant = db.collection('tenants').doc(context.tenantId);
    const [products, movements] = await Promise.all([
      tenant.collection('products').where('active', '==', true).get(),
      tenant.collection('inventoryMovements').orderBy('createdAt', 'desc').limit(40).get()
    ]);

    const productRows: Array<Record<string, unknown> & { id: string }> = products.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>) }));
    const lowStock = productRows.filter((item) => item.itemType !== 'service' && Number(item.stock || 0) <= Number(item.minStock || 0));
    const totalUnits = productRows.reduce((total, item) => total + (item.itemType === 'service' ? 0 : Number(item.stock || 0)), 0);

    return NextResponse.json({
      ok: true,
      tenantId: context.tenantId,
      summary: { products: productRows.length, totalUnits, lowStock: lowStock.length },
      products: productRows,
      lowStock,
      movements: movements.docs.map((item) => ({ id: item.id, ...item.data() }))
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'inventory', 'create');
    const body = await request.json();
    const productId = text(body.productId, 120);
    const movementType = body.movementType === 'receive' || body.movementType === 'remove' || body.movementType === 'set'
      ? body.movementType
      : '';
    const reason = text(body.reason) || 'Ajuste manual';
    const quantity = positiveNumber(body.quantity);
    if (!productId || !movementType || quantity <= 0) {
      return NextResponse.json({ error: 'Producto, tipo y cantidad son obligatorios.' }, { status: 400 });
    }

    const db = getAdminDb();
    const productRef = db.collection('tenants').doc(context.tenantId).collection('products').doc(productId);
    const movementRef = db.collection('tenants').doc(context.tenantId).collection('inventoryMovements').doc();
    const result = await db.runTransaction(async (transaction) => {
      const product = await transaction.get(productRef);
      if (!product.exists || product.data()?.active === false) throw new Error('PRODUCT_NOT_FOUND');
      const current = Math.max(0, Number(product.data()?.stock || 0));
      const next = movementType === 'receive' ? current + quantity : movementType === 'remove' ? current - quantity : quantity;
      if (next < 0) throw new Error('INSUFFICIENT_STOCK');
      const delta = next - current;
      transaction.update(productRef, { stock: next, updatedAt: new Date(), updatedBy: context.uid });
      transaction.set(movementRef, {
        productId,
        type: movementType,
        quantity: Math.abs(delta),
        delta,
        previousStock: current,
        newStock: next,
        reason,
        createdBy: context.uid,
        createdAt: new Date()
      });
      return { current, next, delta };
    });

    return NextResponse.json({ ok: true, productId, ...result }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'PRODUCT_NOT_FOUND') return NextResponse.json({ error: 'El producto no existe o está archivado.' }, { status: 404 });
    if (message === 'INSUFFICIENT_STOCK') return NextResponse.json({ error: 'El movimiento dejaría el inventario en negativo.' }, { status: 409 });
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
