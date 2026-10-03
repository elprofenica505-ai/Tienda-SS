import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { NextRequest } from 'next/server';
import { seedMember, startFakeSupabase, type FakeRow, type FakeSupabase } from './helpers/fake-supabase';
import type { DailySummaryContent } from '@/lib/daily-summary';

// Estas pruebas ejecutan las rutas REALES /api/daily-summaries y /api/daily-summaries/settings
// con el cliente real de Supabase apuntando a un servidor local simulado. No tocan ninguna base de datos.

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const SUMMARY_A = '33333333-3333-4333-8333-333333333333';
const OWNER = 'owner-token';
const CASHIER = 'cajero-token';
const OWNER_B = 'owner-b-token';

type RouteModule = typeof import('@/app/api/daily-summaries/route');
type SettingsRouteModule = typeof import('@/app/api/daily-summaries/settings/route');
type CronRouteModule = typeof import('@/app/api/cron/daily-summary/route');

let fake: FakeSupabase;
let route: RouteModule;
let settingsRoute: SettingsRouteModule;
let cronRoute: CronRouteModule;

/** Hora local de Nicaragua (UTC-6) menos 30 minutos, en formato HH:MM: siempre cae dentro de la ventana. */
function tenMinutesAgoInManagua(): string {
  const local = new Date(Date.now() - 6 * 60 * 60 * 1000 - 30 * 60 * 1000);
  return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
}

function summaryContent(overrides: Partial<DailySummaryContent> = {}): DailySummaryContent {
  return {
    tenantId: TENANT_A,
    summaryDate: '2026-10-02',
    timezone: 'America/Managua',
    currency: 'NIO',
    partial: true,
    periodStart: '2026-10-02T06:00:00.000Z',
    periodEnd: '2026-10-03T02:00:00.000Z',
    sales: { total: 12450, returns: 0, net: 12450, count: 34, averageTicket: 366.18 },
    profit: { cogs: 8200, gross: 4250, expenses: 500, estimatedNet: 3750, marginPercent: 34.14 },
    topProducts: [{ productId: 'p-agua', name: 'Agua 600ml', sku: 'A-1', quantity: 48, revenue: 480 }],
    alerts: [{ type: 'low_stock', severity: 'warning', title: 'Stock bajo', count: 2, message: '2 producto(s) por debajo del mínimo configurado.' }],
    comparison: {
      previousDay: { date: '2026-10-01', total: 10200, differencePercent: 22.06 },
      sevenDayAverage: { days: 7, total: 11300, differencePercent: 10.18 },
      sameWeekdayAverage: { weeks: 4, total: 9000, differencePercent: 38.33 },
    },
    ...overrides,
  };
}

function summaryRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: SUMMARY_A,
    tenant_id: TENANT_A,
    summary_date: '2026-10-02',
    period_start: '2026-10-02T06:00:00.000Z',
    period_end: '2026-10-03T02:00:00.000Z',
    timezone: 'America/Managua',
    currency: 'NIO',
    partial: true,
    sales_total: 12450,
    returns_total: 0,
    net_sales: 12450,
    sales_count: 34,
    average_ticket: 366.18,
    cogs_total: 8200,
    gross_profit: 4250,
    margin_percent: 34.14,
    expenses_total: 500,
    estimated_net_profit: 3750,
    top_product: { productId: 'p-agua', name: 'Agua 600ml', quantity: 48 },
    top_products: [],
    alerts: [],
    comparison: {},
    content: summaryContent(),
    message: '',
    whatsapp_status: 'pending',
    whatsapp_provider: null,
    whatsapp_phone: null,
    whatsapp_error: null,
    whatsapp_message_id: null,
    whatsapp_attempts: 0,
    whatsapp_sent_at: null,
    generated_at: '2026-10-03T02:00:00.000Z',
    created_at: '2026-10-03T02:00:00.000Z',
    updated_at: '2026-10-03T02:00:00.000Z',
    ...overrides,
  };
}

function resetData() {
  fake.tables.tenants = [
    { id: TENANT_A, legacy_firestore_id: 'tienda-a', name: 'Pulpería Doña Rosa', timezone: 'America/Managua', currency: 'NIO', status: 'active', platform_status: 'active', subscription_status: 'active' },
    { id: TENANT_B, legacy_firestore_id: 'tienda-b', name: 'Tienda Ajena', timezone: 'America/Managua', currency: 'NIO', status: 'active', platform_status: 'active', subscription_status: 'active' },
  ];
  fake.tables.tenant_settings = [
    {
      id: 'settings-a',
      tenant_id: TENANT_A,
      setting_key: 'daily_summary',
      value: { enabled: true, sendAt: '20:00', timezone: 'America/Managua', mode: 'closing', whatsappEnabled: false, whatsappPhone: '', includeAlerts: true },
      updated_at: '2026-10-01T12:00:00.000Z',
    },
  ];
  fake.tables.daily_summaries = [summaryRow()];
  fake.failTables.clear();
  fake.rpcCalls.length = 0;
  fake.requests.length = 0;
}

function request(path: string, method: string, options: { body?: unknown; token?: string; tenant?: string } = {}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.token ?? OWNER}`,
    'x-tenant-id': options.tenant ?? 'tienda-a',
  };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

function configureWhatsApp() {
  process.env.WHATSAPP_PROVIDER = 'meta';
  process.env.WHATSAPP_ACCESS_TOKEN = 'token-de-prueba';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
}

function clearWhatsApp() {
  delete process.env.WHATSAPP_PROVIDER;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_WHATSAPP_FROM;
}

before(async () => {
  fake = await startFakeSupabase();
  seedMember(fake, { slug: 'tienda-a', tenantUuid: TENANT_A, role: 'owner', token: OWNER, userId: 'user-owner' });
  seedMember(fake, { slug: 'tienda-a', tenantUuid: TENANT_A, role: 'cajero', token: CASHIER, userId: 'user-cajero' });
  seedMember(fake, { slug: 'tienda-b', tenantUuid: TENANT_B, role: 'owner', token: OWNER_B, userId: 'user-owner-b' });
  fake.rpc.generate_daily_summaries = (body: unknown) => {
    const target = (body as { target_tenant_id?: string }).target_tenant_id;
    return {
      body: {
        ok: true,
        summaries: [{
          summaryId: SUMMARY_A,
          tenantId: target,
          summaryDate: '2026-10-02',
          partial: true,
          isNew: false,
          content: summaryContent({ tenantId: target }),
        }],
      },
    };
  };
  fake.rpc.append_audit_log = () => ({ body: 'audit-id' });
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  process.env.RATE_LIMIT_SHARED = 'false';
  clearWhatsApp();
  process.env.CRON_SECRET = 'cron-secret-de-prueba';
  route = await import('@/app/api/daily-summaries/route');
  settingsRoute = await import('@/app/api/daily-summaries/settings/route');
  cronRoute = await import('@/app/api/cron/daily-summary/route');
});

after(async () => {
  await fake.close();
  clearWhatsApp();
});

beforeEach(() => {
  resetData();
  clearWhatsApp();
});

test('GET: el dueño ve la configuración, el estado del WhatsApp y los últimos resúmenes', async () => {
  const response = await route.GET(request('/api/daily-summaries', 'GET'));
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, any>;

  assert.equal(body.ok, true);
  assert.equal(body.settings.sendAt, '20:00');
  assert.equal(body.settings.enabled, true);
  assert.equal(body.configured, true);
  assert.equal(body.tenant.name, 'Pulpería Doña Rosa');
  assert.equal(body.whatsapp.configured, false, 'sin variables de entorno no hay proveedor de WhatsApp');
  assert.equal(body.summaries.length, 1);
  assert.equal(body.summaries[0].id, SUMMARY_A);
  assert.match(String(body.serverNow), /^\d{4}-\d{2}-\d{2}T/);

  // La lectura de los resúmenes siempre va filtrada por la empresa del usuario.
  const reads = fake.requests.filter((item) => item.table === 'daily_summaries');
  assert.ok(reads.length > 0);
  for (const read of reads) assert.match(read.search, new RegExp(`tenant_id=eq\\.${TENANT_A}`));
});

test('GET: un cajero no puede ver el resumen diario', async () => {
  const response = await route.GET(request('/api/daily-summaries', 'GET', { token: CASHIER }));
  assert.equal(response.status, 403);
  const body = await response.json() as Record<string, unknown>;
  assert.match(String(body.error), /administración/i);
});

test('GET: el dueño de otra empresa no ve los resúmenes de mi tienda', async () => {
  const response = await route.GET(request('/api/daily-summaries', 'GET', { token: OWNER_B, tenant: 'tienda-b' }));
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, any>;
  assert.equal(body.tenant.name, 'Tienda Ajena');
  assert.deepEqual(body.summaries, []);
  for (const read of fake.requests.filter((item) => item.table === 'daily_summaries')) {
    assert.match(read.search, new RegExp(`tenant_id=eq\\.${TENANT_B}`));
    assert.doesNotMatch(read.search, new RegExp(TENANT_A));
  }
});

test('POST generate: recalcula con datos reales y guarda el mensaje de WhatsApp', async () => {
  const response = await route.POST(request('/api/daily-summaries', 'POST', { body: { action: 'generate' } }));
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, any>;

  const call = fake.rpcCalls.find((item) => item.name === 'generate_daily_summaries');
  assert.ok(call, 'debe llamar a la función SQL que calcula el resumen');
  assert.equal((call.body as Record<string, unknown>).target_tenant_id, TENANT_A);

  assert.equal(body.generated, true);
  assert.equal(body.summary.id, SUMMARY_A);
  assert.match(body.summary.message, /Resumen del día/);
  assert.match(body.summary.message, /Pulpería Doña Rosa/);
  assert.match(body.summary.message, /Agua 600ml/);
  assert.match(body.summary.message, /Alertas importantes/);
  assert.equal(body.summary.content.tenantName, 'Pulpería Doña Rosa');
});

test('POST generate: un cajero no puede recalcular el resumen', async () => {
  const response = await route.POST(request('/api/daily-summaries', 'POST', { token: CASHIER, body: { action: 'generate' } }));
  assert.equal(response.status, 403);
  assert.equal(fake.rpcCalls.filter((item) => item.name === 'generate_daily_summaries').length, 0);
});

test('POST send: sin proveedor de WhatsApp responde 503 con instrucciones y no marca el envío', async () => {
  const response = await route.POST(request('/api/daily-summaries', 'POST', { body: { action: 'send', summaryId: SUMMARY_A } }));
  assert.equal(response.status, 503);
  const body = await response.json() as Record<string, any>;
  assert.equal(body.code, 'WHATSAPP_NOT_CONFIGURED');
  assert.match(body.error, /WHATSAPP_ACCESS_TOKEN/);
  assert.equal(fake.tables.daily_summaries[0].whatsapp_status, 'pending');
});

test('POST send: con proveedor configurado envía el mensaje y guarda el estado de entrega', async () => {
  configureWhatsApp();
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: string }> = [];
  // Solo se intercepta la llamada al proveedor de WhatsApp; el cliente de Supabase sigue usando el servidor simulado.
  globalThis.fetch = (async (url: any, init: any) => {
    if (String(url).includes('graph.facebook.com')) {
      calls.push({ url: String(url), body: String(init?.body || '') });
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.API' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(url, init);
  }) as typeof fetch;

  try {
    const response = await route.POST(request('/api/daily-summaries', 'POST', { body: { action: 'send', summaryId: SUMMARY_A, phone: '+50588888888' } }));
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, any>;
    assert.equal(body.ok, true);
    assert.equal(body.delivery.status, 'sent');
    assert.equal(body.delivery.phone, '+50588888888');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /graph\.facebook\.com\/v21\.0\/123456\/messages/);
    assert.match(calls[0].body, /"to":"50588888888"/);
    assert.match(calls[0].body, /Resumen del día/);
    assert.equal(fake.tables.daily_summaries[0].whatsapp_status, 'sent');
    assert.equal(fake.tables.daily_summaries[0].whatsapp_sent_at !== null, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST send: rechaza un identificador que no es un resumen válido', async () => {
  configureWhatsApp();
  const response = await route.POST(request('/api/daily-summaries', 'POST', { body: { action: 'send', summaryId: 'no-es-uuid' } }));
  assert.equal(response.status, 400);
});

test('POST: una acción desconocida no se ejecuta', async () => {
  const response = await route.POST(request('/api/daily-summaries', 'POST', { body: { action: 'borrar-todo' } }));
  assert.equal(response.status, 400);
});

test('PUT settings: normaliza hora, zona horaria y teléfono, y deja auditoría', async () => {
  const response = await settingsRoute.PUT(request('/api/daily-summaries/settings', 'PUT', {
    body: { enabled: true, sendAt: '7:05', timezone: 'Zona/Invalida', mode: 'opening', whatsappEnabled: true, whatsappPhone: '505 8888-8888', includeAlerts: false },
  }));
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, any>;
  assert.equal(body.settings.sendAt, '07:05');
  assert.equal(body.settings.timezone, 'America/Managua');
  assert.equal(body.settings.mode, 'opening');
  assert.equal(body.settings.whatsappPhone, '+50588888888');
  assert.equal(body.settings.includeAlerts, false);
  assert.ok(fake.rpcCalls.some((item) => item.name === 'append_audit_log'), 'el cambio de configuración queda auditado');

  const writes = fake.requests.filter((item) => item.table === 'tenant_settings' && item.method === 'POST');
  assert.ok(writes.length > 0, 'la configuración se guarda en tenant_settings');
});

test('GET settings: solo administración puede verla', async () => {
  const forbidden = await settingsRoute.GET(request('/api/daily-summaries/settings', 'GET', { token: CASHIER }));
  assert.equal(forbidden.status, 403);
  const allowed = await settingsRoute.GET(request('/api/daily-summaries/settings', 'GET'));
  assert.equal(allowed.status, 200);
  const body = await allowed.json() as Record<string, any>;
  assert.equal(body.settings.sendAt, '20:00');
});


test('cron: exige el secreto configurado y la cabecera Bearer correcta', async () => {
  const noHeader = await cronRoute.GET(new NextRequest('http://localhost/api/cron/daily-summary', { headers: { Authorization: 'Bearer otro-secreto' } }));
  assert.equal(noHeader.status, 401);

  const previous = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  const withoutSecret = await cronRoute.GET(new NextRequest('http://localhost/api/cron/daily-summary'));
  assert.equal(withoutSecret.status, 503);
  process.env.CRON_SECRET = previous;
});

test('cron: genera y marca el resumen de las empresas cuya hora ya pasó', async () => {
  fake.tables.tenant_settings = [{
    id: 'settings-a',
    tenant_id: TENANT_A,
    setting_key: 'daily_summary',
    value: { enabled: true, sendAt: tenMinutesAgoInManagua(), timezone: 'America/Managua', mode: 'closing', whatsappEnabled: false, whatsappPhone: '', includeAlerts: true },
    updated_at: '2026-10-01T12:00:00.000Z',
  }];

  const response = await cronRoute.GET(new NextRequest('http://localhost/api/cron/daily-summary', {
    headers: { Authorization: 'Bearer cron-secret-de-prueba' },
  }));
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, any>;

  assert.equal(body.ok, true);
  assert.equal(body.report.generated.length, 1);
  assert.equal(body.report.generated[0].tenantId, TENANT_A);
  assert.equal(body.report.delivered[0].status, 'skipped');
  assert.equal(body.report.delivered[0].error, 'WHATSAPP_DISABLED_BY_TENANT');
  assert.equal(fake.tables.daily_summaries[0].whatsapp_status, 'disabled');
  assert.match(String(fake.tables.daily_summaries[0].message), /Resumen del día/);

  // La respuesta del cron nunca filtra datos de otra empresa ni credenciales.
  assert.doesNotMatch(JSON.stringify(body), /token-de-prueba|WHATSAPP_ACCESS_TOKEN/);
});

test('cron: no genera un resumen cuya hora todavía no llega', async () => {
  fake.tables.tenant_settings = [{
    id: 'settings-a',
    tenant_id: TENANT_A,
    setting_key: 'daily_summary',
    value: { enabled: true, sendAt: '23:59', timezone: 'America/Managua', mode: 'closing', whatsappEnabled: true, whatsappPhone: '+50588888888', includeAlerts: true },
    updated_at: '2026-10-01T12:00:00.000Z',
  }];
  fake.tables.daily_summaries[0].message = 'mensaje previo';

  const response = await cronRoute.GET(new NextRequest('http://localhost/api/cron/daily-summary', {
    headers: { Authorization: 'Bearer cron-secret-de-prueba' },
  }));
  const body = await response.json() as Record<string, any>;
  assert.equal(body.report.generated.length, 0);
  assert.equal(body.report.skipped[0].reason, 'NOT_DUE');
  assert.equal(fake.rpcCalls.filter((item) => item.name === 'generate_daily_summaries').length, 0);
});
