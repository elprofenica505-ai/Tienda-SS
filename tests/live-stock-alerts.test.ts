import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildLiveStockAlerts,
  fetchLiveStockAlerts,
  formatQuantity,
  mergeStockAlerts,
  prioritizeAlerts,
  type LiveStockAlert,
  type SmartAlertRow,
  type StockProduct,
} from '@/lib/live-stock-alerts';

const NOW = '2026-10-01T15:00:00.000Z';

function product(id: string, name: string, minStock = 5, unit = 'unidad'): StockProduct {
  return { id, name, sku: id.toUpperCase(), unit, minStock };
}

function stored(id: string, alertType: string, overrides: Partial<SmartAlertRow> = {}): SmartAlertRow {
  return {
    id,
    alert_type: alertType,
    severity: 'warning',
    title: 'Guardada',
    message: 'Mensaje guardado',
    metadata: {},
    is_read: false,
    last_detected_at: '2026-09-30T05:59:00.000Z',
    ...overrides,
  };
}

test('formatQuantity quita ceros sobrantes y tolera valores inválidos', () => {
  assert.equal(formatQuantity(2), '2');
  assert.equal(formatQuantity(2.5), '2.5');
  assert.equal(formatQuantity(0.1 + 0.2), '0.3');
  assert.equal(formatQuantity(Number.NaN), '0');
  assert.equal(formatQuantity(Number.POSITIVE_INFINITY), '0');
});

test('buildLiveStockAlerts: stock 0 es agotado, por debajo del mínimo es bajo y justo en el mínimo no alerta', () => {
  const products = [product('a', 'Agotado'), product('b', 'Bajo'), product('c', 'Justo en el mínimo'), product('d', 'Sobrado')];
  const stock = new Map([['a', 0], ['b', 4], ['c', 5], ['d', 6]]);

  const alerts = buildLiveStockAlerts(products, stock);

  assert.deepEqual(alerts.map((alert) => [alert.productId, alert.type, alert.severity]), [
    ['a', 'out_of_stock', 'critical'],
    ['b', 'low_stock', 'warning'],
  ]);
  assert.equal(alerts[1].message, 'Stock actual: 4 unidad; mínimo configurado: 5.');
});

test('buildLiveStockAlerts: un producto sin filas de stock cuenta como agotado, y sin mínimo no menciona el mínimo', () => {
  const alerts = buildLiveStockAlerts([product('x', 'Sin filas', 0, 'caja')], new Map());

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, 'out_of_stock');
  assert.equal(alerts[0].message, 'Stock agotado (0 caja).');
});

test('buildLiveStockAlerts: con mínimo 0 un producto con existencias nunca alerta; stock negativo se trata como agotado', () => {
  const products = [product('a', 'Con existencias', 0), product('b', 'Negativo', 5)];
  const alerts = buildLiveStockAlerts(products, new Map([['a', 1], ['b', -3]]));

  assert.deepEqual(alerts.map((alert) => alert.productId), ['b']);
  assert.equal(alerts[0].metadata.stock, 0);
});

test('buildLiveStockAlerts: agotados primero, luego stock bajo, cada grupo por nombre; nombres vacíos no rompen', () => {
  const products = [product('1', 'Zapato'), product('2', 'Árbol'), product('3', 'Mesa'), product('4', '   ')];
  const stock = new Map([['1', 0], ['2', 0], ['3', 2], ['4', 1]]);

  const titles = buildLiveStockAlerts(products, stock).map((alert) => alert.title);

  assert.deepEqual(titles, ['Sin stock: Árbol', 'Sin stock: Zapato', 'Stock bajo: Mesa', 'Stock bajo: Producto']);
});

test('buildLiveStockAlerts: cantidades decimales se muestran sin ceros de más', () => {
  const alerts = buildLiveStockAlerts([product('k', 'Azúcar', 10, 'kg')], new Map([['k', 2.5]]));
  assert.equal(alerts[0].message, 'Stock actual: 2.5 kg; mínimo configurado: 10.');
});

test('mergeStockAlerts: si no se pudo revisar el stock en vivo se devuelven las alertas guardadas sin cambios', () => {
  const rows = [stored('a', 'low_stock', { metadata: { productId: 'p1' } }), stored('b', 'sales_comparison')];
  const merged = mergeStockAlerts(rows, null, NOW);

  assert.deepEqual(merged, rows);
  assert.notEqual(merged, rows, 'devuelve una copia, no el mismo arreglo');
});

test('mergeStockAlerts: una alerta de stock guardada sin productId no se puede verificar y se conserva', () => {
  const rows = [stored('a', 'low_stock', { metadata: null }), stored('b', 'low_stock', { metadata: { other: 1 } })];
  assert.deepEqual(mergeStockAlerts(rows, [], NOW).map((row) => row.id), ['a', 'b']);
});

test('mergeStockAlerts: filas guardadas duplicadas del mismo producto no producen alertas duplicadas', () => {
  const live: LiveStockAlert[] = buildLiveStockAlerts([product('p1', 'Galletas')], new Map([['p1', 2]]));
  const rows = [
    stored('first', 'low_stock', { metadata: { productId: 'p1' }, is_read: true }),
    stored('second', 'low_stock', { metadata: { productId: 'p1' } }),
  ];

  const merged = mergeStockAlerts(rows, live, NOW);

  assert.deepEqual(merged.map((row) => row.id), ['first']);
  assert.equal(merged[0].is_read, true);
});

test('mergeStockAlerts: una fila guardada de agotado (si existiera) también se actualiza y conserva su estado', () => {
  const live = buildLiveStockAlerts([product('p1', 'Coca')], new Map([['p1', 0]]));
  const rows = [stored('keep', 'out_of_stock', { metadata: { productId: 'p1' }, is_read: true, severity: 'critical' })];

  const merged = mergeStockAlerts(rows, live, NOW);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'keep');
  assert.equal(merged[0].is_read, true);
  assert.equal(merged[0].title, 'Sin stock: Coca');
  assert.equal(merged[0].live, undefined);
});

test('mergeStockAlerts: las alertas nuevas en vivo salen sin leer, marcadas como en vivo y con la hora de revisión', () => {
  const live = buildLiveStockAlerts([product('p1', 'Coca')], new Map([['p1', 0]]));

  const [row] = mergeStockAlerts([], live, NOW);

  assert.equal(row.id, 'live:out_of_stock:p1');
  assert.equal(row.live, true);
  assert.equal(row.is_read, false);
  assert.equal(row.last_detected_at, NOW);
  assert.equal(row.alert_type, 'out_of_stock');
});

test('prioritizeAlerts: críticas primero, luego sin leer, luego las más recientes; no modifica la lista original', () => {
  const rows = [
    stored('old-unread-warning', 'low_stock', { last_detected_at: '2026-09-01T00:00:00.000Z' }),
    stored('new-read-warning', 'low_stock', { is_read: true, last_detected_at: '2026-09-30T00:00:00.000Z' }),
    stored('info', 'sales_comparison', { severity: 'info', last_detected_at: '2026-10-01T00:00:00.000Z' }),
    stored('critical-old', 'out_of_stock', { severity: 'critical', is_read: true, last_detected_at: '2026-08-01T00:00:00.000Z' }),
    stored('new-unread-warning', 'low_stock', { last_detected_at: '2026-09-30T00:00:00.000Z' }),
  ];
  const before = rows.map((row) => row.id);

  const ordered = prioritizeAlerts(rows).map((row) => row.id);

  assert.deepEqual(ordered, ['critical-old', 'new-unread-warning', 'old-unread-warning', 'new-read-warning', 'info']);
  assert.deepEqual(rows.map((row) => row.id), before);
});

// Cliente mínimo que no informa el total de filas (sin "count"), para probar el camino alterno.
function clientWithoutCount(tables: Record<string, Array<Record<string, unknown>>>, count?: number) {
  return {
    from: (table: string) => {
      const rows = tables[table] || [];
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'neq', 'order']) builder[method] = () => builder;
      builder.range = (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null, count });
      return builder;
    },
  } as unknown as Pick<SupabaseClient, 'from'>;
}

test('fetchLiveStockAlerts: sin total informado, una página incompleta marca el final (y un total inválido se ignora)', async () => {
  const products = Array.from({ length: 1200 }, (_, index) => ({ id: `p${index}`, name: `Producto ${index}`, sku: `S${index}`, unit: 'unidad', min_stock: 5 }));
  const stocks = products.map((item, index) => ({ product_id: item.id, warehouse_id: 'w1', quantity: index === 1199 ? 0 : 9 }));
  const tables = { warehouses: [{ id: 'w1' }], products, inventory_stocks: stocks };

  for (const count of [undefined, Number.NaN]) {
    const alerts = await fetchLiveStockAlerts(clientWithoutCount(tables, count), 'tenant');
    assert.deepEqual(alerts.map((alert) => alert.productId), ['p1199']);
  }
});

test('fetchLiveStockAlerts: sin almacenes activos no se inventan alertas', async () => {
  const tables = {
    warehouses: [],
    products: [{ id: 'p1', name: 'Coca', sku: 'C', unit: 'unidad', min_stock: 5 }],
    inventory_stocks: [],
  };
  assert.deepEqual(await fetchLiveStockAlerts(clientWithoutCount(tables), 'tenant'), []);
});
