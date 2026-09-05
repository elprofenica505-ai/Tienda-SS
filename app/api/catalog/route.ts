import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantMember, tenantErrorResponse, TenantRole } from '@/lib/tenant';

export const runtime = 'nodejs';

const productRoles: TenantRole[] = ['owner', 'admin', 'jefe', 'bodega'];
const categoryRoles: TenantRole[] = ['owner', 'admin', 'jefe'];

function cleanText(value: unknown, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantMember(request);
    const db = getAdminDb();
    const tenant = db.collection('tenants').doc(context.tenantId);
    const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
    const [categorySnapshot, productSnapshot] = await Promise.all([
      tenant.collection('categories').orderBy('name').get(),
      tenant.collection('products').orderBy('name').get()
    ]);
    const categories = includeArchived ? categorySnapshot : { docs: categorySnapshot.docs.filter((item) => item.data().active !== false) };
    const products = includeArchived ? productSnapshot : { docs: productSnapshot.docs.filter((item) => item.data().active !== false) };

    return NextResponse.json({
      ok: true,
      tenantId: context.tenantId,
      categories: categories.docs.map((item) => ({ id: item.id, ...item.data() })),
      products: products.docs.map((item) => ({ id: item.id, ...item.data() }))
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const type = body.type === 'category' ? 'category' : body.type === 'product' ? 'product' : '';
    const context = await requireTenantMember(request, type === 'category' ? categoryRoles : productRoles);
    const db = getAdminDb();
    const now = new Date();

    if (type === 'category') {
      const name = cleanText(body.name);
      if (name.length < 2) return NextResponse.json({ error: 'El nombre de la categoría es obligatorio.' }, { status: 400 });
      const duplicate = await db.collection('tenants').doc(context.tenantId).collection('categories').where('name', '==', name).limit(1).get();
      if (!duplicate.empty) return NextResponse.json({ error: 'Ya existe una categoría con ese nombre.' }, { status: 409 });
      const ref = db.collection('tenants').doc(context.tenantId).collection('categories').doc();
      await ref.set({ name, color: cleanText(body.color, 20) || '#c7f57b', active: true, createdBy: context.uid, createdAt: now, updatedAt: now });
      return NextResponse.json({ ok: true, item: { id: ref.id, name, color: cleanText(body.color, 20) || '#c7f57b', active: true } }, { status: 201 });
    }

    const name = cleanText(body.name);
    const sku = cleanText(body.sku, 50).toUpperCase();
    const categoryId = cleanText(body.categoryId, 80);
    const itemType = body.itemType === 'service' ? 'service' : 'physical';
    if (name.length < 2) return NextResponse.json({ error: 'El nombre del producto es obligatorio.' }, { status: 400 });
    if (itemType === 'physical' && !sku) return NextResponse.json({ error: 'Los productos físicos necesitan SKU.' }, { status: 400 });
    if (sku) {
      const duplicate = await db.collection('tenants').doc(context.tenantId).collection('products').where('sku', '==', sku).limit(1).get();
      if (!duplicate.empty) return NextResponse.json({ error: 'Ya existe un producto con ese SKU.' }, { status: 409 });
    }

    const ref = db.collection('tenants').doc(context.tenantId).collection('products').doc();
    const product = {
      name, sku, itemType, categoryId,
      price: Math.max(0, cleanNumber(body.price)),
      cost: Math.max(0, cleanNumber(body.cost)),
      stock: itemType === 'service' ? 0 : Math.max(0, cleanNumber(body.stock)),
      minStock: itemType === 'service' ? 0 : Math.max(0, cleanNumber(body.minStock, 5)),
      unit: cleanText(body.unit, 20) || 'unidad',
      active: true, createdBy: context.uid, createdAt: now, updatedAt: now
    };
    await ref.set(product);
    return NextResponse.json({ ok: true, item: { id: ref.id, ...product } }, { status: 201 });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const type = body.type === 'category' ? 'category' : body.type === 'product' ? 'product' : '';
    const context = await requireTenantMember(request, type === 'category' ? categoryRoles : productRoles);
    const id = cleanText(body.id, 120);
    if (!type || !id) return NextResponse.json({ error: 'Tipo o identificador inválido.' }, { status: 400 });

    const ref = getAdminDb().collection('tenants').doc(context.tenantId).collection(type === 'category' ? 'categories' : 'products').doc(id);
    const current = await ref.get();
    if (!current.exists) return NextResponse.json({ error: 'El registro no existe en este tenant.' }, { status: 404 });

    const changes: Record<string, unknown> = { updatedAt: new Date(), updatedBy: context.uid };
    if (typeof body.active === 'boolean') changes.active = body.active;
    if (type === 'category' && typeof body.name === 'string' && cleanText(body.name).length >= 2) changes.name = cleanText(body.name);
    if (type === 'product') {
      if (typeof body.name === 'string' && cleanText(body.name).length >= 2) changes.name = cleanText(body.name);
      if (typeof body.price === 'number') changes.price = Math.max(0, body.price);
      if (typeof body.stock === 'number') changes.stock = Math.max(0, body.stock);
      if (typeof body.categoryId === 'string') changes.categoryId = cleanText(body.categoryId, 80);
    }

    await ref.update(changes);
    return NextResponse.json({ ok: true, id, changes });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
