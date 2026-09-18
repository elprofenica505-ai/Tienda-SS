import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse, type TenantRole } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
const deliveryRoles: TenantRole[] = ['owner', 'admin', 'gerente', 'supervisor_sucursal', 'chofer', 'despachador'];
const ADMIN_ROLES = new Set<TenantRole>(['owner', 'admin', 'gerente', 'jefe']);
function text(value: unknown, max = 180) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const known: Record<string, [string, number]> = { SALE_NOT_FOUND: ['La venta no existe en este tenant.', 404], SALE_NOT_AVAILABLE: ['La venta no está disponible para entrega.', 409], DELIVERY_NOT_FOUND: ['Entrega no encontrada.', 404], DELIVERY_OUT_OF_SCOPE: ['No puedes actualizar esta entrega.', 403], INVALID_DELIVERY_STATUS: ['Estado inválido.', 400] };
  for (const [key, value] of Object.entries(known)) if (message.includes(key)) return NextResponse.json({ error: value[0] }, { status: value[1] });
  const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
}
async function branchScopeId(tenantId: string, branchId: string) {
  const supabase = getSupabaseServer();
  const result = await supabase.from('branches').select('id,legacy_firestore_id').eq('tenant_id', tenantId).eq('id', branchId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data?.legacy_firestore_id || result.data?.id || branchId;
}
async function accessibleBranchIds(tenantId: string, branchIds: string[]) {
  const result = await getSupabaseServer().from('branches').select('id,legacy_firestore_id').eq('tenant_id', tenantId).limit(100);
  if (result.error) throw new Error(result.error.message);
  const allowed = new Set(branchIds);
  return (result.data || []).filter((branch) => allowed.has(branch.id) || (branch.legacy_firestore_id && allowed.has(branch.legacy_firestore_id))).map((branch) => branch.id);
}
function mapDelivery(row: Record<string, any>) {
  return { id: row.id, saleId: row.sale_id, branchId: row.branch_id, customerId: row.customer_id, customerName: row.customer_name, address: row.address, driverUid: row.driver_id, status: row.status, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at, deliveredAt: row.delivered_at };
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'view');
    let query = getSupabaseServer().from('deliveries').select('id,tenant_id,sale_id,branch_id,customer_id,customer_name,address,driver_id,status,created_by,created_at,updated_at,delivered_at').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(25);
    if (context.role === 'chofer') query = query.eq('driver_id', context.uid);
    else if (!ADMIN_ROLES.has(context.role)) query = query.in('branch_id', await accessibleBranchIds(context.tenantId, context.branchIds));
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ ok: true, deliveries: (result.data || []).map((row) => mapDelivery(row as Record<string, any>)) });
  } catch (error: unknown) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    let context = await requireTenantPermission(request, 'sales', 'view');
    if (context.role !== 'chofer') context = await requireTenantPermission(request, 'sales', 'create');
    if (!deliveryRoles.includes(context.role)) return NextResponse.json({ error: 'Tu rol no puede crear entregas.' }, { status: 403 });
    const body = await request.json();
    const saleId = text(body.saleId, 128);
    if (!saleId) return NextResponse.json({ error: 'La venta es obligatoria.' }, { status: 400 });
    const driverUid = context.role === 'chofer' ? context.uid : text(body.driverUid, 128) || null;
    const result = await getSupabaseServer().rpc('create_delivery', { target_tenant_id: context.tenantId, target_sale_id: saleId, target_driver_id: driverUid, target_address: text(body.address, 300), target_user_id: context.uid });
    if (result.error) throw new Error(result.error.message);
    const delivery = result.data as Record<string, unknown>;
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'delivery.created', entity: 'delivery', entityId: String(delivery.id), after: delivery, result: 'success' });
    return NextResponse.json({ ok: true, delivery }, { status: 201 });
  } catch (error: unknown) { return failure(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'view');
    const body = await request.json();
    const id = text(body.id, 128);
    const status = body.status === 'delivered' ? 'delivered' : body.status === 'pending' ? 'pending' : '';
    if (!id) return NextResponse.json({ error: 'Entrega inválida.' }, { status: 400 });
    if (!status) return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 });
    const current = await getSupabaseServer().from('deliveries').select('id,branch_id,driver_id,status').eq('tenant_id', context.tenantId).eq('id', id).maybeSingle();
    if (current.error) throw new Error(current.error.message);
    if (!current.data) throw new Error('DELIVERY_NOT_FOUND');
    if (context.role !== 'chofer') {
      if (!['owner', 'admin', 'gerente', 'jefe'].includes(context.role)) {
        const permissionContext = await requireTenantPermission(request, 'sales', 'edit');
        assertBranchAccess(permissionContext, await branchScopeId(context.tenantId, current.data.branch_id));
      }
    } else {
      if (current.data.driver_id !== context.uid) throw new Error('DELIVERY_OUT_OF_SCOPE');
    }
    const result = await getSupabaseServer().rpc('update_delivery_status', { target_tenant_id: context.tenantId, target_delivery_id: id, target_status: status, target_user_id: context.uid });
    if (result.error) throw new Error(result.error.message);
    const data = result.data as Record<string, unknown>;
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: `delivery.${status}`, entity: 'delivery', entityId: id, before: { status: current.data.status }, after: data, result: 'success' });
    return NextResponse.json({ ok: true, ...data });
  } catch (error: unknown) { return failure(error); }
}
