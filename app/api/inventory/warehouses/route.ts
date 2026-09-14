import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
const MANAGERS = new Set(['owner', 'admin', 'gerente', 'jefe']);
function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function errorResponse(error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }

async function contextFor(request: NextRequest, action: 'view' | 'create' | 'edit') {
  const context = await requireTenantPermission(request, 'inventory', action);
  const branchId = text(request.headers.get('x-branch-id'), 128) || context.branchIds[0] || '';
  if (!branchId) throw new Error('BRANCH_REQUIRED');
  assertBranchAccess(context, branchId);
  return { context, branchId };
}

export async function GET(request: NextRequest) {
  try {
    const { context, branchId } = await contextFor(request, 'view');
    const warehouseId = text(new URL(request.url).searchParams.get('warehouseId'), 128);
    const supabase = getSupabaseServer();
    const warehousesResult = await supabase.from('warehouses').select('id,tenant_id,branch_id,code,name,active').eq('tenant_id', context.tenantId).eq('branch_id', branchId).eq('active', true).order('name').limit(100);
    if (warehousesResult.error) throw new Error(warehousesResult.error.message);
    const warehouses = warehousesResult.data || [];
    if (warehouseId && !warehouses.some((row) => row.id === warehouseId)) return NextResponse.json({ error: 'El almacén no está autorizado para este usuario.' }, { status: 403 });
    const stockResult = warehouseId ? await supabase.from('inventory_stocks').select('id,warehouse_id,product_id,quantity,reorder_point,updated_at,products(id,name,sku,price,cost,item_type,active)').eq('tenant_id', context.tenantId).eq('warehouse_id', warehouseId).limit(500) : { data: [], error: null };
    if (stockResult.error) throw new Error(stockResult.error.message);
    const stocks = (stockResult.data || []).map((row: any) => ({ id: row.id, warehouseId: row.warehouse_id, productId: row.product_id, quantity: Number(row.quantity || 0), averageCost: Number(row.products?.cost || 0), reorderPoint: Number(row.reorder_point || 0), updatedAt: row.updated_at }));
    return NextResponse.json({ ok: true, warehouses: warehouses.map((row) => ({ id: row.id, branchId: row.branch_id, code: row.code, name: row.name, active: row.active })), stocks, transfers: [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = text(body.action, 30);
    const permission = action === 'approve-count' ? 'edit' : 'create';
    const { context, branchId } = await contextFor(request, permission);
    const supabase = getSupabaseServer();
    if (action === 'receive' || action === 'count') {
      const warehouseId = text(body.warehouseId, 128);
      const productId = text(body.productId, 128);
      const rawValue = action === 'count' ? body.countedQuantity : body.quantity;
      const targetQuantity = typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue >= 0 ? Math.round(rawValue * 10000) / 10000 : -1;
      const reason = text(body.reason, 300) || (action === 'count' ? 'Conteo físico' : 'Recepción de inventario');
      if (!warehouseId || !productId || targetQuantity < 0 || (action === 'receive' && targetQuantity <= 0)) return NextResponse.json({ error: 'Almacén, producto y cantidad son obligatorios.' }, { status: 400 });
      const warehouse = await supabase.from('warehouses').select('id').eq('tenant_id', context.tenantId).eq('id', warehouseId).eq('branch_id', branchId).eq('active', true).maybeSingle();
      if (warehouse.error) throw new Error(warehouse.error.message);
      if (!warehouse.data) return NextResponse.json({ error: 'El almacén no pertenece a la sucursal activa.' }, { status: 404 });
      const result = await supabase.rpc('adjust_inventory', { target_tenant_id: context.tenantId, target_product_id: productId, target_warehouse_id: warehouseId, target_movement_type: action === 'count' ? 'set' : 'receive', target_quantity: targetQuantity, target_reason: reason, target_user_id: context.uid });
      if (result.error) throw new Error(result.error.message);
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: `inventory.${action}`, entity: 'product', entityId: productId, before: { stock: row?.previous_quantity }, after: { stock: row?.new_quantity, reason }, result: 'success' });
      return NextResponse.json({ ok: true, status: 'completed', current: row?.previous_quantity, next: row?.new_quantity, difference: row?.delta, movementId: row?.movement_id }, { status: 201 });
    }
    if (['create-transfer', 'approve-transfer', 'dispatch-transfer', 'receive-transfer', 'cancel-transfer', 'transfer', 'approve-count'].includes(action)) return NextResponse.json({ error: 'Las transferencias entre almacenes aún no están habilitadas en Supabase; no se ejecutó ninguna operación.' }, { status: 409 });
    return NextResponse.json({ error: 'Operación de inventario no reconocida.' }, { status: 400 });
  } catch (error: unknown) { return errorResponse(error); }
}
