import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';

function text(value: unknown, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function quantity(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function rpcError(error: unknown) {
  return error instanceof Error ? error.message : String(error || '');
}

async function resolveId(table: 'branches' | 'warehouses' | 'products', tenantId: string, value: string) {
  const supabase = getSupabaseServer();
  if (isUuid(value)) {
    const direct = await supabase.from(table).select('id, legacy_firestore_id, tenant_id, branch_id, active, item_type').eq('tenant_id', tenantId).eq('id', value).maybeSingle();
    if (direct.error) throw new Error(direct.error.message);
    if (direct.data) return direct.data as Record<string, any>;
  }
  const legacy = await supabase.from(table).select('id, legacy_firestore_id, tenant_id, branch_id, active, item_type').eq('tenant_id', tenantId).eq('legacy_firestore_id', value).maybeSingle();
  if (legacy.error) throw new Error(legacy.error.message);
  return legacy.data as Record<string, any> | null;
}

function responseFor(error: unknown) {
  const message = rpcError(error);
  if (message.includes('PRODUCT_NOT_FOUND')) return NextResponse.json({ error: 'Uno de los productos no existe o está archivado.' }, { status: 404 });
  if (message.includes('INSUFFICIENT_WAREHOUSE_STOCK')) return NextResponse.json({ error: 'No hay stock suficiente para completar la reserva.' }, { status: 409 });
  if (message.includes('RESERVATION_EMPTY')) return NextResponse.json({ error: 'No se puede reservar únicamente servicios.' }, { status: 400 });
  if (message.includes('WAREHOUSE_NOT_FOUND')) return NextResponse.json({ error: 'El almacén no existe o no está activo.' }, { status: 404 });
  if (message.includes('RESERVATION_NOT_FOUND')) return NextResponse.json({ error: 'La reserva no existe.' }, { status: 404 });
  if (message.includes('RESERVATION_CLOSED')) return NextResponse.json({ error: 'La reserva ya fue cerrada.' }, { status: 409 });
  if (message.includes('RESERVATION_STOCK_INCONSISTENT') || message.includes('STOCK_ROW_NOT_FOUND')) return NextResponse.json({ error: 'No se pudo liberar la reserva por inconsistencia de stock.' }, { status: 409 });
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'inventory', 'edit');
    const body = await request.json();
    const branchId = text(body.branchId, 128) || request.headers.get('x-branch-id')?.trim() || context.branchIds[0] || '';
    const warehouseId = text(body.warehouseId, 128) || '';
    if (!branchId) return NextResponse.json({ error: 'La sucursal es obligatoria para reservar inventario.' }, { status: 400 });
    if (!warehouseId) return NextResponse.json({ error: 'El almacén es obligatorio para reservar inventario.' }, { status: 400 });
    assertBranchAccess(context, branchId);
    const branch = await resolveId('branches', context.tenantId, branchId);
    const warehouse = await resolveId('warehouses', context.tenantId, warehouseId);
    if (!branch) return NextResponse.json({ error: 'La sucursal no existe en este tenant.' }, { status: 404 });
    if (!warehouse || warehouse.active === false) return NextResponse.json({ error: 'El almacén no existe o no está activo.' }, { status: 404 });
    if (String(warehouse.branch_id) !== String(branch.id)) return NextResponse.json({ error: 'El almacén no pertenece a la sucursal indicada.' }, { status: 400 });

    const rawItems = Array.isArray(body.items) ? body.items : [];
    const requested = new Map<string, number>();
    for (const item of rawItems) {
      const productId = text(item?.productId, 120);
      const amount = quantity(item?.quantity);
      if (productId && amount) requested.set(productId, (requested.get(productId) || 0) + amount);
    }
    if (!requested.size) return NextResponse.json({ error: 'La reserva debe contener productos y cantidades válidas.' }, { status: 400 });
    const items: Array<{ productId: string; quantity: number }> = [];
    for (const [productId, amount] of Array.from(requested.entries())) {
      const product = await resolveId('products', context.tenantId, productId);
      if (!product || product.active === false) throw new Error('PRODUCT_NOT_FOUND');
      items.push({ productId: String(product.id), quantity: amount });
    }

    const result = await getSupabaseServer().rpc('reserve_inventory', {
      target_tenant_id: context.tenantId,
      target_branch_id: branch.id,
      target_warehouse_id: warehouse.id,
      target_user_id: context.uid,
      target_items: items,
      target_reason: text(body.reason, 300) || 'Reserva de stock',
    });
    if (result.error) throw new Error(result.error.message);
    const payload = result.data as Record<string, unknown>;
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'inventory.stock_reserved', entity: 'inventory_reservation', entityId: String(payload.reservationId), after: payload, request: { requestId: request.headers.get('x-correlation-id') || undefined, method: 'POST', path: '/api/inventory/reservations' }, result: 'success' });
    return NextResponse.json({ ok: true, ...payload }, { status: 201 });
  } catch (error: unknown) {
    return responseFor(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'inventory', 'edit');
    const reservationId = text(new URL(request.url).searchParams.get('id'), 120);
    if (!reservationId) return NextResponse.json({ error: 'La reserva es obligatoria.' }, { status: 400 });
    const reservation = await getSupabaseServer().from('inventory_reservations').select('branch_id').eq('tenant_id', context.tenantId).eq('id', reservationId).maybeSingle();
    if (reservation.error) throw new Error(reservation.error.message);
    if (!reservation.data) throw new Error('RESERVATION_NOT_FOUND');
    const branch = await resolveId('branches', context.tenantId, String(reservation.data.branch_id));
    if (!branch) throw new Error('RESERVATION_NOT_FOUND');
    assertBranchAccess(context, String(branch.legacy_firestore_id || branch.id));
    const result = await getSupabaseServer().rpc('release_inventory_reservation', {
      target_tenant_id: context.tenantId,
      target_reservation_id: reservationId,
      target_user_id: context.uid,
    });
    if (result.error) throw new Error(result.error.message);
    const payload = result.data as Record<string, unknown>;
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'inventory.stock_reservation_released', entity: 'inventory_reservation', entityId: reservationId, after: payload, request: { requestId: request.headers.get('x-correlation-id') || undefined, method: 'DELETE', path: '/api/inventory/reservations' }, result: 'success' });
    return NextResponse.json({ ok: true, ...payload });
  } catch (error: unknown) {
    return responseFor(error);
  }
}
