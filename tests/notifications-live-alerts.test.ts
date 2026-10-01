import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { NextRequest } from 'next/server';
import { seedMember, startFakeSupabase, type FakeRow, type FakeSupabase } from './helpers/fake-supabase';

// Estas pruebas ejecutan la ruta REAL /api/notifications con el cliente real de Supabase,
// apuntando a un servidor local simulado. No tocan ninguna base de datos.

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const WAREHOUSE_A = 'warehouse-a';
const WAREHOUSE_A_OFF = 'warehouse-a-inactive';
const WAREHOUSE_B = 'warehouse-b';

type RouteModule = typeof import('@/app/api/notifications/route');
type Notice = Record<string, any>;
type ListBody = { ok: boolean; notifications: Notice[]; activeAlertsCount: number; liveStock: { ok: boolean; checkedAt: string | null; error: string | null } | null };

let fake: FakeSupabase;
let route: RouteModule;

function product(id: string, name: string, extra: FakeRow = {}): FakeRow {
  return { id, tenant_id: TENANT_A, name, sku: id.toUpperCase(), unit: 'unidad', min_stock: 5, active: true, item_type: 'physical', ...extra };
}

function stock(productId: string, quantity: number, warehouseId = WAREHOUSE_A, tenantId = TENANT_A): FakeRow {
  return { id: `stock-${productId}-${warehouseId}`, tenant_id: tenantId, product_id: productId, warehouse_id: warehouseId, quantity };
}

function storedAlert(id: string, alertType: string, extra: FakeRow = {}): FakeRow {
  return {
    id,
    tenant_id: TENANT_A,
    alert_key: `${alertType}:${id}`,
    alert_type: alertType,
    severity: 'warning',
    title: 'Alerta guardada',
    message: 'Mensaje guardado',
    metadata: {},
    is_active: true,
    is_read: false,
    last_detected_at: '2026-09-30T05:59:00.000Z',
    read_at: null,
    read_by: null,
    ...extra,
  };
}

function resetData() {
  fake.tables.warehouses = [
    { id: WAREHOUSE_A, tenant_id: TENANT_A, active: true },
    { id: WAREHOUSE_A_OFF, tenant_id: TENANT_A, active: false },
    { id: WAREHOUSE_B, tenant_id: TENANT_B, active: true },
  ];
  fake.tables.products = [
    product('p-agotado', 'Coca Cola 600ml'),
    product('p-bajo', 'Galletas Ritz'),
    product('p-normal', 'Arroz 1lb'),
    product('p-servicio', 'Delivery', { item_type: 'service' }),
    product('p-archivado', 'Producto viejo', { active: false }),
    product('p-ajeno', 'Producto de otra tienda', { tenant_id: TENANT_B }),
  ];
  fake.tables.inventory_stocks = [
    stock('p-agotado', 0),
    stock('p-bajo', 3),
    stock('p-bajo', 50, WAREHOUSE_A_OFF), // almacén inactivo: no cuenta
    stock('p-normal', 20),
    stock('p-archivado', 0),
    stock('p-ajeno', 0, WAREHOUSE_B, TENANT_B),
  ];
  fake.tables.daily_smart_alerts = [];
  fake.tables.notifications = [];
  fake.failTables.clear();
  fake.maxRows = undefined;
  fake.rpcCalls.length = 0;
  fake.requests.length = 0;
}

function request(method: string, options: { body?: unknown; token?: string; tenant?: string } = {}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.token ?? 'owner-token'}`,
    'x-tenant-id': options.tenant ?? 'tienda-a',
  };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest('http://localhost/api/notifications', {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function list(options: { token?: string; tenant?: string } = {}) {
  const response = await route.GET(request('GET', options));
  assert.equal(response.status, 200);
  return (await response.json()) as ListBody;
}

before(async () => {
  fake = await startFakeSupabase();
  seedMember(fake, { slug: 'tienda-a', tenantUuid: TENANT_A, role: 'owner', token: 'owner-token', userId: 'user-owner' });
  seedMember(fake, { slug: 'tienda-a', tenantUuid: TENANT_A, role: 'cajero', token: 'cajero-token', userId: 'user-cajero' });
  seedMember(fake, { slug: 'tienda-b', tenantUuid: TENANT_B, role: 'owner', token: 'owner-b-token', userId: 'user-owner-b' });
  fake.rpc.generate_daily_smart_alerts = () => ({ body: { ok: true, tenantsProcessed: 2, activeAlerts: 3 } });
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  process.env.RATE_LIMIT_SHARED = 'false';
  route = await import('@/app/api/notifications/route');
});

after(async () => {
  await fake.close();
});

beforeEach(() => {
  resetData();
});

test('GET: un producto agotado hoy aparece al instante como alerta crítica en vivo', async () => {
  const body = await list();
  const live = body.notifications.filter((item) => item.source === 'live_alert');
  const outOfStock = live.filter((item) => item.type === 'out_of_stock');

  assert.deepEqual(outOfStock.map((item) => item.title), ['Sin stock: Coca Cola 600ml']);
  assert.equal(outOfStock[0].severity, 'critical');
  assert.equal(outOfStock[0].read, false);
  assert.match(outOfStock[0].message, /Stock agotado \(0 unidad\)\. Mínimo configurado: 5\./);
  assert.equal(outOfStock[0].metadata.productId, 'p-agotado');
  assert.equal(body.liveStock?.ok, true);
  assert.match(String(body.liveStock?.checkedAt), /^\d{4}-\d{2}-\d{2}T/);
});

test('GET: el stock bajo se avisa en vivo y solo cuenta almacenes activos de la empresa', async () => {
  const body = await list();
  const low = body.notifications.filter((item) => item.type === 'low_stock');

  // p-bajo tiene 3 en el almacén activo (y 50 en uno inactivo, que no cuenta).
  assert.deepEqual(low.map((item) => item.title), ['Stock bajo: Galletas Ritz']);
  assert.equal(low[0].severity, 'warning');
  assert.equal(low[0].message, 'Stock actual: 3 unidad; mínimo configurado: 5.');
  assert.equal(low[0].source, 'live_alert');
});

test('GET: cada lectura de la base se limita a la empresa del usuario (nunca se leen datos de otras tiendas)', async () => {
  fake.requests.length = 0;
  await list();

  for (const table of ['warehouses', 'products', 'inventory_stocks', 'daily_smart_alerts', 'notifications']) {
    const reads = fake.requests.filter((item) => item.table === table);
    assert.ok(reads.length > 0, `debe consultar ${table}`);
    for (const read of reads) assert.match(read.search, new RegExp(`tenant_id=eq\\.${TENANT_A}`), `${table} debe filtrar por empresa`);
  }
});

test('GET: no alerta servicios, productos archivados, productos con stock suficiente ni datos de otra empresa', async () => {
  const body = await list();
  const text = JSON.stringify(body.notifications);

  assert.equal(body.activeAlertsCount, 2);
  for (const forbidden of ['Delivery', 'Producto viejo', 'Arroz 1lb', 'Producto de otra tienda']) {
    assert.doesNotMatch(text, new RegExp(forbidden));
  }
});

test('GET: al reponer el stock la alerta desaparece de inmediato, también la guardada que quedó vieja', async () => {
  fake.tables.daily_smart_alerts = [
    storedAlert('stored-old-low', 'low_stock', {
      alert_key: 'low_stock:p-agotado',
      title: 'Stock bajo: Coca Cola 600ml',
      metadata: { productId: 'p-agotado' },
    }),
  ];
  fake.tables.inventory_stocks = [stock('p-agotado', 24), stock('p-bajo', 9), stock('p-normal', 20)];

  const body = await list();

  assert.equal(body.activeAlertsCount, 0);
  assert.equal(body.notifications.length, 0);
});

test('GET: una alerta guardada con la misma condición conserva su id y su estado de lectura, con cifras al día', async () => {
  fake.tables.daily_smart_alerts = [
    storedAlert('stored-low-bajo', 'low_stock', {
      alert_key: 'low_stock:p-bajo',
      title: 'Stock bajo: Galletas Ritz',
      message: 'Stock actual: 4 unidad; mínimo configurado: 5.',
      metadata: { productId: 'p-bajo' },
      is_read: true,
    }),
  ];

  const body = await list();
  const galletas = body.notifications.filter((item) => item.metadata?.productId === 'p-bajo');

  assert.equal(galletas.length, 1, 'no debe duplicarse');
  assert.equal(galletas[0].id, 'stored-low-bajo');
  assert.equal(galletas[0].source, 'daily_alert');
  assert.equal(galletas[0].read, true);
  assert.equal(galletas[0].message, 'Stock actual: 3 unidad; mínimo configurado: 5.');
});

test('GET: si un producto pasa de stock bajo a agotado, la alerta vieja se reemplaza por una crítica sin leer', async () => {
  fake.tables.daily_smart_alerts = [
    storedAlert('stored-low-agotado', 'low_stock', {
      alert_key: 'low_stock:p-agotado',
      title: 'Stock bajo: Coca Cola 600ml',
      metadata: { productId: 'p-agotado' },
      is_read: true,
    }),
  ];

  const body = await list();
  const coca = body.notifications.filter((item) => item.metadata?.productId === 'p-agotado');

  assert.equal(coca.length, 1);
  assert.equal(coca[0].type, 'out_of_stock');
  assert.equal(coca[0].source, 'live_alert');
  assert.equal(coca[0].read, false);
});

test('GET: las demás alertas operativas (créditos vencidos, ventas, sin movimiento) no se tocan', async () => {
  fake.tables.daily_smart_alerts = [
    storedAlert('stored-overdue', 'overdue_receivables', { alert_key: 'overdue_receivables', title: 'Créditos vencidos', severity: 'warning' }),
    storedAlert('stored-sales', 'sales_comparison', { alert_key: 'sales_comparison', title: 'Comparación de ventas', severity: 'info', is_read: true }),
  ];

  const body = await list();
  const byId = new Map(body.notifications.map((item) => [item.id, item]));

  assert.equal(byId.get('stored-overdue')?.source, 'daily_alert');
  assert.equal(byId.get('stored-overdue')?.title, 'Créditos vencidos');
  assert.equal(byId.get('stored-sales')?.read, true);
  assert.equal(body.activeAlertsCount, 4); // 2 guardadas + 2 de stock en vivo
});

test('GET: los roles que no son de administración no ven alertas operativas y no se calcula stock', async () => {
  fake.tables.notifications = [{
    id: 'n-1', tenant_id: TENANT_A, notification_type: 'renewal_upcoming', title: 'Renovación próxima', message: 'Tu plan renueva pronto',
    metadata: {}, is_read: false, created_at: '2026-09-30T10:00:00.000Z', read_at: null, read_by: null,
  }];
  fake.requests.length = 0;

  const body = await list({ token: 'cajero-token' });

  assert.deepEqual(body.notifications.map((item) => item.id), ['n-1']);
  assert.equal(body.activeAlertsCount, 0);
  assert.equal(body.liveStock, null);
  const touched = new Set(fake.requests.map((item) => item.table));
  for (const table of ['products', 'inventory_stocks', 'daily_smart_alerts']) assert.equal(touched.has(table), false, `${table} no debe consultarse`);
});

test('GET: si falla la lectura de stock en vivo se siguen mostrando las alertas guardadas (sin error 500)', async (t) => {
  t.mock.method(console, 'error', () => undefined);
  fake.tables.daily_smart_alerts = [
    storedAlert('stored-low-bajo', 'low_stock', { alert_key: 'low_stock:p-bajo', metadata: { productId: 'p-bajo' } }),
    storedAlert('stored-sales', 'sales_comparison', { alert_key: 'sales_comparison' }),
  ];
  fake.failTables.add('inventory_stocks');

  const body = await list();

  assert.equal(body.liveStock?.ok, false);
  assert.match(String(body.liveStock?.error), /inventory_stocks/);
  assert.deepEqual(body.notifications.map((item) => item.id).sort(), ['stored-low-bajo', 'stored-sales']);
  assert.equal(body.activeAlertsCount, 2);
});

test('GET: una avalancha de alertas de stock no desplaza las notificaciones de la plataforma', async () => {
  fake.tables.notifications = Array.from({ length: 50 }, (_, index) => ({
    id: `n-${index}`, tenant_id: TENANT_A, notification_type: 'payment_failed', title: `Pago ${index}`, message: 'Pago fallido',
    metadata: {}, is_read: false, created_at: `2026-09-${String(10 + (index % 18)).padStart(2, '0')}T10:00:00.000Z`, read_at: null, read_by: null,
  }));
  const many = Array.from({ length: 120 }, (_, index) => product(`p-many-${index}`, `Producto ${String(index).padStart(3, '0')}`));
  fake.tables.products = many;
  fake.tables.inventory_stocks = many.map((item) => stock(String(item.id), 0));

  const body = await list();

  assert.equal(body.notifications.length, 100);
  assert.equal(body.notifications.filter((item) => item.source === 'notification').length, 50);
  assert.equal(body.activeAlertsCount, 120, 'el contador refleja todas las alertas, aunque la lista se limite');
});

test('GET: más de 1000 productos se leen completos por páginas', async () => {
  const many = Array.from({ length: 2300 }, (_, index) => product(`p-big-${index}`, `Producto ${index}`));
  fake.tables.products = many;
  // Solo los 3 últimos están agotados; el resto tiene stock suficiente.
  fake.tables.inventory_stocks = many.map((item, index) => stock(String(item.id), index >= 2297 ? 0 : 50));
  fake.requests.length = 0;

  const body = await list();

  assert.equal(body.activeAlertsCount, 3);
  assert.equal(fake.requests.filter((item) => item.table === 'products').length, 3, '2300 filas = 3 páginas de producto');
  assert.equal(fake.requests.filter((item) => item.table === 'inventory_stocks').length, 3);
});

test('GET: si la API limita cada respuesta a 500 filas, igual se leen todos los productos (sin perder ni inventar agotados)', async () => {
  const many = Array.from({ length: 1300 }, (_, index) => product(`p-cap-${index}`, `Producto ${index}`));
  // Un producto de cada 100 está agotado (13 en total), repartidos por todo el rango leído.
  const depleted = many.filter((_, index) => index % 100 === 0).map((item) => String(item.id)).sort();
  fake.tables.products = many;
  fake.tables.inventory_stocks = many.map((item, index) => stock(String(item.id), index % 100 === 0 ? 0 : 50));
  fake.maxRows = 500;
  fake.requests.length = 0;

  const body = await list();

  const found = body.notifications.filter((item) => item.type === 'out_of_stock').map((item) => String(item.metadata.productId)).sort();
  assert.deepEqual(found, depleted);
  assert.equal(body.activeAlertsCount, 13);
  assert.equal(fake.requests.filter((item) => item.table === 'products').length, 3, '1300 filas con páginas de 500 = 3 lecturas');
  assert.equal(fake.requests.filter((item) => item.table === 'inventory_stocks').length, 3);
});

test('GET: rechaza sesiones inválidas con 401', async () => {
  const response = await route.GET(request('GET', { token: 'token-falso' }));
  assert.equal(response.status, 401);
});

test('POST actualizar: los roles que no son de administración reciben 403 y no se ejecuta nada', async () => {
  const response = await route.POST(request('POST', { token: 'cajero-token', body: { action: 'refresh' } }));
  assert.equal(response.status, 403);
  assert.equal(fake.rpcCalls.length, 0);
});

test('POST actualizar: exige la acción "refresh"', async () => {
  const response = await route.POST(request('POST', { body: { action: 'otra-cosa' } }));
  assert.equal(response.status, 400);
  assert.equal(fake.rpcCalls.length, 0);
});

test('POST actualizar: administración ejecuta la generación de alertas y una segunda pulsación inmediata se limita', async () => {
  const first = await route.POST(request('POST', { body: { action: 'refresh' } }));
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { ok: true, refreshed: true, throttled: false });
  assert.deepEqual(fake.rpcCalls.map((call) => call.name), ['generate_daily_smart_alerts']);

  const second = await route.POST(request('POST', { body: { action: 'refresh' } }));
  assert.equal(second.status, 200);
  const secondBody = await second.json() as { throttled: boolean; refreshed: boolean; retryAfterSeconds: number };
  assert.equal(secondBody.throttled, true);
  assert.equal(secondBody.refreshed, false);
  assert.ok(secondBody.retryAfterSeconds >= 1 && secondBody.retryAfterSeconds <= 30);
  assert.equal(fake.rpcCalls.length, 1, 'no vuelve a ejecutar la generación');
});

test('POST actualizar: no recalcula si alguien lo hizo hace menos de un minuto; si falla, informa y permite reintentar', async (t) => {
  t.mock.method(console, 'error', () => undefined);

  // Alguien (cualquier empresa) generó alertas hace segundos: ya están al día para todos.
  fake.tables.daily_smart_alerts = [storedAlert('fresh', 'sales_comparison', { tenant_id: TENANT_B, last_detected_at: new Date().toISOString() })];
  const fresh = await route.POST(request('POST', { token: 'owner-b-token', tenant: 'tienda-b', body: { action: 'refresh' } }));
  assert.equal(((await fresh.json()) as { throttled: boolean }).throttled, true);
  assert.equal(fake.rpcCalls.length, 0);

  // Datos viejos: ahora sí se ejecuta, y si la base falla se responde con un mensaje claro.
  fake.tables.daily_smart_alerts = [storedAlert('old', 'sales_comparison', { tenant_id: TENANT_B, last_detected_at: '2026-09-01T00:00:00.000Z' })];
  fake.rpc.generate_daily_smart_alerts = () => ({ status: 500, body: { code: 'XX000', message: 'boom', details: null, hint: null } });
  const failed = await route.POST(request('POST', { token: 'owner-b-token', tenant: 'tienda-b', body: { action: 'refresh' } }));
  assert.equal(failed.status, 503);
  assert.match(((await failed.json()) as { error: string }).error, /No se pudieron recalcular las alertas/);

  // Un fallo no activa el límite de espera: el reintento funciona.
  fake.rpc.generate_daily_smart_alerts = () => ({ body: { ok: true } });
  const retry = await route.POST(request('POST', { token: 'owner-b-token', tenant: 'tienda-b', body: { action: 'refresh' } }));
  assert.equal(((await retry.json()) as { refreshed: boolean }).refreshed, true);
  assert.equal(fake.rpcCalls.length, 2);
});

test('PATCH: marcar leída una alerta guardada sigue funcionando; las alertas en vivo explican que se quitan solas', async () => {
  fake.tables.daily_smart_alerts = [storedAlert('stored-sales', 'sales_comparison', { alert_key: 'sales_comparison', severity: 'info' })];

  const live = await route.PATCH(request('PATCH', { body: { id: 'live:out_of_stock:p-agotado', source: 'live_alert' } }));
  assert.equal(live.status, 400);
  assert.match(((await live.json()) as { error: string }).error, /en vivo/);

  const ok = await route.PATCH(request('PATCH', { body: { id: 'stored-sales', source: 'daily_alert' } }));
  assert.equal(ok.status, 200);
  assert.equal(fake.tables.daily_smart_alerts[0].is_read, true);
  assert.equal(fake.tables.daily_smart_alerts[0].read_by, 'user-owner');

  const forbidden = await route.PATCH(request('PATCH', { token: 'cajero-token', body: { id: 'stored-sales', source: 'daily_alert' } }));
  assert.equal(forbidden.status, 403);

  const missing = await route.PATCH(request('PATCH', { body: { id: 'no-existe', source: 'daily_alert' } }));
  assert.equal(missing.status, 404);
});
