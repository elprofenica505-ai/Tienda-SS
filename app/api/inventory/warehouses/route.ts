import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse, type TenantContext } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';
import { parseReceiptItems, parseTransferItems, transferErrorResponse, transferTotals } from '@/lib/inventory-transfers';

export const runtime = 'nodejs';
const MANAGERS = new Set(['owner', 'admin', 'gerente', 'jefe']);
const TRANSFER_COLUMNS = 'id,transfer_number,status,origin_branch_id,origin_warehouse_id,destination_branch_id,destination_warehouse_id,reason,created_by,created_at,updated_at';
const TRANSFER_ITEM_COLUMNS = 'id,transfer_id,product_id,requested_quantity,shipped_quantity,received_quantity,unit_cost';
/** Acción de la API -> RPC de la Fase 1A que la ejecuta de forma atómica. */
const TRANSFER_ACTIONS: Record<string, 'create_stock_transfer' | 'approve_stock_transfer' | 'dispatch_stock_transfer' | 'receive_stock_transfer' | 'cancel_stock_transfer'> = {
  'create-transfer': 'create_stock_transfer',
  'transfer': 'create_stock_transfer',
  'approve-transfer': 'approve_stock_transfer',
  'dispatch-transfer': 'dispatch_stock_transfer',
  'receive-transfer': 'receive_stock_transfer',
  'cancel-transfer': 'cancel_stock_transfer',
};
const TRANSFER_AUDIT_ACTIONS: Record<string, string> = {
  create_stock_transfer: 'inventory.transfer_created',
  approve_stock_transfer: 'inventory.transfer_approved',
  dispatch_stock_transfer: 'inventory.transfer_dispatched',
  receive_stock_transfer: 'inventory.transfer_received',
  cancel_stock_transfer: 'inventory.transfer_cancelled',
};

type TransferRow = Record<string, unknown> & { id: string; transfer_number: string; status: string; origin_branch_id: string; origin_warehouse_id: string; destination_branch_id: string; destination_warehouse_id: string; reason: string; created_at: string };
type TransferItemRow = Record<string, unknown> & { id: string; transfer_id: string; product_id: string; requested_quantity: number | string; shipped_quantity: number | string; received_quantity: number | string; unit_cost: number | string };
type StockRow = Record<string, unknown> & { id: string; warehouse_id: string; product_id: string; quantity: number | string; reserved_quantity: number | string; in_transit_quantity: number | string; reorder_point: number | string; average_cost: number | string; updated_at: string; products?: { cost?: number | string } | null };
type ProductNameRow = { id: string; name?: string; sku?: string };

function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function units(value: unknown) { return Number(value || 0); }
function errorResponse(error: unknown) {
  const transferError = transferErrorResponse(error);
  if (transferError) return NextResponse.json(transferError.body, { status: transferError.status });
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}

async function resolveBranchDbId(tenantId: string, branchId: string) {
  const supabase = getSupabaseServer();
  const byId = await supabase.from('branches').select('id').eq('tenant_id', tenantId).eq('active', true).eq('id', branchId).maybeSingle();
  if (byId.error) throw new Error(byId.error.message);
  if (byId.data) return byId.data.id;
  const byLegacyId = await supabase.from('branches').select('id').eq('tenant_id', tenantId).eq('active', true).eq('legacy_firestore_id', branchId).maybeSingle();
  if (byLegacyId.error) throw new Error(byLegacyId.error.message);
  if (!byLegacyId.data) throw new Error('BRANCH_NOT_FOUND');
  return byLegacyId.data.id;
}

async function contextFor(request: NextRequest, action: 'view' | 'create' | 'edit') {
  const context = await requireTenantPermission(request, 'inventory', action);
  const branchId = text(request.headers.get('x-branch-id'), 128) || context.branchIds[0] || '';
  if (!branchId) throw new Error('BRANCH_REQUIRED');
  assertBranchAccess(context, branchId);
  const dbBranchId = await resolveBranchDbId(context.tenantId, branchId);
  return { context, branchId, dbBranchId };
}

/** `context.branchIds` usa el id heredado de Firestore cuando existe; aquí se traduce el uuid de la base. */
async function branchClientIds(tenantId: string, dbBranchIds: readonly string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(dbBranchIds.filter(Boolean)));
  if (!ids.length) return new Map();
  const result = await getSupabaseServer().from('branches').select('id,legacy_firestore_id').eq('tenant_id', tenantId).in('id', ids);
  if (result.error) throw new Error(result.error.message);
  return new Map((result.data || []).map((row) => [String(row.id), String(row.legacy_firestore_id || row.id)]));
}

/** La sucursal activa debe estar involucrada y el usuario debe tener acceso a ambos extremos. */
function assertTransferBranchScope(context: TenantContext, dbBranchId: string, transferDbBranchIds: readonly string[], branchNames: Map<string, string>) {
  for (const transferDbBranchId of transferDbBranchIds) {
    assertBranchAccess(context, branchNames.get(String(transferDbBranchId)) || String(transferDbBranchId));
  }
  // Los roles administrativos ya pasaron assertBranchAccess; el encabezado x-branch-id viene del selector de sucursal y no debe bloquearlos.
  if (MANAGERS.has(context.role)) return;
  if (!transferDbBranchIds.some((value) => String(value) === String(dbBranchId))) throw new Error('BRANCH_OUT_OF_SCOPE');
}

/** Resuelve un almacén por uuid o por id heredado, verifica que esté activo y que pertenezca a una sucursal autorizada. */
async function resolveTransferWarehouse(context: TenantContext, reference: string, notFoundCode: 'ORIGIN_WAREHOUSE_NOT_FOUND' | 'DESTINATION_WAREHOUSE_NOT_FOUND') {
  if (!reference) throw new Error('WAREHOUSE_REQUIRED');
  const supabase = getSupabaseServer();
  const byId = await supabase.from('warehouses').select('id,branch_id,legacy_firestore_id,active').eq('tenant_id', context.tenantId).eq('id', reference).maybeSingle();
  if (byId.error) throw new Error(byId.error.message);
  let row = byId.data as { id: string; branch_id: string; legacy_firestore_id?: string | null; active?: boolean } | null;
  if (!row) {
    const byLegacyId = await supabase.from('warehouses').select('id,branch_id,legacy_firestore_id,active').eq('tenant_id', context.tenantId).eq('legacy_firestore_id', reference).maybeSingle();
    if (byLegacyId.error) throw new Error(byLegacyId.error.message);
    row = byLegacyId.data as { id: string; branch_id: string; legacy_firestore_id?: string | null; active?: boolean } | null;
  }
  if (!row || row.active === false) throw new Error(notFoundCode);
  const branchNames = await branchClientIds(context.tenantId, [String(row.branch_id)]);
  assertBranchAccess(context, branchNames.get(String(row.branch_id)) || String(row.branch_id));
  return { warehouseId: String(row.id), branchId: String(row.branch_id) };
}

async function readTransfer(context: TenantContext, transferId: string) {
  const result = await getSupabaseServer().from('stock_transfers').select(TRANSFER_COLUMNS).eq('tenant_id', context.tenantId).eq('id', transferId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error('TRANSFER_NOT_FOUND');
  return result.data as TransferRow;
}

function audit(request: NextRequest, context: TenantContext, action: string, entityId: string, after: Record<string, unknown>) {
  return writeImmutableAudit({
    tenantId: context.tenantId,
    actor: context,
    action,
    entity: 'stock_transfer',
    entityId,
    after,
    request: { requestId: request.headers.get('x-correlation-id') || undefined, method: 'POST', path: '/api/inventory/warehouses' },
    result: 'success',
  });
}

export async function GET(request: NextRequest) {
  try {
    const { context, dbBranchId } = await contextFor(request, 'view');
    const warehouseId = text(new URL(request.url).searchParams.get('warehouseId'), 128);
    const supabase = getSupabaseServer();
    const warehousesResult = await supabase.from('warehouses').select('id,tenant_id,branch_id,code,name,active').eq('tenant_id', context.tenantId).eq('branch_id', dbBranchId).eq('active', true).order('name').limit(100);
    if (warehousesResult.error) throw new Error(warehousesResult.error.message);
    const warehouses = warehousesResult.data || [];
    if (warehouseId && !warehouses.some((row) => row.id === warehouseId)) return NextResponse.json({ error: 'El almacén no está autorizado para este usuario.' }, { status: 403 });
    const warehouseIds: string[] = (warehouseId ? warehouses.filter((row) => row.id === warehouseId) : warehouses).map((row) => String(row.id));
    const stockResult = warehouseId ? await supabase.from('inventory_stocks').select('id,warehouse_id,product_id,quantity,reserved_quantity,in_transit_quantity,reorder_point,average_cost,updated_at,products(id,name,sku,price,cost,item_type,active)').eq('tenant_id', context.tenantId).eq('warehouse_id', warehouseId).limit(500) : { data: [], error: null };
    if (stockResult.error) throw new Error(stockResult.error.message);
    const stocks = ((stockResult.data || []) as StockRow[]).map((row) => {
      const quantity = units(row.quantity);
      const reserved = units(row.reserved_quantity);
      return {
        id: row.id,
        warehouseId: row.warehouse_id,
        productId: row.product_id,
        quantity,
        reservedQuantity: reserved,
        inTransitQuantity: units(row.in_transit_quantity),
        available: Math.max(0, quantity - reserved),
        averageCost: units(row.average_cost) || Number(row.products?.cost || 0),
        reorderPoint: units(row.reorder_point),
        updatedAt: row.updated_at,
      };
    });
    const transferQuery = (column: 'origin_warehouse_id' | 'destination_warehouse_id') => supabase.from('stock_transfers').select(TRANSFER_COLUMNS).eq('tenant_id', context.tenantId).in(column, warehouseIds).order('created_at', { ascending: false }).limit(100);
    const [originTransfers, destinationTransfers] = warehouseIds.length ? await Promise.all([transferQuery('origin_warehouse_id'), transferQuery('destination_warehouse_id')]) : [null, null];
    if (originTransfers?.error) throw new Error(originTransfers.error.message);
    if (destinationTransfers?.error) throw new Error(destinationTransfers.error.message);
    const transferRows = Array.from(new Map<string, TransferRow>([...(originTransfers?.data || []), ...(destinationTransfers?.data || [])].map((row) => [String(row.id), row as TransferRow])).values())
      .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
      .slice(0, 100);
    const transferIds = transferRows.map((row) => row.id);
    const itemsResult = transferIds.length ? await supabase.from('stock_transfer_items').select(TRANSFER_ITEM_COLUMNS).eq('tenant_id', context.tenantId).in('transfer_id', transferIds).limit(500) : { data: [], error: null };
    if (itemsResult.error) throw new Error(itemsResult.error.message);
    const itemRows = (itemsResult.data || []) as TransferItemRow[];
    const productIds = Array.from(new Set(itemRows.map((row) => String(row.product_id))));
    const productsResult = productIds.length ? await supabase.from('products').select('id,name,sku').eq('tenant_id', context.tenantId).in('id', productIds) : { data: [], error: null };
    if (productsResult.error) throw new Error(productsResult.error.message);
    const productNames = new Map<string, { name: string; sku: string }>(((productsResult.data || []) as ProductNameRow[]).map((row) => [String(row.id), { name: row.name || 'Producto archivado', sku: row.sku || '' }]));
    const linesByTransfer = new Map<string, TransferItemRow[]>();
    for (const row of itemRows) {
      const lines = linesByTransfer.get(String(row.transfer_id)) || [];
      lines.push(row);
      linesByTransfer.set(String(row.transfer_id), lines);
    }
    const transfers = transferRows.map((row) => {
      const lines = linesByTransfer.get(String(row.id)) || [];
      const items = lines.map((line) => {
        const requested = units(line.requested_quantity);
        const shipped = units(line.shipped_quantity);
        const received = units(line.received_quantity);
        const product = productNames.get(String(line.product_id));
        return { transferItemId: String(line.id), productId: String(line.product_id), productName: product?.name || 'Producto archivado', productSku: product?.sku || '', requested, shipped, received, pending: shipped - received, unitCost: units(line.unit_cost) };
      });
      const totals = transferTotals(items);
      return {
        id: row.id,
        transferNumber: row.transfer_number,
        status: row.status,
        originBranchId: row.origin_branch_id,
        originWarehouseId: row.origin_warehouse_id,
        destinationBranchId: row.destination_branch_id,
        destinationWarehouseId: row.destination_warehouse_id,
        reason: row.reason,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        ...totals,
        items,
      };
    });
    return NextResponse.json({ ok: true, warehouses: warehouses.map((row) => ({ id: row.id, branchId: row.branch_id, code: row.code, name: row.name, active: row.active })), stocks, transfers }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = text(body.action, 30);
    const permission = action === 'approve-count' || (action.endsWith('-transfer') && action !== 'create-transfer') ? 'edit' : 'create';
    const { context, dbBranchId } = await contextFor(request, permission);
    const supabase = getSupabaseServer();
    if (action === 'receive' || action === 'count' || action === 'approve-count') {
      if (action === 'approve-count' && !MANAGERS.has(context.role)) return NextResponse.json({ error: 'Sólo un jefe o administrador puede aprobar un conteo físico.' }, { status: 403 });
      const warehouseId = text(body.warehouseId, 128);
      const productId = text(body.productId, 128);
      const rawValue = action === 'count' || action === 'approve-count' ? body.countedQuantity : body.quantity;
      const targetQuantity = typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue >= 0 ? Math.round(rawValue * 10000) / 10000 : -1;
      const reason = text(body.reason, 300) || (action === 'receive' ? 'Recepción de inventario' : 'Conteo físico');
      if (!warehouseId || !productId || targetQuantity < 0 || (action === 'receive' && targetQuantity <= 0)) return NextResponse.json({ error: 'Almacén, producto y cantidad son obligatorios.' }, { status: 400 });
      const warehouse = await supabase.from('warehouses').select('id').eq('tenant_id', context.tenantId).eq('id', warehouseId).eq('branch_id', dbBranchId).eq('active', true).maybeSingle();
      if (warehouse.error) throw new Error(warehouse.error.message);
      if (!warehouse.data) return NextResponse.json({ error: 'El almacén no pertenece a la sucursal activa.' }, { status: 404 });
      const result = await supabase.rpc('adjust_inventory', { target_tenant_id: context.tenantId, target_product_id: productId, target_warehouse_id: warehouseId, target_movement_type: action === 'receive' ? 'receive' : 'set', target_quantity: targetQuantity, target_reason: reason, target_user_id: context.uid });
      if (result.error) throw new Error(result.error.message);
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: `inventory.${action}`, entity: 'product', entityId: productId, before: { stock: row?.previous_quantity }, after: { stock: row?.new_quantity, reason }, request: { requestId: request.headers.get('x-correlation-id') || undefined, method: 'POST', path: '/api/inventory/warehouses' }, result: 'success' });
      return NextResponse.json({ ok: true, status: 'completed', current: row?.previous_quantity, next: row?.new_quantity, difference: row?.delta, movementId: row?.movement_id }, { status: 201 });
    }

    const transferRpc = TRANSFER_ACTIONS[action];
    if (transferRpc) {
      if (transferRpc === 'create_stock_transfer') {
        const origin = await resolveTransferWarehouse(context, text(body.fromWarehouseId, 128) || text(body.originWarehouseId, 128), 'ORIGIN_WAREHOUSE_NOT_FOUND');
        const destination = await resolveTransferWarehouse(context, text(body.toWarehouseId, 128) || text(body.destinationWarehouseId, 128), 'DESTINATION_WAREHOUSE_NOT_FOUND');
        const branchNames = await branchClientIds(context.tenantId, [origin.branchId, destination.branchId]);
        await assertTransferBranchScope(context, dbBranchId, [origin.branchId, destination.branchId], branchNames);
        const items = parseTransferItems(body);
        const reason = text(body.reason, 300) || 'Transferencia entre almacenes';
        const result = await supabase.rpc('create_stock_transfer', { target_tenant_id: context.tenantId, target_origin_warehouse_id: origin.warehouseId, target_destination_warehouse_id: destination.warehouseId, target_user_id: context.uid, target_items: items, target_reason: reason });
        if (result.error) throw new Error(result.error.message);
        const payload = (result.data || {}) as Record<string, unknown>;
        await audit(request, context, TRANSFER_AUDIT_ACTIONS[transferRpc], String(payload.transferId || ''), payload);
        return NextResponse.json({ ok: true, ...payload }, { status: 201 });
      }

      const transferId = text(body.transferId, 128);
      if (!transferId) throw new Error('TRANSFER_REQUIRED');
      const transfer = await readTransfer(context, transferId);
      const sideBranchId = String(transferRpc === 'receive_stock_transfer' ? transfer.destination_branch_id : transfer.origin_branch_id);
      const branchNames = await branchClientIds(context.tenantId, [sideBranchId]);
      await assertTransferBranchScope(context, dbBranchId, [sideBranchId], branchNames);
      const args = transferRpc === 'receive_stock_transfer'
        ? { target_tenant_id: context.tenantId, target_transfer_id: transferId, target_user_id: context.uid, target_items: parseReceiptItems(body) }
        : transferRpc === 'cancel_stock_transfer'
          ? { target_tenant_id: context.tenantId, target_transfer_id: transferId, target_user_id: context.uid, target_reason: text(body.reason, 300) || 'Transferencia cancelada' }
          : { target_tenant_id: context.tenantId, target_transfer_id: transferId, target_user_id: context.uid };
      const result = await supabase.rpc(transferRpc, args);
      if (result.error) throw new Error(result.error.message);
      const payload = (result.data || {}) as Record<string, unknown>;
      await audit(request, context, TRANSFER_AUDIT_ACTIONS[transferRpc], transferId, payload);
      return NextResponse.json({ ok: true, ...payload });
    }

    return NextResponse.json({ error: 'Operación de inventario no reconocida.' }, { status: 400 });
  } catch (error: unknown) { return errorResponse(error); }
}
