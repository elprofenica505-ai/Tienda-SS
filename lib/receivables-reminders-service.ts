import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServer } from '@/lib/supabase/server';
import {
  addCalendarDays,
  calendarDaysBetween,
  localDateKey,
  normalizeReceivablesReminderSettings,
  RECEIVABLE_REMINDER_SETTINGS_KEY,
  buildReceivableReminderMessage,
  type ReceivablesReminderSettings,
} from '@/lib/receivables-reminders';
import {
  isWhatsAppAutomationConfigured,
  isWhatsAppConfigured,
  normalizeWhatsAppPhone,
  resolveWhatsAppProvider,
  sendWhatsAppAutomatedMessage,
  type WhatsAppSendStatus,
} from '@/lib/whatsapp';

const DAILY_SUMMARY_SETTINGS_KEY = 'daily_summary';
const MAX_TENANTS_PER_RUN = 1_000;
const MAX_RECEIVABLES_PER_TENANT = 1_000;
const MAX_LOGS_PER_TENANT = 5_000;
const INBOUND_MATCH_DAYS = 30;

export type ReminderCycleItem = {
  tenantId: string;
  receivableId: string;
  eventType: ReminderEventType;
  status: WhatsAppSendStatus | 'already_processed';
  error: string | null;
};

export type ReminderCycleReport = {
  ok: boolean;
  ranAt: string;
  consideredTenants: number;
  processedTenants: number;
  reminders: number;
  ownerAlerts: number;
  failed: number;
  skipped: number;
  results: ReminderCycleItem[];
  errors: Array<{ tenantId: string; message: string }>;
};

export type ReminderEventType = 'customer_reminder' | 'owner_overdue' | 'owner_no_response';

type LogRow = {
  id: string;
  tenant_id: string;
  customer_id: string;
  receivable_id: string;
  event_type: ReminderEventType;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  phone: string | null;
  message: string;
  sent_at: string | null;
  response_at: string | null;
  dedupe_key: string;
  created_at: string;
};

type ReceivableRow = {
  id: string;
  tenant_id: string;
  customer_id: string;
  sale_id: string | null;
  original_amount: number;
  outstanding_amount: number;
  status: string;
  due_date: string | null;
  created_at: string;
  customers?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  sales?: Record<string, unknown> | Array<Record<string, unknown>> | null;
};

function relation(value: ReceivableRow['customers'] | ReceivableRow['sales']): Record<string, unknown> {
  if (Array.isArray(value)) return value[0] || {};
  return value && typeof value === 'object' ? value : {};
}

function safeText(value: unknown, max = 300): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function settingValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isDuplicateError(error: unknown): boolean {
  const code = error && typeof error === 'object' ? String((error as { code?: unknown }).code || '') : '';
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message || '');
  return code === '23505' || /duplicate key|unique constraint/i.test(message);
}

function dayCountFrom(dateTime: string | null, timezone: string, today: string): number {
  if (!dateTime) return 0;
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) return 0;
  return calendarDaysBetween(localDateKey(date, timezone), today);
}

export async function loadReceivablesReminderSettings(
  supabase: Pick<SupabaseClient, 'from'>,
  tenantId: string,
): Promise<{ settings: ReceivablesReminderSettings; configured: boolean; updatedAt: string | null }> {
  const result = await supabase
    .from('tenant_settings')
    .select('setting_key,value,updated_at')
    .eq('tenant_id', tenantId)
    .in('setting_key', [RECEIVABLE_REMINDER_SETTINGS_KEY, DAILY_SUMMARY_SETTINGS_KEY]);
  if (result.error) throw new Error(result.error.message);
  const rows = (result.data || []) as Array<{ setting_key: string; value?: unknown; updated_at?: string }>;
  const reminderRow = rows.find((row) => row.setting_key === RECEIVABLE_REMINDER_SETTINGS_KEY);
  const dailySummary = settingValue(rows.find((row) => row.setting_key === DAILY_SUMMARY_SETTINGS_KEY)?.value);
  const fallbackOwnerPhone = safeText(dailySummary.whatsappPhone, 40);
  return {
    settings: normalizeReceivablesReminderSettings(reminderRow?.value, fallbackOwnerPhone),
    configured: Boolean(reminderRow),
    updatedAt: reminderRow?.updated_at || null,
  };
}

export async function saveReceivablesReminderSettings(
  supabase: SupabaseClient,
  tenantId: string,
  raw: unknown,
  updatedBy: string | null,
): Promise<ReceivablesReminderSettings> {
  const previous = await loadReceivablesReminderSettings(supabase, tenantId);
  const settings = normalizeReceivablesReminderSettings(raw, previous.settings.ownerWhatsappPhone);
  const result = await supabase
    .from('tenant_settings')
    .upsert({
      tenant_id: tenantId,
      setting_key: RECEIVABLE_REMINDER_SETTINGS_KEY,
      value: settings,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,setting_key' });
  if (result.error) throw new Error(result.error.message);
  return settings;
}

async function writeReminderEvent(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    branchId: string | null;
    customerId: string;
    receivableId: string;
    customerName: string;
    eventType: ReminderEventType;
    dedupeKey: string;
    phone: string;
    message: string;
    now: Date;
    skipReason?: string;
  },
): Promise<{ status: WhatsAppSendStatus | 'already_processed'; error: string | null }> {
  const existing = await supabase
    .from('receivable_reminder_logs')
    .select('id,status')
    .eq('tenant_id', input.tenantId)
    .eq('dedupe_key', input.dedupeKey)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return { status: 'already_processed', error: null };

  const id = randomUUID();
  const normalizedPhone = normalizeWhatsAppPhone(input.phone);
  const created = await supabase
    .from('receivable_reminder_logs')
    .insert({
      id,
      tenant_id: input.tenantId,
      branch_id: input.branchId,
      customer_id: input.customerId,
      receivable_id: input.receivableId,
      event_type: input.eventType,
      status: 'pending',
      channel: 'whatsapp',
      dedupe_key: input.dedupeKey,
      customer_name: input.customerName,
      phone: normalizedPhone || null,
      message: input.message,
      created_at: input.now.toISOString(),
      updated_at: input.now.toISOString(),
    })
    .select('id')
    .single();
  if (created.error) {
    if (isDuplicateError(created.error)) return { status: 'already_processed', error: null };
    throw new Error(created.error.message);
  }

  const delivery = input.skipReason
    ? {
        status: 'skipped' as const,
        provider: resolveWhatsAppProvider(),
        messageId: null,
        phone: normalizedPhone,
        error: input.skipReason,
      }
    : await sendWhatsAppAutomatedMessage({ to: normalizedPhone, text: input.message });
  const status = delivery.status;
  const updated = await supabase
    .from('receivable_reminder_logs')
    .update({
      status,
      phone: delivery.phone || normalizedPhone || null,
      provider: delivery.provider,
      provider_message_id: delivery.messageId,
      error: delivery.error,
      sent_at: status === 'sent' ? input.now.toISOString() : null,
      updated_at: input.now.toISOString(),
    })
    .eq('tenant_id', input.tenantId)
    .eq('id', id);
  if (updated.error) throw new Error(updated.error.message);
  return { status, error: delivery.error };
}

function addResult(report: ReminderCycleReport, item: ReminderCycleItem) {
  report.results.push(item);
  if (item.status === 'sent') {
    if (item.eventType === 'customer_reminder') report.reminders += 1;
    else report.ownerAlerts += 1;
  } else if (item.status === 'failed') {
    report.failed += 1;
  } else if (item.status === 'skipped') {
    report.skipped += 1;
  }
}

/** Ejecuta un ciclo idempotente para todas las empresas activas o para un tenant de prueba. */
export async function runReceivablesReminderCycle(options: { now?: Date; tenantId?: string } = {}): Promise<ReminderCycleReport> {
  const supabase = getSupabaseServer();
  const now = options.now || new Date();
  const report: ReminderCycleReport = {
    ok: true,
    ranAt: now.toISOString(),
    consideredTenants: 0,
    processedTenants: 0,
    reminders: 0,
    ownerAlerts: 0,
    failed: 0,
    skipped: 0,
    results: [],
    errors: [],
  };

  let tenantQuery = supabase
    .from('tenants')
    .select('id,name,timezone,currency,status')
    .eq('status', 'active')
    .order('id', { ascending: true })
    .limit(MAX_TENANTS_PER_RUN);
  if (options.tenantId) tenantQuery = tenantQuery.eq('id', options.tenantId);
  const tenantsResult = await tenantQuery;
  if (tenantsResult.error) throw new Error(tenantsResult.error.message);
  const tenants = tenantsResult.data || [];
  report.consideredTenants = tenants.length;
  if (tenants.length === 0) return report;

  const settingsByTenant = new Map<string, Map<string, unknown>>();
  const tenantIds = tenants.map((tenant) => String(tenant.id));
  // Dos posibles ajustes por empresa. Se consultan en lotes de 400 para quedar bajo
  // el límite de filas habitual de PostgREST incluso si todas tienen ambos ajustes.
  for (let offset = 0; offset < tenantIds.length; offset += 400) {
    const settingsResult = await supabase
      .from('tenant_settings')
      .select('tenant_id,setting_key,value')
      .in('tenant_id', tenantIds.slice(offset, offset + 400))
      .in('setting_key', [RECEIVABLE_REMINDER_SETTINGS_KEY, DAILY_SUMMARY_SETTINGS_KEY])
      .limit(1_000);
    if (settingsResult.error) throw new Error(settingsResult.error.message);
    for (const row of settingsResult.data || []) {
      const tenantId = String(row.tenant_id || '');
      if (!tenantId) continue;
      const tenantSettings = settingsByTenant.get(tenantId) || new Map<string, unknown>();
      tenantSettings.set(String(row.setting_key || ''), row.value);
      settingsByTenant.set(tenantId, tenantSettings);
    }
  }

  for (const tenant of tenants) {
    const tenantId = String(tenant.id);
    const timezone = safeText(tenant.timezone, 80) || 'America/Managua';
    const rawSettings = settingsByTenant.get(tenantId) || new Map<string, unknown>();
    const reminderSettingsRaw = rawSettings.get(RECEIVABLE_REMINDER_SETTINGS_KEY);
    const dailySummarySettings = settingValue(rawSettings.get(DAILY_SUMMARY_SETTINGS_KEY));
    const settings = normalizeReceivablesReminderSettings(
      reminderSettingsRaw,
      safeText(dailySummarySettings.whatsappPhone, 40),
    );
    if (!settings.enabled) continue;
    report.processedTenants += 1;

    try {
      await processTenant(supabase, tenant, timezone, settings, now, report);
    } catch (error: unknown) {
      report.ok = false;
      report.errors.push({
        tenantId,
        message: (error instanceof Error ? error.message : 'unknown').slice(0, 300),
      });
    }
  }
  return report;
}

async function processTenant(
  supabase: SupabaseClient,
  tenant: Record<string, unknown>,
  timezone: string,
  settings: ReceivablesReminderSettings,
  now: Date,
  report: ReminderCycleReport,
): Promise<void> {
  const tenantId = String(tenant.id);
  const today = localDateKey(now, timezone);
  const eligibleThrough = addCalendarDays(today, settings.firstReminderDays);
  const result = await supabase
    .from('receivables')
    .select('id,tenant_id,customer_id,sale_id,original_amount,outstanding_amount,status,due_date,created_at,customers!inner(id,name,phone,active,whatsapp_opt_in),sales(id,branch_id,invoice_number)')
    .eq('tenant_id', tenantId)
    .in('status', ['open', 'partial'])
    .gt('outstanding_amount', 0)
    .lte('due_date', eligibleThrough)
    .order('due_date', { ascending: true })
    .limit(MAX_RECEIVABLES_PER_TENANT);
  if (result.error) throw new Error(result.error.message);
  const receivables = (result.data || []) as unknown as ReceivableRow[];
  if (!receivables.length) return;

  const receivableIds = receivables.map((row) => row.id).filter(Boolean);
  const historyResult = await supabase
    .from('receivable_reminder_logs')
    .select('id,tenant_id,customer_id,receivable_id,event_type,status,phone,message,sent_at,response_at,dedupe_key,created_at')
    .eq('tenant_id', tenantId)
    .in('receivable_id', receivableIds)
    .order('created_at', { ascending: false })
    .limit(MAX_LOGS_PER_TENANT);
  if (historyResult.error) throw new Error(historyResult.error.message);
  const logs = (historyResult.data || []) as unknown as LogRow[];
  const logsByReceivable = new Map<string, LogRow[]>();
  for (const log of logs) {
    const current = logsByReceivable.get(log.receivable_id) || [];
    current.push(log);
    logsByReceivable.set(log.receivable_id, current);
  }

  for (const receivable of receivables) {
    if (!receivable.due_date) continue;
    const balance = Number(receivable.outstanding_amount || 0);
    if (!(balance > 0)) continue;
    const customer = relation(receivable.customers);
    const sale = relation(receivable.sales);
    const customerId = String(receivable.customer_id || customer.id || '');
    const customerName = safeText(customer.name, 180) || 'Cliente';
    const customerPhone = safeText(customer.phone, 40);
    const normalizedCustomerPhone = normalizeWhatsAppPhone(customerPhone);
    const activeCustomer = customer.active !== false;
    const hasOptIn = customer.whatsapp_opt_in === true;
    const branchId = safeText(sale.branch_id, 128) || null;
    const invoiceNumber = safeText(sale.invoice_number, 80) || safeText(receivable.sale_id, 80) || 'Venta a crédito';
    const overdueDays = Math.max(0, calendarDaysBetween(receivable.due_date, today));
    const dueInDays = calendarDaysBetween(today, receivable.due_date);
    const receivableLogs = logsByReceivable.get(receivable.id) || [];
    const sentCustomerLogs = receivableLogs.filter((log) => log.event_type === 'customer_reminder' && log.status === 'sent' && log.sent_at);
    const latestReminder = sentCustomerLogs
      .sort((left, right) => String(right.sent_at).localeCompare(String(left.sent_at)))[0];
    const daysSinceReminder = latestReminder ? dayCountFrom(latestReminder.sent_at, timezone, today) : Number.POSITIVE_INFINITY;

    // Primer envío: dentro de la ventana configurada antes del vencimiento. Después,
    // la frecuencia se cuenta desde el último envío exitoso (no desde un intento fallido).
    if (dueInDays <= settings.firstReminderDays && daysSinceReminder >= settings.frequencyDays) {
      const message = buildReceivableReminderMessage(settings.messageTemplate, {
        customerName,
        amount: balance,
        currency: safeText(tenant.currency, 8) || 'NIO',
        tenantName: safeText(tenant.name, 180) || 'Tu empresa',
        invoiceNumber,
        dueDate: receivable.due_date,
        overdueDays,
      });
      const delivered = await writeReminderEvent(supabase, {
        tenantId,
        branchId,
        customerId,
        receivableId: receivable.id,
        customerName,
        eventType: 'customer_reminder',
        dedupeKey: `customer-reminder:${receivable.id}:${today}`,
        phone: normalizedCustomerPhone,
        message,
        now,
        skipReason: !activeCustomer
          ? 'CUSTOMER_INACTIVE'
          : !hasOptIn
            ? 'WHATSAPP_OPT_IN_REQUIRED'
            : !normalizedCustomerPhone
              ? 'WHATSAPP_PHONE_INVALID'
              : undefined,
      });
      addResult(report, { tenantId, receivableId: receivable.id, eventType: 'customer_reminder', status: delivered.status, error: delivered.error });
    }

    if (!settings.ownerAlertsEnabled) continue;
    const ownerPhone = settings.ownerWhatsappPhone;
    const ownerOverdueAlreadySent = receivableLogs.some((log) => log.event_type === 'owner_overdue' && log.status === 'sent');
    if (overdueDays > 0 && !ownerOverdueAlreadySent) {
      const message = `Cobranza vencida en ${safeText(tenant.name, 180) || 'tu empresa'}: ${customerName} tiene pendiente ${formatAmount(balance, safeText(tenant.currency, 8) || 'NIO')}, factura ${invoiceNumber}. Venció el ${receivable.due_date} (${overdueDays} día(s) de atraso).`;
      const delivered = await writeReminderEvent(supabase, {
        tenantId,
        branchId,
        customerId,
        receivableId: receivable.id,
        customerName,
        eventType: 'owner_overdue',
        dedupeKey: `owner-overdue:${receivable.id}:${today}`,
        phone: ownerPhone,
        message,
        now,
        skipReason: !ownerPhone ? 'OWNER_WHATSAPP_NOT_CONFIGURED' : undefined,
      });
      addResult(report, { tenantId, receivableId: receivable.id, eventType: 'owner_overdue', status: delivered.status, error: delivered.error });
    }

    const noResponseAlreadySent = receivableLogs.some((log) => log.event_type === 'owner_no_response' && log.status === 'sent');
    const unanswered = sentCustomerLogs.find((log) => !log.response_at && dayCountFrom(log.sent_at, timezone, today) >= settings.frequencyDays);
    if (unanswered && !noResponseAlreadySent) {
      const message = `Sin respuesta del cliente: ${customerName} no ha respondido al recordatorio de la factura ${invoiceNumber} (${formatAmount(balance, safeText(tenant.currency, 8) || 'NIO')}). El primer aviso se envió hace ${dayCountFrom(unanswered.sent_at, timezone, today)} día(s).`;
      const delivered = await writeReminderEvent(supabase, {
        tenantId,
        branchId,
        customerId,
        receivableId: receivable.id,
        customerName,
        eventType: 'owner_no_response',
        dedupeKey: `owner-no-response:${receivable.id}:${today}`,
        phone: ownerPhone,
        message,
        now,
        skipReason: !ownerPhone ? 'OWNER_WHATSAPP_NOT_CONFIGURED' : undefined,
      });
      addResult(report, { tenantId, receivableId: receivable.id, eventType: 'owner_no_response', status: delivered.status, error: delivered.error });
    }
  }
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('es-NI', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export function inboundWhatsAppConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const provider = resolveWhatsAppProvider(env);
  if (provider === 'meta') return Boolean(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() && env.WHATSAPP_APP_SECRET?.trim());
  if (provider === 'twilio') return Boolean(env.TWILIO_AUTH_TOKEN?.trim() && (env.APP_URL?.trim() || env.NEXT_PUBLIC_APP_URL?.trim()));
  return false;
}

/**
 * Asocia una respuesta entrante al hilo abierto más reciente. Si el mismo teléfono tiene
 * recordatorios pendientes en más de una empresa, no adivina el tenant y deja el evento intacto.
 * El contenido de la respuesta nunca se guarda.
 */
export async function recordInboundWhatsAppReply(input: {
  phone: unknown;
  messageId?: string | null;
  receivedAt?: Date;
  supabase?: SupabaseClient;
}): Promise<{ matched: boolean; updated: number; ambiguous: boolean }> {
  const phone = normalizeWhatsAppPhone(input.phone);
  if (!phone) return { matched: false, updated: 0, ambiguous: false };
  const supabase = input.supabase || getSupabaseServer();
  const receivedAt = input.receivedAt || new Date();
  const cutoff = new Date(receivedAt.getTime() - INBOUND_MATCH_DAYS * 86_400_000).toISOString();
  const matches = await supabase
    .from('receivable_reminder_logs')
    .select('id,tenant_id,customer_id,receivable_id,sent_at')
    .eq('event_type', 'customer_reminder')
    .eq('status', 'sent')
    .eq('phone', phone)
    .is('response_at', null)
    .gte('sent_at', cutoff)
    .lte('sent_at', receivedAt.toISOString())
    .order('sent_at', { ascending: false })
    .limit(100);
  if (matches.error) throw new Error(matches.error.message);
  const candidates = matches.data || [];
  const customerThreads = new Map<string, { tenantId: string; customerId: string; logs: Array<Record<string, unknown>> }>();
  for (const row of candidates) {
    const tenantId = String(row.tenant_id || '');
    const customerId = String(row.customer_id || '');
    if (!tenantId || !customerId) continue;
    const key = `${tenantId}:${customerId}`;
    const thread = customerThreads.get(key) || { tenantId, customerId, logs: [] };
    thread.logs.push(row as Record<string, unknown>);
    customerThreads.set(key, thread);
  }
  if (customerThreads.size !== 1) return { matched: false, updated: 0, ambiguous: customerThreads.size > 1 };
  const thread = Array.from(customerThreads.values())[0];
  const ids = thread.logs.map((row) => String(row.id)).filter(Boolean);
  if (!ids.length) return { matched: false, updated: 0, ambiguous: false };
  const update = await supabase
    .from('receivable_reminder_logs')
    .update({
      response_at: receivedAt.toISOString(),
      response_message_id: safeText(input.messageId, 180) || null,
      updated_at: receivedAt.toISOString(),
    })
    .eq('tenant_id', thread.tenantId)
    .in('id', ids)
    .is('response_at', null);
  if (update.error) throw new Error(update.error.message);
  return { matched: true, updated: ids.length, ambiguous: false };
}

export function reminderAutomationStatus() {
  return {
    configured: isWhatsAppConfigured(),
    templateConfigured: isWhatsAppAutomationConfigured(),
    inboundConfigured: inboundWhatsAppConfigured(),
    provider: resolveWhatsAppProvider(),
  };
}
