import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse, type TenantRole } from '@/lib/tenant';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
const sellerRoles: TenantRole[] = ['owner', 'admin', 'gerente', 'supervisor_sucursal', 'vendedor'];
const cashierRoles: TenantRole[] = ['owner', 'admin', 'gerente', 'supervisor_sucursal', 'cajero'];
type PreSaleLine = { productId: string; name: string; sku: string; quantity: number; unitPrice: number; total: number };
function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function money(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0; }
function ticketCode() { return `P-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(3).toString('hex').toUpperCase()}`; }
function pageCursor(value: unknown): { createdAt: string; id: string } | null { try { const parsed = JSON.parse(Buffer.from(text(value, 300), 'base64url').toString('utf8')); return typeof parsed.createdAt === 'string' && typeof parsed.id === 'string' ? parsed : null; } catch { return null; } }
function errorResponse(error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'view');
    const tenant = getAdminDb().collection('tenants').doc(context.tenantId);
    const code = text(request.nextUrl.searchParams.get('code'), 80);
    const cursor = pageCursor(request.nextUrl.searchParams.get('cursor'));
    if (code) {
      const snapshot = await tenant.collection('presales').where('ticketCode', '==', code).limit(1).get();
      if (snapshot.empty) return NextResponse.json({ error: 'No encontramos una preventa con ese código.' }, { status: 404 });
      const item = snapshot.docs[0];
      return NextResponse.json({ ok: true, presale: { id: item.id, ...item.data() } }, { headers: { 'Cache-Control': 'no-store' } });
    }
    let query = tenant.collection('presales').orderBy('createdAt', 'desc').orderBy('__name__', 'desc').limit(21);
    if (context.role === 'vendedor') query = tenant.collection('presales').where('vendedorUid', '==', context.uid).orderBy('createdAt', 'desc').orderBy('__name__', 'desc').limit(21);
    if (cursor) query = query.startAfter(new Date(cursor.createdAt), cursor.id);
    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, 20);
    const last = docs.at(-1);
    const nextCursor = snapshot.docs.length > 20 && last ? Buffer.from(JSON.stringify({ createdAt: (last.data().createdAt?.toDate?.() || last.data().createdAt).toISOString(), id: last.id })).toString('base64url') : null;
    return NextResponse.json({ ok: true, presales: docs.map((item) => ({ id: item.id, ...item.data() })), nextCursor }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'sales', 'create');
    if (!sellerRoles.includes(context.role)) return NextResponse.json({ error: 'Tu rol no puede crear preventas.' }, { status: 403 });
    const body = await request.json();
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const action = body.action === 'send' ? 'sent_to_cashier' : 'draft';
    const evidenceRefs = Array.isArray(body.evidenceRefs) ? body.evidenceRefs.filter((item: unknown) => typeof item === 'string' && item.length <= 500 && !item.startsWith('data:')).slice(0, 10) : [];
    if (!rawItems.length || rawItems.length > 50) return NextResponse.json({ error: 'La preventa debe contener entre 1 y 50 productos.' }, { status: 400 });
    const unique = new Map<string, number>();
    for (const item of rawItems) { const productId = text(item?.productId, 120); const quantity = Number.isInteger(item?.quantity) ? item.quantity : 0; if (productId && quantity > 0) unique.set(productId, (unique.get(productId) || 0) + quantity); }
    if (!unique.size) return NextResponse.json({ error: 'Las cantidades de la preventa no son válidas.' }, { status: 400 });
    const db = getAdminDb(); const tenant = db.collection('tenants').doc(context.tenantId); const productRefs = Array.from(unique.keys()).map((id) => tenant.collection('products').doc(id));
    const presaleRef = tenant.collection('presales').doc(); const now = new Date();
    const lines = await db.runTransaction(async (transaction) => {
      const products = await transaction.getAll(...productRefs); const result: PreSaleLine[] = [];
      products.forEach((snapshot, index) => { if (!snapshot.exists || snapshot.data()?.active === false) throw new Error('PRODUCT_NOT_FOUND'); const data = snapshot.data() || {}; const quantity = unique.get(productRefs[index].id) || 0; const unitPrice = money(data.price); result.push({ productId: productRefs[index].id, name: text(data.name) || 'Producto', sku: text(data.sku, 50), quantity, unitPrice, total: unitPrice * quantity }); });
      return result;
    });
    const total = lines.reduce((sum, line) => sum + line.total, 0);
    await presaleRef.create({ ticketCode: ticketCode(), items: lines, total, vendedorUid: context.uid, vendedorRole: context.role, status: action, evidenceRefs, createdAt: now, updatedAt: now });
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'presale.created', entity: 'presale', entityId: presaleRef.id, after: { status: action, total, itemCount: lines.length }, result: 'success' });
    return NextResponse.json({ ok: true, presaleId: presaleRef.id, ticketCode: (await presaleRef.get()).data()?.ticketCode, status: action, total }, { status: 201 });
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
    const ref = getAdminDb().collection('tenants').doc(context.tenantId).collection('presales').doc(id);
    const snapshot = await ref.get(); if (!snapshot.exists) return NextResponse.json({ error: 'La preventa no existe.' }, { status: 404 });
    const current = snapshot.data() || {};
    if ((action === 'sent_to_cashier' && current.status !== 'draft') || (action === 'cancelled' && current.status !== 'sent_to_cashier')) return NextResponse.json({ error: 'La preventa ya no puede cambiar de estado.' }, { status: 409 });
    if (context.role === 'vendedor' && current.vendedorUid !== context.uid) return NextResponse.json({ error: 'Solo puedes actualizar tus propias preventas.' }, { status: 403 });
    await ref.update({ status: action, updatedAt: new Date(), updatedBy: context.uid });
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: `presale.${action}`, entity: 'presale', entityId: id, before: { status: current.status }, after: { status: action }, result: 'success' });
    return NextResponse.json({ ok: true, presaleId: id, status: action });
  } catch (error: unknown) { return errorResponse(error); }
}
