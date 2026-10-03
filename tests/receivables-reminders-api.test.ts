import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test, { after, before, beforeEach } from 'node:test';
import { NextRequest } from 'next/server';
import { seedMember, startFakeSupabase, type FakeRow, type FakeSupabase } from './helpers/fake-supabase';
import { addCalendarDays, localDateKey } from '@/lib/receivables-reminders';
import { runReceivablesReminderCycle } from '@/lib/receivables-reminders-service';

type ContactsRouteModule = typeof import('@/app/api/contacts/route');
type ReceivablesRouteModule = typeof import('@/app/api/receivables/route');
type SettingsRouteModule = typeof import('@/app/api/receivables/reminders/settings/route');
type HistoryRouteModule = typeof import('@/app/api/receivables/reminders/route');
type CronRouteModule = typeof import('@/app/api/cron/receivables-reminders/route');
type WebhookRouteModule = typeof import('@/app/api/webhooks/whatsapp/route');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const LEGACY_BRANCH_ID = 'branch-principal';
const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const SALE_ID = '44444444-4444-4444-8444-444444444444';
const RECEIVABLE_ID = '55555555-5555-4555-8555-555555555555';
const OWNER_TOKEN = 'collections-owner-token';
const CASHIER_TOKEN = 'collections-cashier-token';
const CRON_SECRET = 'cron-secret-for-reminders';

let fake: FakeSupabase;
let contactsRoute: ContactsRouteModule;
let receivablesRoute: ReceivablesRouteModule;
let settingsRoute: SettingsRouteModule;
let historyRoute: HistoryRouteModule;
let cronRoute: CronRouteModule;
let webhookRoute: WebhookRouteModule;

function setWhatsAppEnvironment() {
  process.env.WHATSAPP_PROVIDER = 'meta';
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-access-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
  process.env.WHATSAPP_REMINDER_TEMPLATE_NAME = 'conexiax_cobranza';
  process.env.WHATSAPP_REMINDER_TEMPLATE_LANGUAGE = 'es';
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'webhook-verify-test';
  process.env.WHATSAPP_APP_SECRET = 'meta-app-secret-test';
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.RATE_LIMIT_SHARED = 'false';
}

function clearWhatsAppEnvironment() {
  for (const key of [
    'WHATSAPP_PROVIDER', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_REMINDER_TEMPLATE_NAME', 'WHATSAPP_REMINDER_TEMPLATE_LANGUAGE',
    'WHATSAPP_WEBHOOK_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET', 'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM', 'TWILIO_WHATSAPP_REMINDER_CONTENT_SID',
    'APP_URL', 'NEXT_PUBLIC_APP_URL',
  ]) delete process.env[key];
}

function resetData() {
  const current = new Date();
  fake.tables.tenants = [{
    id: TENANT_ID,
    legacy_firestore_id: 'tienda-cobranza',
    slug: 'tienda-cobranza',
    name: 'Tienda Central',
    timezone: 'America/Managua',
    currency: 'NIO',
    status: 'active',
    platform_status: 'active',
    subscription_status: 'active',
  }];
  fake.tables.profiles = [
    { id: 'profile-owner', auth_user_id: 'owner-user', email: 'owner@example.test', display_name: 'Dueña' },
    { id: 'profile-cashier', auth_user_id: 'cashier-user', email: 'cashier@example.test', display_name: 'Cajera' },
  ];
  fake.tables.members = [
    { id: 'member-owner', tenant_id: TENANT_ID, profile_id: 'profile-owner', role: 'owner', status: 'active' },
    { id: 'member-cashier', tenant_id: TENANT_ID, profile_id: 'profile-cashier', role: 'cajero', status: 'active' },
  ];
  fake.tables.member_branches = [];
  fake.tables.tenant_settings = [{
    id: 'daily-summary-settings',
    tenant_id: TENANT_ID,
    setting_key: 'daily_summary',
    value: { whatsappEnabled: true, whatsappPhone: '+505 8888 0000' },
    updated_at: current.toISOString(),
  }];
  fake.tables.customers = [];
  fake.tables.sales = [];
  fake.tables.receivables = [];
  fake.tables.receivable_reminder_logs = [];
  fake.tables.receivable_payments = [];
  fake.tables.cash_sessions = [];
  fake.tables.branches = [{ id: BRANCH_ID, legacy_firestore_id: LEGACY_BRANCH_ID, tenant_id: TENANT_ID, name: 'Principal', active: true }];
  fake.failTables.clear();
  fake.rpcCalls.length = 0;
  fake.requests.length = 0;
}

function addDebt(options: { dueDate: string; optIn?: boolean; balance?: number } ) {
  const balance = options.balance ?? 125;
  const customer = {
    id: CUSTOMER_ID,
    name: 'Lucía Pérez',
    phone: '+505 8888 7777',
    whatsapp_opt_in: options.optIn ?? true,
    active: true,
  };
  const sale = { id: SALE_ID, branch_id: BRANCH_ID, invoice_number: 'F-001', total: 125, created_at: new Date().toISOString() };
  fake.tables.customers.push({ tenant_id: TENANT_ID, ...customer });
  fake.tables.sales.push({ tenant_id: TENANT_ID, ...sale });
  fake.tables.receivables.push({
    id: RECEIVABLE_ID,
    tenant_id: TENANT_ID,
    customer_id: CUSTOMER_ID,
    sale_id: SALE_ID,
    original_amount: 125,
    outstanding_amount: balance,
    status: 'open',
    due_date: options.dueDate,
    created_at: new Date().toISOString(),
    customers: customer,
    sales: sale,
  });
}

function reminderSettings(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    firstReminderDays: 3,
    frequencyDays: 3,
    messageTemplate: 'Hola {nombre}, recuerda {monto} de {empresa}, factura {factura}, con vencimiento {vencimiento}.',
    ownerAlertsEnabled: true,
    ownerWhatsappPhone: '',
    ...overrides,
  };
}

function setReminderSettings(value = reminderSettings()) {
  fake.tables.tenant_settings.push({
    id: 'reminder-settings',
    tenant_id: TENANT_ID,
    setting_key: 'receivables_reminders',
    value,
    updated_at: new Date().toISOString(),
  });
}

function request(path: string, method = 'GET', options: { body?: unknown; token?: string; tenant?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = {
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.tenant ? { 'x-tenant-id': options.tenant } : {}),
    ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(options.headers || {}),
  };
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
  });
}

before(async () => {
  fake = await startFakeSupabase();
  seedMember(fake, { slug: 'tienda-cobranza', tenantUuid: TENANT_ID, role: 'owner', token: OWNER_TOKEN, userId: 'owner-user' });
  seedMember(fake, { slug: 'tienda-cobranza', tenantUuid: TENANT_ID, role: 'cajero', token: CASHIER_TOKEN, userId: 'cashier-user' });
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  process.env.RATE_LIMIT_SHARED = 'false';
  setWhatsAppEnvironment();
  fake.rpc.append_audit_log = () => ({ body: 'audit-entry' });
  contactsRoute = await import('@/app/api/contacts/route');
  receivablesRoute = await import('@/app/api/receivables/route');
  settingsRoute = await import('@/app/api/receivables/reminders/settings/route');
  historyRoute = await import('@/app/api/receivables/reminders/route');
  cronRoute = await import('@/app/api/cron/receivables-reminders/route');
  webhookRoute = await import('@/app/api/webhooks/whatsapp/route');
});

after(async () => {
  clearWhatsAppEnvironment();
  await fake.close();
});

beforeEach(() => {
  resetData();
  setWhatsAppEnvironment();
});

test('la ficha del cliente persiste la autorización de WhatsApp que habilita los avisos', async () => {
  const response = await contactsRoute.POST(request('/api/contacts', 'POST', {
    token: OWNER_TOKEN,
    tenant: 'tienda-cobranza',
    body: { type: 'customer', name: 'Cliente con consentimiento', phone: '+50588889999', whatsappOptIn: true, creditLimit: 500, creditEnabled: true },
  }));
  assert.equal(response.status, 201);
  assert.equal(fake.tables.customers[0].whatsapp_opt_in, true);
});

test('GET cartera conserva el formato paginado y expone el estado de vencimiento', async () => {
  const today = localDateKey(new Date(), 'America/Managua');
  addDebt({ dueDate: addCalendarDays(today, -1) });
  const response = await receivablesRoute.GET(request('/api/receivables?page=1', 'GET', { token: OWNER_TOKEN, tenant: 'tienda-cobranza' }));
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, any>;
  assert.equal(body.sales[0].dueStatus, 'overdue');
  assert.equal(body.sales[0].dueStatusLabel, 'Vencida');
  assert.equal(body.pagination.page, 1);
  assert.equal(body.pagination.total, 1);
  assert.equal(body.pagination.hasMoreSales, false);
});

test('el abono FIFO queda limitado a las cuentas de la sucursal activa', async () => {
  addDebt({ dueDate: addCalendarDays(localDateKey(new Date(), 'America/Managua'), -1) });
  fake.rpc.register_receivable_payment_idempotent = (body) => ({ body: { paymentId: 'payment-1', ...(body as Record<string, unknown>) } });
  const response = await receivablesRoute.POST(request('/api/receivables', 'POST', {
    token: OWNER_TOKEN,
    tenant: 'tienda-cobranza',
    headers: { 'x-branch-id': LEGACY_BRANCH_ID, 'idempotency-key': 'branch-fifo-payment-1' },
    body: { customerId: CUSTOMER_ID, amount: 40, paymentMethod: 'transfer' },
  }));
  assert.equal(response.status, 201);
  const call = fake.rpcCalls.find((item) => item.name === 'register_receivable_payment_idempotent');
  assert.deepEqual((call?.body as Record<string, unknown>).target_allocations, [{ receivableId: RECEIVABLE_ID, amount: 40 }]);
});

test('GET settings returns safe defaults and reuses the daily-summary owner number', async () => {
  const response = await settingsRoute.GET(request('/api/receivables/reminders/settings', 'GET', { token: OWNER_TOKEN, tenant: 'tienda-cobranza' }));
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, any>;
  assert.equal(body.settings.enabled, false);
  assert.equal(body.settings.firstReminderDays, 3);
  assert.equal(body.settings.frequencyDays, 3);
  assert.equal(body.settings.ownerWhatsappPhone, '+50588880000');
  assert.equal(body.whatsapp.configured, true);
  assert.equal(body.whatsapp.templateConfigured, true);
});

test('PUT settings normalizes values, persists per tenant, and audits configuration', async () => {
  const response = await settingsRoute.PUT(request('/api/receivables/reminders/settings', 'PUT', {
    token: OWNER_TOKEN,
    tenant: 'tienda-cobranza',
    body: { enabled: true, firstReminderDays: 5, frequencyDays: 4, messageTemplate: 'Hola {nombre}: {monto}', ownerAlertsEnabled: false, ownerWhatsappPhone: '' },
  }));
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, any>;
  assert.equal(body.settings.enabled, true);
  assert.equal(body.settings.firstReminderDays, 5);
  assert.equal(body.settings.frequencyDays, 4);
  assert.equal(body.settings.ownerWhatsappPhone, '+50588880000');
  assert.ok(fake.tables.tenant_settings.some((row) => row.setting_key === 'receivables_reminders'));
  assert.ok(fake.rpcCalls.some((call) => call.name === 'append_audit_log'));
});

test('solo la administración puede cambiar los parámetros de cobranza', async () => {
  const response = await settingsRoute.PUT(request('/api/receivables/reminders/settings', 'PUT', {
    token: CASHIER_TOKEN,
    tenant: 'tienda-cobranza',
    body: reminderSettings(),
  }));
  assert.equal(response.status, 403);
});

test('historial está limitado al tenant y devuelve los estados de envío y respuesta', async () => {
  fake.tables.receivable_reminder_logs.push({
    id: 'log-one', tenant_id: TENANT_ID, branch_id: BRANCH_ID, customer_id: CUSTOMER_ID, receivable_id: RECEIVABLE_ID,
    event_type: 'customer_reminder', status: 'sent', customer_name: 'Lucía Pérez', message: 'Recordatorio de prueba',
    sent_at: new Date().toISOString(), response_at: null, created_at: new Date().toISOString(),
  });
  const response = await historyRoute.GET(request('/api/receivables/reminders', 'GET', { token: OWNER_TOKEN, tenant: 'tienda-cobranza' }));
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, any>;
  assert.equal(body.history.length, 1);
  assert.equal(body.history[0].customer_name, 'Lucía Pérez');
  assert.match(fake.requests.find((item) => item.table === 'receivable_reminder_logs')?.search || '', new RegExp(`tenant_id=eq\\.${TENANT_ID}`));
});

test('cron requiere secreto y envía un recordatorio aprobado una vez por día local', async () => {
  const now = new Date();
  const today = localDateKey(now, 'America/Managua');
  addDebt({ dueDate: addCalendarDays(today, 2), optIn: true });
  setReminderSettings();
  const originalFetch = globalThis.fetch;
  const messages: Array<Record<string, any>> = [];
  globalThis.fetch = (async (url: any, init: any) => {
    if (String(url).includes('graph.facebook.com')) {
      messages.push(JSON.parse(String(init?.body || '{}')) as Record<string, any>);
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.reminder-1' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(url, init);
  }) as typeof fetch;
  try {
    const unauthorized = await cronRoute.GET(request('/api/cron/receivables-reminders', 'GET', { headers: { Authorization: 'Bearer wrong-secret' } }));
    assert.equal(unauthorized.status, 401);

    const response = await cronRoute.GET(request('/api/cron/receivables-reminders', 'GET', { headers: { Authorization: `Bearer ${CRON_SECRET}` } }));
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, any>;
    assert.equal(body.report.reminders, 1);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'template');
    assert.match(messages[0].template.components[0].parameters[0].text, /Lucía Pérez/);
    assert.equal(fake.tables.receivable_reminder_logs[0].status, 'sent');
    assert.equal(fake.tables.receivable_reminder_logs[0].provider_message_id, 'wamid.reminder-1');

    const duplicate = await cronRoute.GET(request('/api/cron/receivables-reminders', 'GET', { headers: { Authorization: `Bearer ${CRON_SECRET}` } }));
    assert.equal(duplicate.status, 200);
    assert.equal(messages.length, 1, 'una segunda corrida del mismo día no vuelve a enviar');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('después de la frecuencia el agente reintenta y alerta por deuda vencida y falta de respuesta', async () => {
  const firstRun = new Date();
  const today = localDateKey(firstRun, 'America/Managua');
  addDebt({ dueDate: addCalendarDays(today, 1), optIn: true });
  setReminderSettings(reminderSettings({ ownerWhatsappPhone: '+50588880000' }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    if (String(url).includes('graph.facebook.com')) return new Response(JSON.stringify({ messages: [{ id: `wamid.${Math.random()}` }] }), { status: 200 });
    return originalFetch(url, init);
  }) as typeof fetch;
  try {
    const first = await runReceivablesReminderCycle({ now: firstRun, tenantId: TENANT_ID });
    assert.equal(first.reminders, 1);
    const later = new Date(firstRun.getTime() + 4 * 86_400_000);
    const second = await runReceivablesReminderCycle({ now: later, tenantId: TENANT_ID });
    assert.equal(second.reminders, 1);
    assert.equal(second.ownerAlerts, 2);
    const events = fake.tables.receivable_reminder_logs.map((row) => row.event_type);
    assert.ok(events.includes('owner_overdue'));
    assert.ok(events.includes('owner_no_response'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('el recordatorio no se envía sin consentimiento registrado en la ficha del cliente', async () => {
  const now = new Date();
  const today = localDateKey(now, 'America/Managua');
  addDebt({ dueDate: addCalendarDays(today, 1), optIn: false });
  setReminderSettings();
  const originalFetch = globalThis.fetch;
  let sent = 0;
  globalThis.fetch = (async (url: any, init: any) => {
    if (String(url).includes('graph.facebook.com')) sent += 1;
    return String(url).includes('graph.facebook.com') ? new Response(JSON.stringify({ messages: [{ id: 'wamid' }] }), { status: 200 }) : originalFetch(url, init);
  }) as typeof fetch;
  try {
    const result = await runReceivablesReminderCycle({ now, tenantId: TENANT_ID });
    assert.equal(result.reminders, 0);
    assert.equal(sent, 0);
    assert.equal(fake.tables.receivable_reminder_logs[0].status, 'skipped');
    assert.equal(fake.tables.receivable_reminder_logs[0].error, 'WHATSAPP_OPT_IN_REQUIRED');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('webhook Meta valida el token y asocia la respuesta sin almacenar el texto', async () => {
  const sentAt = new Date(Date.now() - 60_000).toISOString();
  fake.tables.receivable_reminder_logs.push({
    id: 'log-pending-reply', tenant_id: TENANT_ID, branch_id: BRANCH_ID, customer_id: CUSTOMER_ID, receivable_id: RECEIVABLE_ID,
    event_type: 'customer_reminder', status: 'sent', phone: '+50588887777', message: 'Recordatorio', sent_at: sentAt,
    response_at: null, created_at: sentAt,
  });
  const verification = await webhookRoute.GET(request('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=webhook-verify-test&hub.challenge=challenge-123'));
  assert.equal(verification.status, 200);
  assert.equal(await verification.text(), 'challenge-123');
  const invalid = await webhookRoute.GET(request('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x'));
  assert.equal(invalid.status, 403);

  const payload = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '50588887777', id: 'wamid.reply', timestamp: String(Math.floor(Date.now() / 1000)), text: { body: 'texto que no debe persistir' } }] } }] }] });
  const signature = `sha256=${createHmac('sha256', 'meta-app-secret-test').update(payload).digest('hex')}`;
  const response = await webhookRoute.POST(request('/api/webhooks/whatsapp', 'POST', { body: payload, headers: { 'x-hub-signature-256': signature } }));
  assert.equal(response.status, 200);
  assert.ok(fake.tables.receivable_reminder_logs[0].response_at);
  assert.equal(fake.tables.receivable_reminder_logs[0].response_message_id, 'wamid.reply');
  assert.doesNotMatch(JSON.stringify(fake.tables.receivable_reminder_logs), /texto que no debe persistir/);
});
