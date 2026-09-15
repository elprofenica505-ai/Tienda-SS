import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_PAGE_SIZE, paginatedResponse, parseCursor, parsePageSize } from '@/lib/pagination';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
function text(value: unknown, max = 180) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function positiveNumber(value: unknown) { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0; }
type InventoryProduct = { id: string; name: string; sku: string; itemType: string; stock: number; reserved: number; available: number; minStock: number; active: boolean };
function responseFor(error: unknown) { const message = error instanceof Error ? error.message : ''; if (message.includes('PRODUCT_NOT_FOUND')) return NextResponse.json({ error: 'El producto no existe o está archivado.' }, { status: 404 }); if (message.includes('WAREHOUSE_NOT_FOUND')) return NextResponse.json({ error: 'El almacén no existe o está inactivo.' }, { status: 404 }); if (message.includes('INSUFFICIENT_STOCK')) return NextResponse.json({ error: 'El movimiento dejaría el inventario en negativo.' }, { status: 409 }); const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'inventory', 'view');
    const supabase = getSupabaseServer();
    const params = new URL(request.url).searchParams;
    const productsRequested = params.get('products') === 'true';
    const pageSize = parsePageSize(params.get('pageSize'), DEFAULT_PAGE_SIZE);
    const rawCursor = parseCursor(params.get('cursor'));
    let productQuery = supabase.from('products').select('*').eq('tenant_id', context.tenantId).eq('active', true).order('name').order('id').limit(pageSize + 1);
    if (rawCursor) { try { const cursor = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8')) as { name?: string; id?: string }; if (cursor.name && cursor.id) productQuery = productQuery.or(`name.gt.${cursor.name},and(name.eq.${cursor.name},id.gt.${cursor.id})`); } catch { return NextResponse.json({ error: 'Cursor de inventario inválido.' }, { status: 400 }); } }
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [movementsResult, productsResult] = await Promise.all([
      supabase.from('inventory_movements').select('id,product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,performed_by,metadata,created_at,warehouses!inner(branch_id)').eq('tenant_id', context.tenantId).gte('created_at', cutoff).order('created_at', { ascending: false }).limit(DEFAULT_PAGE_SIZE),
      productsRequested ? productQuery : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (movementsResult.error) throw new Error(movementsResult.error.message);
    if (productsResult.error) throw new Error(productsResult.error.message);
    const movementRows = (movementsResult.data || []).filter((row) => context.role === 'owner' || context.role === 'admin' || context.role === 'gerente' || context.role === 'jefe' || context.branchIds.includes(String((row as any).warehouses?.branch_id || '')));
    const movementProductIds = Array.from(new Set(movementRows.map((row: any) => String(row.product_id))));
    const movementActorIds = Array.from(new Set(movementRows.map((row: any) => String(row.performed_by || '')).filter(Boolean)));
    const [movementProducts, movementActors] = await Promise.all([
      movementProductIds.length ? supabase.from('products').select('id,name,sku').eq('tenant_id', context.tenantId).in('id', movementProductIds) : Promise.resolve({ data: [], error: null } as any),
      movementActorIds.length ? supabase.from('profiles').select('auth_user_id,display_name,email').in('auth_user_id', movementActorIds) : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (movementProducts.error) throw new Error(movementProducts.error.message);
    if (movementActors.error) throw new Error(movementActors.error.message);
    const productById = new Map<string, { name?: string; sku?: string }>((movementProducts.data || []).map((item: any) => [String(item.id), item] as [string, { name?: string; sku?: string }]));
    const actorById = new Map<string, { display_name?: string; email?: string }>((movementActors.data || []).map((item: any) => [String(item.auth_user_id), item] as [string, { display_name?: string; email?: string }]));
    const movements = movementRows.map((row: any) => ({
      id: row.id,
      productId: row.product_id,
      productName: productById.get(String(row.product_id))?.name || 'Producto archivado',
      productSku: productById.get(String(row.product_id))?.sku || '',
      warehouseId: row.warehouse_id,
      type: row.movement_type,
      quantity: Number(row.quantity || 0),
      delta: Number(row.quantity || 0),
      reason: row.metadata?.reason || row.metadata?.notes || row.reference_type || 'Movimiento de inventario',
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      unitCost: Number(row.unit_cost || 0),
      performedBy: row.performed_by,
      performedByName: actorById.get(String(row.performed_by))?.display_name || actorById.get(String(row.performed_by))?.email || row.performed_by || 'Sistema',
      performedByEmail: actorById.get(String(row.performed_by))?.email || '',
      createdAt: row.created_at,
    }));
    const productPage = (productsResult.data || []).slice(0, pageSize);
    const productIds = productPage.map((row: any) => row.id);
    const stocks = productIds.length ? await supabase.from('inventory_stocks').select('product_id, quantity, reserved_quantity, reorder_point, warehouse_id').eq('tenant_id', context.tenantId).in('product_id', productIds) : { data: [], error: null };
    if (stocks.error) throw new Error(stocks.error.message);
    const stockByProduct = new Map<string, { quantity: number; reserved: number }>();
    for (const stock of stocks.data || []) { const current = stockByProduct.get(stock.product_id) || { quantity: 0, reserved: 0 }; current.quantity += Number(stock.quantity || 0); current.reserved += Number(stock.reserved_quantity || 0); stockByProduct.set(stock.product_id, current); }
    const products: InventoryProduct[] = productPage.map((row: any) => { const stock = stockByProduct.get(row.id) || { quantity: 0, reserved: 0 }; return { id: row.id, name: row.name, sku: row.sku, itemType: row.item_type, stock: stock.quantity, reserved: stock.reserved, available: Math.max(0, stock.quantity - stock.reserved), minStock: Number(row.min_stock || 0), active: row.active }; });
    const lowStock = products.filter((item) => item.itemType !== 'service' && item.stock <= item.minStock);
    const next = (productsResult.data || []).length > pageSize ? productPage[productPage.length - 1] : null;
    const nextCursor = next ? Buffer.from(JSON.stringify({ name: next.name, id: next.id }), 'utf8').toString('base64url') : undefined;
    return NextResponse.json({ ok: true, tenantId: context.tenantId, productsLoaded: productsRequested, summary: { products: productsRequested ? products.length : null, totalUnits: productsRequested ? products.reduce((sum: number, item: InventoryProduct) => sum + (item.itemType === 'service' ? 0 : item.stock), 0) : null, lowStock: productsRequested ? lowStock.length : null }, products, lowStock, movements, productsPage: paginatedResponse(products, pageSize, nextCursor) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { return responseFor(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'inventory', 'create');
    const body = await request.json();
    const productId = text(body.productId, 120);
    const movementType = body.movementType === 'receive' || body.movementType === 'remove' || body.movementType === 'set' ? body.movementType : '';
    const reason = text(body.reason) || 'Ajuste manual';
    const quantity = positiveNumber(body.quantity);
    const supabase = getSupabaseServer();
    let warehouseId = text(body.warehouseId, 120);
    if (!productId || !movementType || quantity <= 0) return NextResponse.json({ error: 'Producto, tipo y cantidad son obligatorios.' }, { status: 400 });
    if (!warehouseId) {
      const branchId = text(request.headers.get('x-branch-id'), 120) || context.branchIds[0] || '';
      if (!branchId) throw new Error('WAREHOUSE_NOT_FOUND');
      const warehouse = await supabase.from('warehouses').select('id').eq('tenant_id', context.tenantId).eq('branch_id', branchId).eq('active', true).order('created_at').limit(1).maybeSingle();
      if (warehouse.error) throw new Error(warehouse.error.message);
      warehouseId = warehouse.data?.id || '';
    }
    if (!warehouseId) throw new Error('WAREHOUSE_NOT_FOUND');
    const result = await supabase.rpc('adjust_inventory', { target_tenant_id: context.tenantId, target_product_id: productId, target_warehouse_id: warehouseId, target_movement_type: movementType, target_quantity: quantity, target_reason: reason, target_user_id: context.uid });
    if (result.error) throw new Error(result.error.message);
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'inventory.adjusted', entity: 'product', entityId: productId, before: { stock: row?.previous_quantity }, after: { stock: row?.new_quantity, movementType, reason }, request: { requestId: request.headers.get('x-correlation-id') || undefined, method: 'POST', path: '/api/inventory' }, result: 'success' });
    return NextResponse.json({ ok: true, productId, current: row?.previous_quantity, next: row?.new_quantity, delta: row?.delta, movementId: row?.movement_id }, { status: 201 });
  } catch (error: unknown) { return responseFor(error); }
}
