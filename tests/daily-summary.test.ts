import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatMoney } from '@/lib/currency';
import {
  DAILY_SUMMARY_SETTINGS_KEY,
  addDaysToDateKey,
  buildDailySummaryMessage,
  formatPercentChange,
  localDateKey,
  normalizeDailySummarySettings,
  normalizeTimeOfDay,
  normalizeWhatsAppPhoneLocal,
  percentChange,
  resolveDailySummarySchedule,
  type DailySummaryContent,
  type DailySummarySettings,
} from '@/lib/daily-summary';
import { getApiPolicy, isPublicApiRoute } from '@/lib/api-policy';
import { isWhatsAppConfigured, normalizeWhatsAppPhone, resolveWhatsAppProvider, sanitizeProviderError, sendWhatsAppText } from '@/lib/whatsapp';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20261002000001_daily_summaries.sql');
const cronRoute = read('app/api/cron/daily-summary/route.ts');
const summaryRoute = read('app/api/daily-summaries/route.ts');
const settingsRoute = read('app/api/daily-summaries/settings/route.ts');
const page = read('app/workspace/daily-summary/page.tsx');
const sidebar = read('components/workspace/WorkspaceSidebar.tsx');
const vercelConfig = read('vercel.json');
const envExample = read('.env.example');
const service = read('lib/daily-summary-service.ts');

const settings: DailySummarySettings = {
  enabled: true,
  sendAt: '20:00',
  timezone: 'America/Managua',
  mode: 'closing',
  whatsappEnabled: true,
  whatsappPhone: '+50588888888',
  includeAlerts: true,
};

const content: DailySummaryContent = {
  tenantName: 'Pulpería Doña Rosa',
  summaryDate: '2026-10-02',
  timezone: 'America/Managua',
  currency: 'NIO',
  partial: true,
  periodStart: '2026-10-02T06:00:00.000Z',
  periodEnd: '2026-10-03T02:00:00.000Z',
  sales: { total: 12450, returns: 450, net: 12000, count: 34, averageTicket: 366.18 },
  profit: { cogs: 8200, gross: 3800, expenses: 500, estimatedNet: 3300, marginPercent: 31.67 },
  topProducts: [{ name: 'Agua 600ml', quantity: 48, revenue: 480 }],
  alerts: [
    { type: 'low_stock', severity: 'warning', title: 'Stock bajo', count: 5, message: '5 producto(s) por debajo del mínimo configurado.' },
    { type: 'overdue_receivables', severity: 'warning', title: 'Créditos vencidos', count: 4, amount: 1200, currency: 'NIO', message: '4 crédito(s) vencido(s).' },
  ],
  comparison: {
    previousDay: { date: '2026-10-01', total: 10200, differencePercent: 17.65 },
    sevenDayAverage: { days: 7, total: 11300, differencePercent: 6.19 },
    sameWeekdayAverage: { weeks: 4, total: 9000, differencePercent: 33.33 },
  },
};

test('la configuración del resumen valida hora, zona horaria y teléfono', () => {
  assert.equal(normalizeTimeOfDay('7:05'), '07:05');
  assert.equal(normalizeTimeOfDay('20:00'), '20:00');
  assert.equal(normalizeTimeOfDay('25:00', '20:00'), '20:00');
  assert.equal(normalizeTimeOfDay('cualquier cosa', '08:30'), '08:30');
  assert.equal(normalizeWhatsAppPhoneLocal('+505 8888-8888'), '+50588888888');
  assert.equal(normalizeWhatsAppPhoneLocal('88888888'), '+88888888');
  assert.equal(normalizeWhatsAppPhoneLocal('123'), '');

  const normalized = normalizeDailySummarySettings({
    enabled: true,
    sendAt: '7:00',
    timezone: 'Zona/Inventada',
    mode: 'opening',
    whatsappEnabled: true,
    whatsappPhone: '505 8888 8888',
    includeAlerts: false,
  });
  assert.equal(normalized.sendAt, '07:00');
  assert.equal(normalized.timezone, 'America/Managua', 'una zona inválida cae al valor por defecto');
  assert.equal(normalized.mode, 'opening');
  assert.equal(normalized.whatsappPhone, '+50588888888');
  assert.equal(normalized.includeAlerts, false);

  const fallback = normalizeDailySummarySettings(null, { ...settings, timezone: 'America/Panama' });
  assert.equal(fallback.timezone, 'America/Panama');
  assert.equal(fallback.sendAt, '20:00');
  assert.equal(DAILY_SUMMARY_SETTINGS_KEY, 'daily_summary');
});

test('la corrida se considera debida solo dentro de la ventana después de la hora local configurada', () => {
  // Managua es UTC-6 todo el año: las 20:00 locales son las 02:00 UTC del día siguiente.
  const onTime = resolveDailySummarySchedule(settings, new Date('2026-10-03T02:00:00Z'), 360);
  assert.equal(onTime.due, true);
  assert.equal(onTime.anchorDate, '2026-10-02');
  assert.equal(onTime.summaryDate, '2026-10-02');
  assert.equal(onTime.partial, true, 'un cierre a las 8:00 pm resume el día en curso');
  assert.equal(onTime.minutesSinceSendTime, 0);

  const late = resolveDailySummarySchedule(settings, new Date('2026-10-03T05:30:00Z'), 360);
  assert.equal(late.due, true, 'dentro de la ventana de gracia todavía se entrega');
  assert.equal(late.minutesSinceSendTime, 210);

  const tooLate = resolveDailySummarySchedule(settings, new Date('2026-10-03T01:30:00Z'), 360);
  assert.equal(tooLate.due, false, 'antes de la hora configurada de hoy el disparo de ayer ya venció');
  assert.equal(tooLate.anchorDate, '2026-10-01');

  const disabled = resolveDailySummarySchedule({ ...settings, enabled: false }, new Date('2026-10-03T02:05:00Z'), 360);
  assert.equal(disabled.due, false);

  const opening = resolveDailySummarySchedule({ ...settings, mode: 'opening', sendAt: '07:00' }, new Date('2026-10-02T13:00:00Z'), 360);
  assert.equal(opening.due, true);
  assert.equal(opening.summaryDate, '2026-10-01', 'el resumen de la mañana cubre el día anterior completo');
  assert.equal(opening.partial, false);
});

test('fechas locales y comparaciones porcentuales son deterministas', () => {
  assert.equal(localDateKey(new Date('2026-10-03T02:00:00Z'), 'America/Managua'), '2026-10-02');
  assert.equal(localDateKey(new Date('2026-10-03T13:00:00Z'), 'America/Managua'), '2026-10-03');
  assert.equal(addDaysToDateKey('2026-03-01', -1), '2026-02-28');
  assert.equal(percentChange(120, 100), 20);
  assert.equal(percentChange(80, 100), -20);
  assert.equal(percentChange(10, 0), null);
  assert.equal(formatPercentChange(20), '+20.0%');
  assert.equal(formatPercentChange(-4.5), '-4.5%');
  assert.equal(formatPercentChange(null), 'sin base de comparación');
});

test('el mensaje de WhatsApp incluye ventas, ganancia, tickets, producto top, comparación y alertas', () => {
  const message = buildDailySummaryMessage({ content, tenantName: 'Pulpería Doña Rosa', appUrl: 'https://conexiax.app' });
  assert.match(message, /Resumen del día/);
  assert.match(message, /Pulpería Doña Rosa/);
  assert.match(message, /parcial hasta las/);
  assert.ok(message.includes(formatMoney(12450, 'NIO')), 'incluye el total vendido');
  assert.match(message, /\*Tickets:\* 34/);
  assert.ok(message.includes(formatMoney(3300, 'NIO')), 'incluye la ganancia aproximada');
  assert.match(message, /Más vendido:\* Agua 600ml — 48 un\./);
  assert.match(message, /Comparación:/);
  assert.ok(message.includes(formatPercentChange(17.65)), 'incluye la variación contra ayer');
  assert.ok(message.includes(formatPercentChange(6.19)), 'incluye la variación contra el promedio');
  assert.match(message, /Alertas importantes \(2\):/);
  assert.match(message, /Stock bajo: 5/);
  assert.match(message, /Créditos vencidos: .*\(4\)/);
  assert.match(message, /ConexiaX · resumen automático · https:\/\/conexiax\.app\/workspace\/daily-summary/);

  const withoutAlerts = buildDailySummaryMessage({ content, includeAlerts: false });
  assert.doesNotMatch(withoutAlerts, /Alertas importantes/);
  assert.match(withoutAlerts, /Más vendido/);

  const empty = buildDailySummaryMessage({
    content: { ...content, sales: { total: 0, returns: 0, net: 0, count: 0, averageTicket: 0 }, profit: { cogs: 0, gross: 0, expenses: 0, estimatedNet: 0, marginPercent: 0 }, topProducts: [], alerts: [], comparison: {} },
  });
  assert.match(empty, /todavía no hay ventas registradas/);
  assert.match(empty, /sin novedades/);
});

test('la tabla de resúmenes es multi-tenant, idempotente y solo la escribe el servidor', () => {
  assert.match(migration, /create table if not exists public\.daily_summaries/);
  assert.match(migration, /unique \(tenant_id, summary_date\)/);
  assert.match(migration, /partial boolean not null default false/);
  assert.match(migration, /whatsapp_status text not null default 'pending'/);
  assert.match(migration, /alter table public\.daily_summaries enable row level security/);
  assert.match(migration, /revoke all on table public\.daily_summaries from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update on table public\.daily_summaries to service_role/);
});

test('el cálculo SQL usa datos reales de ventas, kardex, gastos, cartera y stock', () => {
  assert.match(migration, /create or replace function public\.generate_daily_summaries/);
  assert.match(migration, /if coalesce\(auth\.role\(\), ''\) <> 'service_role' then/);
  assert.match(migration, /s\.status in \('completed', 'returned'\)/);
  assert.match(migration, /m\.reference_type = 'sale'/);
  assert.match(migration, /coalesce\(m\.unit_cost, p\.cost, 0\)/, 'el costo se toma del kardex y cae al costo del producto');
  assert.match(migration, /from public\.expenses e/);
  assert.match(migration, /from public\.receivables r/);
  assert.match(migration, /from public\.payables p/);
  assert.match(migration, /p\.item_type <> 'service'/);
  assert.match(migration, /on conflict \(tenant_id, summary_date\) do update/);
  assert.match(migration, /'previousDay', jsonb_build_object/);
  assert.match(migration, /'sevenDayAverage', jsonb_build_object/);
  assert.match(migration, /grant execute on function public\.generate_daily_summaries\(uuid, date\) to service_role/);
  assert.doesNotMatch(migration, /gemini|generativelanguage|openai/i);
});

test('el cron del resumen exige secreto y reutiliza la lógica compartida', () => {
  assert.match(cronRoute, /process\.env\.CRON_SECRET/);
  assert.match(cronRoute, /timingSafeEqual/);
  assert.match(cronRoute, /runDailySummaryCycle/);
  assert.match(service, /rpc\('generate_daily_summaries'/);
  assert.match(service, /sendWhatsAppText/);
  assert.match(service, /whatsappEnabled/);
  assert.match(service, /generateOnly/);
  assert.equal(isPublicApiRoute('/api/cron/daily-summary', 'GET'), true);
  assert.match(vercelConfig, /"path": "\/api\/cron\/daily-summary"/);
  assert.match(vercelConfig, /"schedule": "0 2 \* \* \*"/);
  assert.match(envExample, /WHATSAPP_ACCESS_TOKEN=/);
  assert.match(envExample, /TWILIO_WHATSAPP_FROM=/);
  assert.match(envExample, /DAILY_SUMMARY_WINDOW_HOURS=/);
});

test('las rutas del módulo exigen tenant, permiso y rol de administración', () => {
  for (const source of [summaryRoute, settingsRoute]) {
    assert.match(source, /requireTenantPermission/);
    assert.doesNotMatch(source, /requireSupabaseTenantPermission/, 'la guarda debe devolver el UUID real de la empresa, no el identificador legado');
    assert.match(source, /tenantErrorResponse/);
    assert.match(source, /MANAGER_ROLES/);
  }
  assert.match(summaryRoute, /isManager\(context\.role\)/);
  assert.match(settingsRoute, /MANAGER_ROLES\.has\(context\.role\)/);
  assert.match(summaryRoute, /action === 'generate'/);
  assert.match(summaryRoute, /action === 'send'/);
  assert.match(summaryRoute, /MANUAL_GENERATE_COOLDOWN_MS/, 'la regeneración manual está limitada por empresa');
  assert.match(settingsRoute, /writeImmutableAudit/);
  assert.match(settingsRoute, /saveDailySummarySettings/);
  assert.deepEqual(getApiPolicy('/api/daily-summaries', 'GET'), { module: 'dashboard', action: 'view' });
  assert.deepEqual(getApiPolicy('/api/daily-summaries', 'POST'), { module: 'dashboard', action: 'create' });
  assert.deepEqual(getApiPolicy('/api/daily-summaries/settings', 'PUT'), { module: 'dashboard', action: 'edit' });
});

test('el módulo se ve dentro del sistema con historial, mensaje y configuración', () => {
  assert.match(page, /Resumen diario automático/);
  assert.match(page, /Generar ahora/);
  assert.match(page, /Enviar por WhatsApp ahora/);
  assert.match(page, /summary-message/);
  assert.match(page, /buildDailySummaryMessage/);
  assert.match(page, /type="time"/);
  assert.match(sidebar, /Resumen diario/);
  assert.match(sidebar, /\/workspace\/daily-summary/);
});

test('WhatsApp soporta Meta y Twilio y nunca rompe si falta configuración', async () => {
  const emptyEnv = {};
  assert.equal(resolveWhatsAppProvider(emptyEnv), null);
  assert.equal(isWhatsAppConfigured(emptyEnv), false);
  assert.equal(resolveWhatsAppProvider({ WHATSAPP_ACCESS_TOKEN: 'x', WHATSAPP_PHONE_NUMBER_ID: '1' }), 'meta');
  assert.equal(resolveWhatsAppProvider({ TWILIO_ACCOUNT_SID: 'a', TWILIO_AUTH_TOKEN: 'b', TWILIO_WHATSAPP_FROM: '+1' }), 'twilio');
  assert.equal(resolveWhatsAppProvider({ WHATSAPP_PROVIDER: 'twilio', WHATSAPP_ACCESS_TOKEN: 'x', WHATSAPP_PHONE_NUMBER_ID: '1' }), null, 'el proveedor pedido debe estar completo');

  assert.equal(normalizeWhatsAppPhone('+505 8888 8888'), '+50588888888');
  assert.equal(normalizeWhatsAppPhone('abc'), '');
  assert.equal(sanitizeProviderError('Bearer abc.def.ghi token inválido').includes('abc.def.ghi'), false);

  const skipped = await sendWhatsAppText({ to: '+50588888888', text: 'hola' });
  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.error, 'WHATSAPP_NOT_CONFIGURED');

  process.env.WHATSAPP_ACCESS_TOKEN = 'token-de-prueba';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
  try {
    let calledUrl = '';
    let calledBody = '';
    const fetchStub = (async (url: string, init: RequestInit) => {
      calledUrl = String(url);
      calledBody = String(init.body);
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.TEST' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    const sent = await sendWhatsAppText({ to: '+50588888888', text: 'resumen', fetchImpl: fetchStub });
    assert.equal(sent.status, 'sent');
    assert.equal(sent.messageId, 'wamid.TEST');
    assert.match(calledUrl, /graph\.facebook\.com\/v21\.0\/123456\/messages/);
    assert.match(calledBody, /"to":"50588888888"/);
  } finally {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  }
});
