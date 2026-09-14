import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
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
    const result = await getSupabaseServer().rpc('import_catalog_products', { target_tenant_id: context.tenantId, target_user_id: context.uid, target_rows: rows });
    if (result.error) throw new Error(result.error.message);
    const data = result.data as { ids?: string[]; count?: number };
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'catalog.imported', entity: 'product', entityId: 'batch', after: { count: data.count || rows.length, format: 'csv' }, request: { method: 'POST', path: '/api/catalog/import', requestId: request.headers.get('x-correlation-id') || undefined }, result: 'success' });
    return NextResponse.json({ ok: true, imported: data.count || rows.length, ids: data.ids || [] }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (/^Fila /.test(message)) return NextResponse.json({ error: message }, { status: 400 });
    if (message.startsWith('DUPLICATE_SKU:')) return NextResponse.json({ error: `Ya existe un producto con SKU ${message.slice(13)}.` }, { status: 409 });
    if (message === 'CATALOG_EMPTY') return NextResponse.json({ error: 'El CSV no contiene productos para importar.' }, { status: 400 });
    if (message === 'CATALOG_TOO_LARGE') return NextResponse.json({ error: 'El archivo supera el máximo de 500 productos.' }, { status: 400 });
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}
