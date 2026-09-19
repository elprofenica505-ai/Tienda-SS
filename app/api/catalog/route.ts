import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { DEFAULT_PAGE_SIZE, paginatedResponse, parseCursor, parsePageSize } from '@/lib/pagination';
import { requireTenantPermission, tenantErrorResponse, TenantRole } from '@/lib/tenant';
import { assertPlanCapacity } from '@/lib/entitlement-guard';
import { redactSensitiveFields } from '@/lib/data-scope';
import { resolveTenantBranchAndWarehouse } from '@/lib/organization-scope';

export const runtime = 'nodejs';
const productRoles: TenantRole[] = ['owner', 'admin', 'jefe', 'bodega'];
const categoryRoles: TenantRole[] = ['owner', 'admin', 'jefe'];
const MAX_CATEGORY_PAGE_SIZE = 100;
async function requireCatalogRead(request: NextRequest) {
  try {
    return await requireTenantPermission(request, 'catalog', 'view');
  } catch (error) {
    // El flujo de venta/preventa necesita leer productos aunque una matriz
    // personalizada no haya activado catalog.view para ese rol.
    if (error instanceof Error && (error.message === 'FORBIDDEN' || error.message.startsWith('PERMISSION_DENIED:catalog.'))) return requireTenantPermission(request, 'sales', 'create');
    throw error;
  }
}
function cleanText(value: unknown, max = 120) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function cleanNumber(value: unknown, fallback = 0) { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function mapCategory(row: Record<string, any>) { return { id: row.id, name: row.name, color: row.color || '#c7f57b', active: row.active, createdAt: row.created_at, updatedAt: row.updated_at }; }
function mapProduct(row: Record<string, any>, stock = 0) { const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}; return { id: row.id, name: row.name, sku: row.sku, itemType: row.item_type, categoryId: row.category_id || '', price: Number(row.price || 0), taxRate: Number(row.tax_rate || 0), cost: Number(row.cost || 0), stock, minStock: Number(row.min_stock || 0), unit: row.unit, location: typeof metadata.location === 'string' ? metadata.location : '', imageUrl: typeof metadata.imageUrl === 'string' ? metadata.imageUrl : null, barcode: typeof row.barcode === 'string' && row.barcode ? row.barcode : (typeof metadata.barcode === 'string' ? metadata.barcode : row.sku), active: row.active, createdAt: row.created_at, updatedAt: row.updated_at }; }
function responseFor(error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
async function saveProductImage(supabase: ReturnType<typeof getSupabaseServer>, tenantId: string, productId: string, imageDataUrl: unknown) {
  if (typeof imageDataUrl !== 'string' || !imageDataUrl) return null;
  const match = imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error('PRODUCT_IMAGE_INVALID');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 950 * 1024) throw new Error('PRODUCT_IMAGE_TOO_LARGE');
  const extension = match[1].split('/')[1].toLowerCase().replace('jpeg', 'jpg');
  const path = `${tenantId}/${productId}.${extension}`;
  const upload = await supabase.storage.from('product-images').upload(path, buffer, { contentType: match[1], upsert: true, cacheControl: '31536000' });
  if (upload.error) throw new Error(upload.error.message);
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireCatalogRead(request);
    const supabase = getSupabaseServer();
    const params = new URL(request.url).searchParams;
    const requestedBranchId = request.headers.get('x-branch-id')?.trim() || '';
    const resolvedScope = requestedBranchId ? await resolveTenantBranchAndWarehouse(context.tenantId, requestedBranchId) : { branchId: '', warehouseId: '' };
    if (requestedBranchId && !resolvedScope.branchId) throw new Error('BRANCH_NOT_FOUND');
    const includeArchived = params.get('includeArchived') === 'true';
    const pageSize = Math.min(25, parsePageSize(params.get('pageSize'), DEFAULT_PAGE_SIZE));
    const rawCursor = parseCursor(params.get('cursor'));
    let query = supabase.from('products').select('id,tenant_id,category_id,sku,name,item_type,price,tax_rate,cost,min_stock,unit,metadata,barcode,active,created_at,updated_at').eq('tenant_id', context.tenantId).order('name').order('id').limit(pageSize + 1);
    if (!includeArchived) query = query.eq('active', true);
    if (rawCursor) {
      try {
        const cursor = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8')) as { name?: string; id?: string };
        if (cursor.name && cursor.id) query = query.or(`name.gt.${cursor.name},and(name.eq.${cursor.name},id.gt.${cursor.id})`);
      } catch { return NextResponse.json({ error: 'Cursor de catálogo inválido.' }, { status: 400 }); }
    }
    const [categoriesResult, productsResult] = await Promise.all([
      supabase.from('categories').select('id,tenant_id,name,color,active,created_at,updated_at').eq('tenant_id', context.tenantId).order('name').limit(MAX_CATEGORY_PAGE_SIZE),
      query,
    ]);
    if (categoriesResult.error) throw new Error(categoriesResult.error.message);
    if (productsResult.error) throw new Error(productsResult.error.message);
    const products = productsResult.data || [];
    const hasMore = products.length > pageSize;
    const page = products.slice(0, pageSize);
    const ids = page.map((item) => item.id);
    const stocks = ids.length && resolvedScope.warehouseId ? await supabase.from('inventory_stocks').select('product_id, quantity').eq('tenant_id', context.tenantId).eq('warehouse_id', resolvedScope.warehouseId).in('product_id', ids) : { data: [], error: null };
    if (stocks.error) throw new Error(stocks.error.message);
    const stockByProduct = new Map<string, number>();
    for (const item of stocks.data || []) stockByProduct.set(item.product_id, (stockByProduct.get(item.product_id) || 0) + Number(item.quantity || 0));
    const mapped = page.map((item) => mapProduct(item, stockByProduct.get(item.id) || 0));
    const next = hasMore ? page[page.length - 1] : null;
    const nextCursor = next ? Buffer.from(JSON.stringify({ name: next.name, id: next.id }), 'utf8').toString('base64url') : undefined;
    return NextResponse.json({ ok: true, tenantId: context.tenantId, categories: (categoriesResult.data || []).filter((item) => includeArchived || item.active !== false).map(mapCategory), products: mapped.map((item) => redactSensitiveFields(item, context)), pagination: { pageSize, hasMore, nextCursor: nextCursor || null }, productsPage: paginatedResponse(mapped, pageSize, nextCursor) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { return responseFor(error); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const type = body.type === 'category' ? 'category' : body.type === 'product' ? 'product' : '';
    const context = await requireTenantPermission(request, 'catalog', 'create');
    const supabase = getSupabaseServer();
    if (type === 'category') {
      if (!categoryRoles.includes(context.role)) return NextResponse.json({ error: 'No tienes permiso para crear categorías.' }, { status: 403 });
      const name = cleanText(body.name);
      if (name.length < 2) return NextResponse.json({ error: 'El nombre de la categoría es obligatorio.' }, { status: 400 });
      const duplicate = await supabase.from('categories').select('id').eq('tenant_id', context.tenantId).ilike('name', name).maybeSingle();
      if (duplicate.error) throw new Error(duplicate.error.message);
      if (duplicate.data) return NextResponse.json({ error: 'Ya existe una categoría con ese nombre.' }, { status: 409 });
      const result = await supabase.from('categories').insert({ tenant_id: context.tenantId, name, color: cleanText(body.color, 20) || '#c7f57b', active: true, created_by: context.uid }).select('id,tenant_id,name,color,active,created_at,updated_at').single();
      if (result.error) throw new Error(result.error.message);
      return NextResponse.json({ ok: true, item: mapCategory(result.data) }, { status: 201 });
    }
    if (!productRoles.includes(context.role)) return NextResponse.json({ error: 'No tienes permiso para crear productos.' }, { status: 403 });
    const name = cleanText(body.name);
    const sku = cleanText(body.sku, 50).toUpperCase();
    const barcode = cleanText(body.barcode, 32).toUpperCase();
    const itemType = body.itemType === 'service' ? 'service' : 'physical';
    if (name.length < 2) return NextResponse.json({ error: 'El nombre del producto es obligatorio.' }, { status: 400 });
    if (itemType === 'physical' && !sku) return NextResponse.json({ error: 'Los productos físicos necesitan SKU.' }, { status: 400 });
    if (barcode) { const duplicateBarcode = await supabase.from('products').select('id').eq('tenant_id', context.tenantId).eq('barcode', barcode).maybeSingle(); if (duplicateBarcode.error) throw new Error(duplicateBarcode.error.message); if (duplicateBarcode.data) return NextResponse.json({ error: 'Ya existe un producto con ese código de barras.' }, { status: 409 }); }
    if (sku) { const duplicate = await supabase.from('products').select('id').eq('tenant_id', context.tenantId).eq('sku', sku).maybeSingle(); if (duplicate.error) throw new Error(duplicate.error.message); if (duplicate.data) return NextResponse.json({ error: 'Ya existe un producto con ese SKU.' }, { status: 409 }); }
    const tenant = await supabase.from('tenants').select('plan').eq('id', context.tenantId).single();
    if (tenant.error) throw new Error(tenant.error.message);
    const active = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).eq('active', true);
    if (active.error) throw new Error(active.error.message);
    try { assertPlanCapacity(tenant.data.plan, 'products', active.count || 0, 1); } catch (error) { return responseFor(error); }
    const categoryId = cleanText(body.categoryId, 80) || null;
    const initialStock = itemType === 'service' ? 0 : Math.max(0, Math.floor(cleanNumber(body.stock)));
    const result = await supabase.from('products').insert({ tenant_id: context.tenantId, category_id: categoryId, sku: sku || `SERV-${Date.now()}`, barcode: barcode || null, name, item_type: itemType, price: Math.max(0, cleanNumber(body.price)), cost: productRoles.slice(0, 4).includes(context.role) ? Math.max(0, cleanNumber(body.cost)) : 0, min_stock: itemType === 'service' ? 0 : Math.max(0, cleanNumber(body.minStock, 5)), unit: cleanText(body.unit, 20) || 'unidad', active: true, created_by: context.uid }).select('id,tenant_id,category_id,sku,barcode,name,item_type,price,cost,min_stock,unit,active,created_at,updated_at').single();
    if (result.error) throw new Error(result.error.message);
    const imageUrl = await saveProductImage(supabase, context.tenantId, result.data.id, body.imageDataUrl);
    if (imageUrl) { const imageUpdate = await supabase.from('products').update({ metadata: { imageUrl }, updated_at: new Date().toISOString() }).eq('tenant_id', context.tenantId).eq('id', result.data.id); if (imageUpdate.error) throw new Error(imageUpdate.error.message); }
    if (itemType === 'physical') {
      const warehouse = await supabase.from('warehouses').select('id').eq('tenant_id', context.tenantId).eq('active', true).order('created_at').limit(1).maybeSingle();
      if (warehouse.error || !warehouse.data) throw new Error(warehouse.error?.message || 'No hay un almacén activo para guardar el stock.');
      const stock = await supabase.from('inventory_stocks').upsert({ tenant_id: context.tenantId, product_id: result.data.id, warehouse_id: warehouse.data.id, quantity: initialStock, reorder_point: Math.max(0, Math.floor(cleanNumber(body.minStock, 5))), updated_at: new Date().toISOString() }, { onConflict: 'tenant_id,product_id,warehouse_id' });
      if (stock.error) throw new Error(stock.error.message);
    }
    return NextResponse.json({ ok: true, item: redactSensitiveFields(mapProduct({ ...result.data, metadata: imageUrl ? { imageUrl } : {} }, initialStock), context) }, { status: 201 });
  } catch (error: unknown) { if (error instanceof Error && error.message === 'PRODUCT_IMAGE_INVALID') return NextResponse.json({ error: 'La imagen debe ser JPG, PNG o WebP.' }, { status: 400 }); if (error instanceof Error && error.message === 'PRODUCT_IMAGE_TOO_LARGE') return NextResponse.json({ error: 'La imagen comprimida todavía supera 1 MB. Elige una foto más pequeña.' }, { status: 400 }); return responseFor(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const type = body.type === 'category' ? 'category' : body.type === 'product' ? 'product' : '';
    const context = await requireTenantPermission(request, 'catalog', 'edit');
    const id = cleanText(body.id, 120);
    if (!type || !id) return NextResponse.json({ error: 'Tipo o identificador inválido.' }, { status: 400 });
    const supabase = getSupabaseServer();
    const table = type === 'category' ? 'categories' : 'products';
    const current = await supabase.from(table).select(type === 'product' ? 'id,tenant_id,category_id,sku,barcode,name,item_type,price,cost,min_stock,unit,active,created_at,updated_at' : 'id,tenant_id,name,color,active,created_at,updated_at').eq('tenant_id', context.tenantId).eq('id', id).maybeSingle();
    if (current.error) throw new Error(current.error.message);
    if (!current.data) return NextResponse.json({ error: 'El registro no existe en este tenant.' }, { status: 404 });
    const changes: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: context.uid };
    if (typeof body.active === 'boolean') changes.active = body.active;
    if (type === 'category') { if (typeof body.name === 'string' && cleanText(body.name).length >= 2) changes.name = cleanText(body.name); if (typeof body.color === 'string') changes.color = cleanText(body.color, 20); }
    if (type === 'product') { if (typeof body.name === 'string' && cleanText(body.name).length >= 2) changes.name = cleanText(body.name); if (typeof body.barcode === 'string') changes.barcode = cleanText(body.barcode, 32).toUpperCase() || null; if (typeof body.price === 'number') changes.price = Math.max(0, body.price); if (typeof body.cost === 'number') changes.cost = Math.max(0, body.cost); if (typeof body.minStock === 'number') changes.min_stock = Math.max(0, body.minStock); if (typeof body.categoryId === 'string') changes.category_id = cleanText(body.categoryId, 80) || null; }
    const updated = await supabase.from(table).update(changes).eq('tenant_id', context.tenantId).eq('id', id).select(type === 'product' ? 'id,tenant_id,category_id,sku,barcode,name,item_type,price,cost,min_stock,unit,active,created_at,updated_at' : 'id,tenant_id,name,color,active,created_at,updated_at').single();
    if (updated.error) throw new Error(updated.error.message);
    return NextResponse.json({ ok: true, id, changes, item: type === 'product' ? mapProduct(updated.data, 0) : mapCategory(updated.data) });
  } catch (error: unknown) { return responseFor(error); }
}
