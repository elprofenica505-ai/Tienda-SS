import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse, type TenantRole } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { assertResolvedBranchAccess, resolveAuthorizedBranchId, resolveTenantBranchAndWarehouse } from '@/lib/organization-scope';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
const cashierRoles: TenantRole[] = ['owner', 'admin', 'gerente', 'supervisor_sucursal', 'cajero'];
type PreSaleLine = { productId: string; name: string; sku: string; quantity: number; unitPrice: number; total: number };
function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function money(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0; }
function ticketCode() { return `P-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(3).toString('hex').toUpperCase()}`; }
function pageCursor(value: unknown): { createdAt: string; id: string } | null { try { const parsed = JSON.parse(Buffer.from(text(value, 300), 'base64url').toString('utf8')); return typeof parsed.createdAt === 'string' && typeof parsed.id === 'string' ? parsed : null; } catch { return null; } }
function errorResponse(error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
function serialize(row: Record<string, unknown>) { return { id: row.id, ticketCode: row.ticket_code, items: row.items || [], total: row.total, vendedorUid: row.seller_uid, vendedorEmail: row.seller_email, vendedorRole: row.seller_role, status: row.status, evidenceRefs: row.evidence_refs || [], metadata: row.metadata || {}, saleId: row.sale_id, branchId: row.branch_id, createdAt: row.created_at, updatedAt: row.updated_at, paidBy: row.paid_by, paidAt: row.paid_at }; }

export async function GET(request: NextRequest) {
  try {
    // Caja consulta preventas que luego cobrará como una venta; usa la misma
    // capacidad efectiva que el checkout directo, no una vista más restrictiva.
    const context = await requireTenantPermission(request, 'sales', 'create');
    const supabase = getSupabaseServer();
    const code = text(request.nextUrl.searchParams.get('code'), 80);
    const cursor = pageCursor(request.nextUrl.searchParams.get('cursor'));
    const branchId = text(request.headers.get('x-branch-id'), 80);
    // 20 filas + 1 sentinel para cursor; el checkout/preventa permanece intacto.
    let query = supabase.from('presales').select('id,ticket_code,items,total,seller_uid,seller_email,seller_role,status,evidence_refs,metadata,sale_id,branch_id,created_at,updated_at,paid_by,paid_at').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(21);
    if (code) {
      query = query.eq('ticket_code', code).limit(1);
      if (context.role === 'vendedor') query = query.eq('seller_uid', context.uid);
      if (branchId) {
        const resolved = await resolveTenantBranchAndWarehouse(context.tenantId, branchId);
        if (!resolved.branchId) throw new Error('BRANCH_NOT_FOUND');
        assertResolvedBranchAccess(context, branchId, resolved.branchId);
        query = query.eq('branch_id', resolved.branchId);
      }
    } else {
      if (context.role === 'vendedor') query = query.eq('seller_uid', context.uid);
      if (branchId) {
        const resolved = await resolveTenantBranchAndWarehouse(context.tenantId, branchId);
        if (!resolved.branchId) throw new Error('BRANCH_NOT_FOUND');
        assertResolvedBranchAccess(context, branchId, resolved.branchId);
        query = query.eq('branch_id', resolved.branchId);
      } else if (!['owner', 'admin', 'gerente', 'jefe'].includes(context.role)) {
        if (!context.branchIds.length) return NextResponse.json({ ok: true, presales: [], nextCursor: null });
        query = query.in('branch_id', context.branchIds);
      }
      if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    }
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    if (code && !result.data?.length) return NextResponse.json({ error: 'No encontramos una preventa con ese código.' }, { status: 404 });
    const rows = result.data || [];
    const docs = code ? rows : rows.slice(0, 20);
    const last = docs.at(-1);
    const nextCursor = !code && rows.length > 20 && last ? Buffer.from(JSON.stringify({ createdAt: last.created_at, id: last.id })).toString('base64url') : null;
    return NextResponse.json(code ? { ok: true, presale: serialize(rows[0]) } : { ok: true, presales: docs.map(serialize), nextCursor }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'create');
    const body = await request.json();
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const action = body.action === 'send' ? 'sent_to_cashier' : 'draft';
    const evidenceRefs = Array.isArray(body.evidenceRefs) ? body.evidenceRefs.filter((item: unknown) => typeof item === 'string' && item.length <= 500 && !item.startsWith('data:')).slice(0, 10) : [];
    if (!rawItems.length || rawItems.length > 50) return NextResponse.json({ error: 'La preventa debe contener entre 1 y 50 productos.' }, { status: 400 });
    const unique = new Map<string, number>();
    for (const item of rawItems) { const productId = text(item?.productId, 120); const quantity = Number.isInteger(item?.quantity) ? item.quantity : 0; if (productId && quantity > 0) unique.set(productId, (unique.get(productId) || 0) + quantity); }
    if (!unique.size) return NextResponse.json({ error: 'Las cantidades de la preventa no son válidas.' }, { status: 400 });
    const supabase = getSupabaseServer();
    const productIds = Array.from(unique.keys());
    const products = await supabase.from('products').select('id,name,sku,price,active').eq('tenant_id', context.tenantId).in('id', productIds);
    if (products.error) throw new Error(products.error.message);
    const productById = new Map((products.data || []).map((product) => [String(product.id), product]));
    if (productById.size !== productIds.length || productIds.some((id) => productById.get(id)?.active === false)) throw new Error('PRODUCT_NOT_FOUND');
    const lines: PreSaleLine[] = productIds.map((id) => { const data = productById.get(id)!; const quantity = unique.get(id) || 0; const unitPrice = money(Number(data.price)); return { productId: id, name: text(data.name) || 'Producto', sku: text(data.sku, 50), quantity, unitPrice, total: unitPrice * quantity }; });
    const total = lines.reduce((sum, line) => sum + line.total, 0);
    const metadata = { customerId: text(body.customerId, 120) || null, suggestedPayment: ['cash', 'card', 'transfer', 'credit'].includes(body.suggestedPayment) ? body.suggestedPayment : null, documentType: text(body.documentType, 40) || 'ticket', servicePoint: text(body.servicePoint, 120), notes: text(body.notes, 1000), itemNotes: typeof body.itemNotes === 'object' && body.itemNotes ? body.itemNotes : {} };
    const requestedBranchId = text(body.branchId, 80) || text(request.headers.get('x-branch-id'), 80);
    const branchId = await resolveAuthorizedBranchId(context, requestedBranchId || undefined);
    const resolved = await resolveTenantBranchAndWarehouse(context.tenantId, branchId);
    if (!resolved.branchId) throw new Error('BRANCH_NOT_FOUND');
    assertResolvedBranchAccess(context, branchId, resolved.branchId);
    let warehouseId = '';
    let reservationId: string | null = null;
    if (action === 'sent_to_cashier') {
      warehouseId = resolved.warehouseId;
      if (!warehouseId) throw new Error('WAREHOUSE_NOT_FOUND');
    }
    const inserted = await supabase.from('presales').insert({ tenant_id: context.tenantId, branch_id: branchId || null, warehouse_id: warehouseId || null, ticket_code: ticketCode(), items: lines, total, seller_uid: context.uid, seller_email: context.email || null, seller_role: context.role, status: action === 'sent_to_cashier' ? 'draft' : action, evidence_refs: evidenceRefs, metadata }).select('id,ticket_code,status,total').single();
    if (inserted.error) throw new Error(inserted.error.message);
    if (action === 'sent_to_cashier') {
      const reservation = await supabase.rpc('reserve_inventory_contract', { target_tenant_id: context.tenantId, target_branch_id: branchId, target_warehouse_id: warehouseId, target_user_id: context.uid, target_items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })), target_reason: `Preventa ${inserted.data.ticket_code}` });
      if (reservation.error) { await supabase.from('presales').delete().eq('tenant_id', context.tenantId).eq('id', inserted.data.id); throw new Error(reservation.error.message); }
      reservationId = String((reservation.data as Record<string, unknown>)?.reservationId || '');
      const sent = await supabase.from('presales').update({ status: 'sent_to_cashier', reservation_id: reservationId || null, warehouse_id: warehouseId, updated_at: new Date().toISOString() }).eq('tenant_id', context.tenantId).eq('id', inserted.data.id).select('id,ticket_code,status,total').single();
      if (sent.error) {
        if (reservationId) await supabase.rpc('release_inventory_reservation', { target_tenant_id: context.tenantId, target_reservation_id: reservationId, target_user_id: context.uid });
        await supabase.from('presales').delete().eq('tenant_id', context.tenantId).eq('id', inserted.data.id);
        throw new Error(sent.error.message);
      }
      inserted.data = sent.data;
    }
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'presale.created', entity: 'presale', entityId: inserted.data.id, after: { status: action, total, itemCount: lines.length }, result: 'success' });
    return NextResponse.json({ ok: true, presaleId: inserted.data.id, ticketCode: inserted.data.ticket_code, status: inserted.data.status, total: inserted.data.total }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'PRODUCT_NOT_FOUND') return NextResponse.json({ error: 'Uno de los productos ya no está disponible.' }, { status: 404 });
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'edit');
    if (!cashierRoles.includes(context.role) && context.role !== 'vendedor') return NextResponse.json({ error: 'Tu rol no puede actualizar preventas.' }, { status: 403 });
    const body = await request.json(); const id = text(body.presaleId, 120); const action: 'sent_to_cashier' | 'cancelled' | '' = body.action === 'send' ? 'sent_to_cashier' : body.action === 'cancel' ? 'cancelled' : '';
    if (!id || !action) return NextResponse.json({ error: 'Preventa y acción son obligatorias.' }, { status: 400 });
    const supabase = getSupabaseServer();
    const currentResult = await supabase.from('presales').select('id,status,seller_uid,total,branch_id,reservation_id').eq('tenant_id', context.tenantId).eq('id', id).maybeSingle();
    if (currentResult.error) throw new Error(currentResult.error.message);
    if (!currentResult.data) return NextResponse.json({ error: 'La preventa no existe.' }, { status: 404 });
    const requestedBranchId = text(request.headers.get('x-branch-id'), 80);
    if (requestedBranchId) assertBranchAccess(context, requestedBranchId);
    if (currentResult.data.branch_id && requestedBranchId && currentResult.data.branch_id !== requestedBranchId) return NextResponse.json({ error: 'La preventa pertenece a otra sucursal.' }, { status: 403 });
    if (context.role !== 'vendedor' && currentResult.data.branch_id) assertBranchAccess(context, currentResult.data.branch_id);
    if ((action === 'sent_to_cashier' && currentResult.data.status !== 'draft') || (action === 'cancelled' && currentResult.data.status !== 'sent_to_cashier')) return NextResponse.json({ error: 'La preventa ya no puede cambiar de estado.' }, { status: 409 });
    if (context.role === 'vendedor' && currentResult.data.seller_uid !== context.uid) return NextResponse.json({ error: 'Solo puedes actualizar tus propias preventas.' }, { status: 403 });
    if (action === 'cancelled' && currentResult.data.reservation_id) {
      const released = await supabase.rpc('release_inventory_reservation', { target_tenant_id: context.tenantId, target_reservation_id: currentResult.data.reservation_id, target_user_id: context.uid });
      if (released.error) throw new Error(released.error.message);
    }
    const updated = await supabase.from('presales').update({ status: action, updated_at: new Date().toISOString() }).eq('tenant_id', context.tenantId).eq('id', id).select('id,status').single();
    if (updated.error) throw new Error(updated.error.message);
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: `presale.${action}`, entity: 'presale', entityId: id, before: { status: currentResult.data.status }, after: { status: action }, result: 'success' });
    return NextResponse.json({ ok: true, presaleId: id, status: updated.data.status });
  } catch (error: unknown) { return errorResponse(error); }
}
