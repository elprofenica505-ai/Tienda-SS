import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
function text(value: unknown, max = 180) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function money(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value * 100) / 100) : 0; }
function responseFor(error: unknown) { const message = error instanceof Error ? error.message : ''; if (message.includes('PRODUCT_NOT_FOUND')) return NextResponse.json({ error: 'Uno de los productos no existe o está archivado.' }, { status: 404 }); if (message.includes('BRANCH_NOT_FOUND')) return NextResponse.json({ error: 'La sucursal no existe o no está activa.' }, { status: 404 }); if (message.includes('WAREHOUSE_NOT_FOUND')) return NextResponse.json({ error: 'El almacén no existe o no está activo.' }, { status: 404 }); if (message.includes('WAREHOUSE_BRANCH_MISMATCH')) return NextResponse.json({ error: 'El almacén no pertenece a la sucursal indicada.' }, { status: 400 }); if (message.includes('INVALID_PURCHASE')) return NextResponse.json({ error: 'Los datos de la compra no son válidos.' }, { status: 400 }); const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'inventory', 'view');
    const branchId = text(request.headers.get('x-branch-id'), 128);
    const supabase = getSupabaseServer();
    let query = supabase.from('purchases').select('*, purchase_items(*)').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(100);
    if (branchId && !['owner', 'admin', 'gerente', 'jefe'].includes(context.role)) {
      if (!context.branchIds.includes(branchId)) return NextResponse.json({ error: 'La sucursal no está autorizada para este usuario.' }, { status: 403 });
      query = query.eq('branch_id', branchId);
    }
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    const purchases = (result.data || []).map((row: any) => ({ id: row.id, branchId: row.branch_id, warehouseId: row.warehouse_id, supplierName: row.metadata?.supplierName || 'Proveedor no especificado', evidenceRef: row.metadata?.evidenceRef || null, status: row.status, subtotal: Number(row.subtotal || 0), total: Number(row.total || 0), items: row.purchase_items || [], createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at }));
    return NextResponse.json({ ok: true, purchases }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { return responseFor(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'inventory', 'create');
    const body = await request.json();
    const action = text(body.action, 30) || 'receive';
    const branchId = text(body.branchId, 128) || text(request.headers.get('x-branch-id'), 128);
    const warehouseId = text(body.warehouseId, 128);
    const supplierName = text(body.supplierName, 180);
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (action === 'receive_partial') {
      const purchaseId = text(body.purchaseId, 128);
      const receiptItems = Array.isArray(body.items) ? body.items : [];
      const purchase = await getSupabaseServer().from('purchases').select('branch_id').eq('tenant_id', context.tenantId).eq('id', purchaseId).maybeSingle();
      if (purchase.error || !purchase.data) return NextResponse.json({ error: 'La orden de compra no existe.' }, { status: 404 });
      if (!['owner', 'admin', 'gerente', 'jefe'].includes(context.role) && !context.branchIds.includes(purchase.data.branch_id)) return NextResponse.json({ error: 'La sucursal no está autorizada para este usuario.' }, { status: 403 });
      const received = await getSupabaseServer().rpc('receive_purchase_partial', { target_tenant_id: context.tenantId, target_purchase_id: purchaseId, target_user_id: context.uid, target_items: receiptItems });
      if (received.error) throw new Error(received.error.message);
      return NextResponse.json({ ok: true, ...(received.data || {}) }, { status: 200 });
    }
    if (action === 'order') {
      const supplierId = text(body.supplierId, 128);
      const ordered = await getSupabaseServer().rpc('create_purchase_order', { target_tenant_id: context.tenantId, target_branch_id: branchId, target_warehouse_id: warehouseId, target_supplier_id: supplierId, target_user_id: context.uid, target_items: rawItems, target_status: text(body.status, 20) === 'draft' ? 'draft' : 'ordered' });
      if (ordered.error) throw new Error(ordered.error.message);
      return NextResponse.json({ ok: true, ...(ordered.data || {}) }, { status: 201 });
    }
    const evidenceRef = text(body.evidenceRef, 500);
    if (!branchId || !warehouseId) return NextResponse.json({ error: 'La sucursal y el almacén son obligatorios.' }, { status: 400 });
    if (!rawItems.length || rawItems.length > 50) return NextResponse.json({ error: 'La compra debe contener entre 1 y 50 productos.' }, { status: 400 });
    if (!['owner', 'admin', 'gerente', 'jefe'].includes(context.role) && !context.branchIds.includes(branchId)) return NextResponse.json({ error: 'La sucursal no está autorizada para este usuario.' }, { status: 403 });
    const items = rawItems.map((item: Record<string, unknown>) => ({ productId: text(item.productId, 120), quantity: typeof item.quantity === 'number' && Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 0, unitCost: money(item.unitCost) })).filter((item: { productId: string; quantity: number }) => item.productId && item.quantity > 0);
    if (!items.length) return NextResponse.json({ error: 'Los ítems de la compra no son válidos.' }, { status: 400 });
    const result = await getSupabaseServer().rpc('receive_purchase', { target_tenant_id: context.tenantId, target_branch_id: branchId, target_warehouse_id: warehouseId, target_supplier_name: supplierName, target_evidence_ref: evidenceRef && !evidenceRef.startsWith('data:') ? evidenceRef : '', target_user_id: context.uid, target_items: items });
    if (result.error) throw new Error(result.error.message);
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    const purchaseId = row?.purchase_id;
    const total = Number(row?.total || 0);
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'purchase.created', entity: 'purchase', entityId: purchaseId, after: { purchaseId, branchId, warehouseId, total, itemCount: row?.item_count }, result: 'success' });
    return NextResponse.json({ ok: true, purchaseId, branchId, warehouseId, total, itemCount: row?.item_count }, { status: 201 });
  } catch (error: unknown) { return responseFor(error); }
}
