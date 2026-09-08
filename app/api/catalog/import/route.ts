import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertPlanCapacity } from '@/lib/entitlement-guard';
import { parseCsv, csvNumber } from '@/lib/csv';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'catalog', 'create');
    const contentType = request.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await request.json() : { csv: await request.text() };
    const parsed = parseCsv(typeof body.csv === 'string' ? body.csv : '', 500);
    const required = ['name', 'sku', 'price', 'stock'];
    const missing = required.filter((header) => !parsed.headers.includes(header));
    if (missing.length || parsed.errors.length) return NextResponse.json({ error: 'CSV inválido.', details: [...missing.map((item) => `Falta la columna ${item}.`), ...parsed.errors] }, { status: 400 });
    if (!parsed.rows.length) return NextResponse.json({ error: 'El CSV no contiene productos para importar.' }, { status: 400 });
    const seen = new Set<string>();
    const rows = parsed.rows.map((row, index) => {
      const name = row.name.trim().slice(0, 120);
      const sku = row.sku.trim().toUpperCase().slice(0, 50);
      const itemType = row.itemtype === 'service' ? 'service' : 'physical';
      if (name.length < 2) throw new Error(`Fila ${index + 2}: nombre inválido.`);
      if (!sku) throw new Error(`Fila ${index + 2}: SKU obligatorio.`);
      if (seen.has(sku)) throw new Error(`Fila ${index + 2}: SKU duplicado dentro del archivo.`);
      seen.add(sku);
      return { name, sku, itemType, categoryId: (row.categoryid || '').slice(0, 80), price: Math.max(0, csvNumber(row.price)), stock: itemType === 'service' ? 0 : Math.max(0, Math.floor(csvNumber(row.stock))), minStock: Math.max(0, Math.floor(csvNumber(row.minstock, 5))) };
    });
    const db = getAdminDb();
    const tenantRef = db.collection('tenants').doc(context.tenantId);
    const [tenantSnapshot, activeSnapshot] = await Promise.all([
      tenantRef.get(),
      tenantRef.collection('products').where('active', '==', true).count().get(),
    ]);
    const skuValues = Array.from(seen);
    const duplicateSnapshots = await Promise.all(Array.from({ length: Math.ceil(skuValues.length / 30) }, (_, index) => tenantRef.collection('products').where('sku', 'in', skuValues.slice(index * 30, index * 30 + 30)).get()));
    const existing = new Set(duplicateSnapshots.flatMap((snapshot) => snapshot.docs.map((doc) => String(doc.data().sku || '').toUpperCase())));
    const duplicate = rows.find((row) => existing.has(row.sku));
    if (duplicate) return NextResponse.json({ error: `Ya existe un producto con SKU ${duplicate.sku}.` }, { status: 409 });
    assertPlanCapacity(tenantSnapshot.data()?.plan, 'products', activeSnapshot.data().count, rows.length);
    const now = new Date();
    const batch = db.batch();
    const refs = rows.map(() => tenantRef.collection('products').doc());
    rows.forEach((row, index) => batch.set(refs[index], { ...row, active: true, createdBy: context.uid, createdAt: now, updatedAt: now }));
    await batch.commit();
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'catalog.imported', entity: 'product', entityId: 'batch', after: { count: rows.length, format: 'csv' }, request: { method: 'POST', path: '/api/catalog/import', requestId: request.headers.get('x-correlation-id') || undefined }, result: 'success' });
    return NextResponse.json({ ok: true, imported: rows.length, ids: refs.map((ref) => ref.id) }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && /^Fila /.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
