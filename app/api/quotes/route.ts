import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
const managers = new Set(['owner', 'admin', 'gerente', 'jefe']);
function text(value: unknown, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function replyError(error: unknown) { const r = tenantErrorResponse(error); return NextResponse.json(r.body, { status: r.status }); }

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'quotes', 'view');
    const supabase = getSupabaseServer();
    const id = text(request.nextUrl.searchParams.get('id'), 80);
    const branchId = text(request.nextUrl.searchParams.get('branchId'), 80);
    let query = supabase.from('quotes').select('id,quote_number,branch_id,customer_id,seller_uid,status,valid_until,subtotal,tax_amount,total,currency,notes,terms,rejection_reason,sent_at,decided_at,converted_presale_id,created_at,updated_at,customers(name,email,phone),branches(name),quote_items(id,product_id,description,sku,quantity,unit_price,tax_rate,line_subtotal,line_tax,line_total)').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(id ? 1 : 100);
    if (id) query = query.eq('id', id);
    if (branchId) { assertBranchAccess(context, branchId); query = query.eq('branch_id', branchId); }
    else if (!managers.has(context.role)) {
      if (!context.branchIds.length) return NextResponse.json({ ok: true, quotes: [] });
      query = query.in('branch_id', context.branchIds);
    }
    if (context.role === 'vendedor') query = query.eq('seller_uid', context.uid);
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    if (id && !result.data?.length) return NextResponse.json({ error: 'La cotización no existe.' }, { status: 404 });
    return NextResponse.json({ ok: true, quotes: result.data || [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return replyError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'quotes', 'create');
    const body = await request.json();
    const branchId = text(body.branchId, 80);
    if (!branchId) return NextResponse.json({ error: 'Selecciona una sucursal.' }, { status: 400 });
    assertBranchAccess(context, branchId);
    const items = Array.isArray(body.items) ? body.items.map((item: Record<string, unknown>) => ({ productId: text(item.productId, 80), quantity: Number(item.quantity) })).filter((item: { productId: string; quantity: number }) => item.productId && Number.isFinite(item.quantity) && item.quantity > 0) : [];
    if (!items.length) return NextResponse.json({ error: 'Agrega al menos un producto.' }, { status: 400 });
    const validUntil = text(body.validUntil, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) return NextResponse.json({ error: 'Indica una fecha de vigencia válida.' }, { status: 400 });
    const result = await getSupabaseServer().rpc('create_commercial_quote', {
      target_tenant_id: context.tenantId, target_branch_id: branchId, target_customer_id: text(body.customerId, 80) || null,
      target_user_id: context.uid, target_valid_until: validUntil, target_currency: text(body.currency, 8) || 'NIO',
      target_notes: text(body.notes, 1000), target_terms: text(body.terms, 1000), target_items: items,
    });
    if (result.error) throw new Error(result.error.message);
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'quote.created', entity: 'quote', entityId: String(result.data?.id || ''), after: result.data, result: 'success' });
    return NextResponse.json({ ok: true, quote: result.data }, { status: 201 });
  } catch (error) { return replyError(error); }
}
