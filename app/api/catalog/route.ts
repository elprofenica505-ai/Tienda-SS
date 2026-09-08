import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse, TenantRole } from '@/lib/tenant';
import { assertPlanCapacity } from '@/lib/entitlement-guard';
import { redactSensitiveFields } from '@/lib/data-scope';

export const runtime = 'nodejs';

const productRoles: TenantRole[] = ['owner', 'admin', 'jefe', 'bodega'];
const categoryRoles: TenantRole[] = ['owner', 'admin', 'jefe'];
const MAX_PAGE_SIZE = 25;
const MAX_CATEGORY_PAGE_SIZE = 100;

function cleanText(value: unknown, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'catalog', 'view');
    const db = getAdminDb();
    const tenant = db.collection('tenants').doc(context.tenantId);
    const params = new URL(request.url).searchParams;
    const includeArchived = params.get('includeArchived') === 'true';
    const requestedPageSize = Number(params.get('pageSize') || MAX_PAGE_SIZE);
    const pageSize = Number.isFinite(requestedPageSize)
      ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(requestedPageSize)))
      : MAX_PAGE_SIZE;
    const cursor = params.get('cursor')?.trim() || '';
    let productQuery = (includeArchived
      ? tenant.collection('products')
      : tenant.collection('products').where('active', '==', true))
      .orderBy('name').limit(pageSize + 1);
    if (cursor) {
      const cursorDoc = await tenant.collection('products').doc(cursor).get();
      if (cursorDoc.exists) productQuery = productQuery.startAfter(cursorDoc);
    }
    const [categorySnapshot, productSnapshot] = await Promise.all([
      tenant.collection('categories').orderBy('name').limit(MAX_CATEGORY_PAGE_SIZE).get(),
      productQuery.get()
    ]);
    const categories = includeArchived ? categorySnapshot : { docs: categorySnapshot.docs.filter((item) => item.data().active !== false) };
    const visibleProductDocs = productSnapshot.docs;
    const hasMore = visibleProductDocs.length > pageSize;
    const products = visibleProductDocs.slice(0, pageSize);

    return NextResponse.json({
      ok: true,
      tenantId: context.tenantId,
      categories: categories.docs.map((item) => ({ id: item.id, ...item.data() })),
      products: products.map((item) => ({ id: item.id, ...redactSensitiveFields(item.data() as Record<string, unknown>, context) })),
      pagination: { pageSize, hasMore, nextCursor: hasMore ? products[products.length - 1]?.id || null : null }
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
    const context = await requireTenantPermission(request, 'catalog', 'create');
    const db = getAdminDb();
    const tenantRef = db.collection('tenants').doc(context.tenantId);
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
    const tenantSnapshot = await tenantRef.get();
    const activeProducts = await tenantRef.collection('products').where('active', '==', true).count().get();
    const plan = tenantSnapshot.data()?.plan;
    try { assertPlanCapacity(plan, 'products', activeProducts.data().count, 1); } catch (error) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
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
      cost: context.role === 'owner' || context.role === 'admin' || context.role === 'gerente' || context.role === 'jefe'
        ? Math.max(0, cleanNumber(body.cost))
        : 0,
      stock: itemType === 'service' ? 0 : Math.max(0, cleanNumber(body.stock)),
      minStock: itemType === 'service' ? 0 : Math.max(0, cleanNumber(body.minStock, 5)),
      unit: cleanText(body.unit, 20) || 'unidad',
      active: true, createdBy: context.uid, createdAt: now, updatedAt: now
    };
    await ref.set(product);
    return NextResponse.json({ ok: true, item: { id: ref.id, ...redactSensitiveFields(product, context) } }, { status: 201 });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const type = body.type === 'category' ? 'category' : body.type === 'product' ? 'product' : '';
    const context = await requireTenantPermission(request, 'catalog', 'edit');
    const id = cleanText(body.id, 120);
    if (!type || !id) return NextResponse.json({ error: 'Tipo o identificador inválido.' }, { status: 400 });

    const ref = getAdminDb().collection('tenants').doc(context.tenantId).collection(type === 'category' ? 'categories' : 'products').doc(id);
    const current = await ref.get();
    if (!current.exists) return NextResponse.json({ error: 'El registro no existe en este tenant.' }, { status: 404 });

    const changes: Record<string, unknown> = { updatedAt: new Date(), updatedBy: context.uid };
    if (typeof body.active === 'boolean') changes.active = body.active;
    if (type === 'category' && typeof body.name === 'string' && cleanText(body.name).length >= 2) changes.name = cleanText(body.name);
    if (type === 'product') {
      if (body.active === true && current.data()?.active === false) {
        const tenantSnapshot = await getAdminDb().collection('tenants').doc(context.tenantId).get();
        const activeProducts = await getAdminDb().collection('tenants').doc(context.tenantId).collection('products').where('active', '==', true).count().get();
        const plan = tenantSnapshot.data()?.plan;
        try { assertPlanCapacity(plan, 'products', activeProducts.data().count, 1); } catch (error) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
      }
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
