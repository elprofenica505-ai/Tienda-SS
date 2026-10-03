import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServer } from '@/lib/supabase/server';
import {
  DAILY_SUMMARY_SETTINGS_KEY,
  DEFAULT_DAILY_SUMMARY_SETTINGS,
  buildDailySummaryMessage,
  isSummaryDateKey,
  normalizeDailySummarySettings,
  resolveDailySummarySchedule,
  type DailySummaryContent,
  type DailySummarySettings,
} from '@/lib/daily-summary';
import { isWhatsAppConfigured, normalizeWhatsAppPhone, sendWhatsAppText, type EnvironmentLike, type WhatsAppSendStatus } from '@/lib/whatsapp';

/**
 * Resumen Diario Automático — capa de servidor.
 *
 * Orquesta tres pasos que son independientes a propósito:
 *  1. calcular métricas con SQL (`generate_daily_summaries`), que es la única fuente de datos;
 *  2. armar el texto del mensaje en TypeScript (`lib/daily-summary.ts`);
 *  3. entregar por WhatsApp (`lib/whatsapp.ts`) y guardar el estado de entrega.
 *
 * Si el paso 3 falla, el resumen ya quedó guardado y visible dentro del sistema.
 */

export const DAILY_SUMMARY_SELECT = [
  'id', 'tenant_id', 'summary_date', 'period_start', 'period_end', 'timezone', 'currency', 'partial',
  'sales_total', 'returns_total', 'net_sales', 'sales_count', 'average_ticket',
  'cogs_total', 'gross_profit', 'margin_percent', 'expenses_total', 'estimated_net_profit',
  'top_product', 'top_products', 'alerts', 'comparison', 'content', 'message',
  'whatsapp_status', 'whatsapp_provider', 'whatsapp_phone', 'whatsapp_error', 'whatsapp_message_id',
  'whatsapp_attempts', 'whatsapp_sent_at', 'generated_at', 'created_at', 'updated_at',
].join(',');

export type DailySummaryRow = {
  id: string;
  tenant_id: string;
  summary_date: string;
  timezone: string;
  currency: string;
  partial: boolean;
  sales_total: number;
  returns_total: number;
  net_sales: number;
  sales_count: number;
  average_ticket: number;
  cogs_total: number;
  gross_profit: number;
  margin_percent: number;
  expenses_total: number;
  estimated_net_profit: number;
  content: DailySummaryContent | null;
  message: string;
  whatsapp_status: string;
  whatsapp_phone: string | null;
  whatsapp_error: string | null;
  whatsapp_sent_at: string | null;
  whatsapp_attempts: number;
  generated_at: string;
  updated_at: string;
  [key: string]: unknown;
};

export type DailySummaryCandidate = {
  tenantId: string;
  tenantName: string;
  timezone: string;
  currency: string;
  settings: DailySummarySettings;
};

export type DailySummaryRunReport = {
  ok: boolean;
  ranAt: string;
  windowMinutes: number;
  considered: number;
  generated: Array<{ tenantId: string; summaryDate: string; partial: boolean; salesTotal: number; salesCount: number }>;
  delivered: Array<{ tenantId: string; summaryDate: string; status: WhatsAppSendStatus | 'already_sent' | 'disabled'; phone: string | null; error: string | null }>;
  skipped: Array<{ tenantId: string; reason: string; summaryDate?: string }>;
  errors: Array<{ tenantId: string; message: string }>;
};

/** Minutos de gracia para entregar un resumen atrasado (DAILY_SUMMARY_WINDOW_HOURS, por defecto 6 h). */
export function dailySummaryWindowMinutes(env: EnvironmentLike = process.env): number {
  const hours = Number(env.DAILY_SUMMARY_WINDOW_HOURS);
  const safeHours = Number.isFinite(hours) && hours > 0 && hours <= 48 ? hours : 6;
  return Math.round(safeHours * 60);
}

function asRow(value: Record<string, unknown>): DailySummaryRow {
  return value as unknown as DailySummaryRow;
}

export async function loadDailySummarySettings(
  supabase: Pick<SupabaseClient, 'from'>,
  tenantId: string,
  tenantTimezone = DEFAULT_DAILY_SUMMARY_SETTINGS.timezone,
): Promise<{ settings: DailySummarySettings; configured: boolean; updatedAt: string | null }> {
  const result = await supabase
    .from('tenant_settings')
    .select('value,updated_at')
    .eq('tenant_id', tenantId)
    .eq('setting_key', DAILY_SUMMARY_SETTINGS_KEY)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  const raw = result.data?.value ?? null;
  const settings = normalizeDailySummarySettings(raw, { ...DEFAULT_DAILY_SUMMARY_SETTINGS, timezone: tenantTimezone });
  return {
    settings,
    configured: Boolean(result.data),
    updatedAt: (result.data?.updated_at as string | undefined) || null,
  };
}

export async function saveDailySummarySettings(
  supabase: SupabaseClient,
  tenantId: string,
  raw: unknown,
  updatedBy: string | null,
  tenantTimezone = DEFAULT_DAILY_SUMMARY_SETTINGS.timezone,
): Promise<DailySummarySettings> {
  const settings = normalizeDailySummarySettings(raw, { ...DEFAULT_DAILY_SUMMARY_SETTINGS, timezone: tenantTimezone });
  const result = await supabase
    .from('tenant_settings')
    .upsert(
      {
        tenant_id: tenantId,
        setting_key: DAILY_SUMMARY_SETTINGS_KEY,
        value: settings,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,setting_key' },
    );
  if (result.error) throw new Error(result.error.message);
  return settings;
}

async function listCandidates(supabase: SupabaseClient, tenantId?: string): Promise<DailySummaryCandidate[]> {
  let settingsRows: Array<{ tenant_id: string; value: unknown }> = [];
  if (tenantId) {
    const single = await supabase
      .from('tenant_settings')
      .select('tenant_id,value')
      .eq('setting_key', DAILY_SUMMARY_SETTINGS_KEY)
      .eq('tenant_id', tenantId);
    if (single.error) throw new Error(single.error.message);
    settingsRows = (single.data || []) as Array<{ tenant_id: string; value: unknown }>;
  } else {
    const all = await supabase
      .from('tenant_settings')
      .select('tenant_id,value')
      .eq('setting_key', DAILY_SUMMARY_SETTINGS_KEY);
    if (all.error) throw new Error(all.error.message);
    settingsRows = (all.data || []) as Array<{ tenant_id: string; value: unknown }>;
  }

  const tenantIds = Array.from(new Set(settingsRows.map((row) => String(row.tenant_id))));
  if (tenantId && !tenantIds.includes(tenantId)) tenantIds.push(tenantId);
  if (tenantIds.length === 0) return [];

  const tenants = await supabase
    .from('tenants')
    .select('id,name,timezone,currency,status')
    .in('id', tenantIds);
  if (tenants.error) throw new Error(tenants.error.message);
  const tenantById = new Map((tenants.data || []).map((row) => [String(row.id), row]));

  return tenantIds
    .map((id) => {
      const tenant = tenantById.get(id);
      if (!tenant || String(tenant.status || 'active') !== 'active') return null;
      const timezone = typeof tenant.timezone === 'string' && tenant.timezone ? tenant.timezone : DEFAULT_DAILY_SUMMARY_SETTINGS.timezone;
      const rawSettings = settingsRows.find((row) => String(row.tenant_id) === id)?.value ?? null;
      return {
        tenantId: id,
        tenantName: String(tenant.name || 'Tu empresa'),
        timezone,
        currency: String(tenant.currency || 'NIO'),
        settings: normalizeDailySummarySettings(rawSettings, { ...DEFAULT_DAILY_SUMMARY_SETTINGS, timezone }),
      } satisfies DailySummaryCandidate;
    })
    .filter((candidate): candidate is DailySummaryCandidate => candidate !== null);
}

type GeneratedSummary = { summaryId: string; tenantId: string; summaryDate: string; partial: boolean; isNew: boolean; content: DailySummaryContent };

async function generateForTenant(supabase: SupabaseClient, tenantId: string, summaryDate?: string): Promise<GeneratedSummary | null> {
  const result = await supabase.rpc('generate_daily_summaries', {
    target_tenant_id: tenantId,
    target_date: summaryDate && isSummaryDateKey(summaryDate) ? summaryDate : null,
  });
  if (result.error) throw new Error(result.error.message);
  const payload = (result.data || {}) as { summaries?: GeneratedSummary[] };
  return payload.summaries?.[0] ?? null;
}

/** Guarda el texto del mensaje (y el nombre de la empresa) en la fila del resumen. */
export async function persistSummaryMessage(
  supabase: SupabaseClient,
  row: DailySummaryRow,
  candidate: Pick<DailySummaryCandidate, 'tenantName'> & { includeAlerts?: boolean },
  appUrl?: string,
): Promise<DailySummaryRow> {
  const content = (row.content || {}) as DailySummaryContent;
  const message = buildDailySummaryMessage({
    content,
    tenantName: candidate.tenantName,
    appUrl,
    includeAlerts: candidate.includeAlerts !== false,
  });
  const result = await supabase
    .from('daily_summaries')
    .update({
      message,
      content: { ...content, tenantName: candidate.tenantName, message },
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', row.tenant_id)
    .eq('id', row.id);
  if (result.error) throw new Error(result.error.message);
  return asRow({ ...row, message, content: { ...content, tenantName: candidate.tenantName, message } });
}

async function setDeliveryState(
  supabase: SupabaseClient,
  row: Pick<DailySummaryRow, 'id' | 'tenant_id' | 'whatsapp_attempts'>,
  patch: Record<string, unknown>,
): Promise<void> {
  const result = await supabase
    .from('daily_summaries')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('tenant_id', row.tenant_id)
    .eq('id', row.id);
  if (result.error) throw new Error(result.error.message);
}

export type DailySummaryDelivery = {
  status: WhatsAppSendStatus | 'already_sent' | 'disabled';
  phone: string | null;
  provider: string | null;
  messageId: string | null;
  error: string | null;
};

/**
 * Entrega un resumen por WhatsApp y deja registro del intento.
 * `automatic` distingue el envío programado (respeta whatsappEnabled) del envío manual del dueño.
 */
export async function deliverDailySummary(
  supabase: SupabaseClient,
  row: DailySummaryRow,
  options: { automatic?: boolean; phone?: string; appUrl?: string } = {},
): Promise<DailySummaryDelivery> {
  const phone = normalizeWhatsAppPhone(options.phone || row.whatsapp_phone || '');
  if (row.whatsapp_status === 'sent') {
    return { status: 'already_sent', phone: row.whatsapp_phone || null, provider: null, messageId: String(row.whatsapp_message_id || '') || null, error: null };
  }
  if (!row.message.trim()) {
    await setDeliveryState(supabase, row, { whatsapp_status: 'failed', whatsapp_error: 'SUMMARY_MESSAGE_EMPTY' });
    return { status: 'failed', phone: phone || null, provider: null, messageId: null, error: 'SUMMARY_MESSAGE_EMPTY' };
  }
  if (!phone) {
    await setDeliveryState(supabase, row, { whatsapp_status: 'failed', whatsapp_error: 'WHATSAPP_PHONE_INVALID', whatsapp_attempts: Number(row.whatsapp_attempts || 0) + 1 });
    return { status: 'failed', phone: null, provider: null, messageId: null, error: 'WHATSAPP_PHONE_INVALID' };
  }

  const result = await sendWhatsAppText({ to: phone, text: row.message });
  const attempts = Number(row.whatsapp_attempts || 0) + 1;
  const status = options.automatic && result.status === 'skipped' ? 'disabled' : result.status;
  await setDeliveryState(supabase, row, {
    whatsapp_status: status,
    whatsapp_provider: result.provider,
    whatsapp_phone: phone,
    whatsapp_error: result.error,
    whatsapp_message_id: result.messageId,
    whatsapp_attempts: attempts,
    whatsapp_sent_at: result.status === 'sent' ? new Date().toISOString() : null,
  });
  return {
    status: status === 'sent' ? 'sent'
      : status === 'skipped' ? 'skipped'
        : status === 'disabled' ? 'disabled'
          : 'failed',
    phone,
    provider: result.provider,
    messageId: result.messageId,
    error: result.error,
  };
}

export async function listDailySummaries(supabase: SupabaseClient, tenantId: string, limit = 30): Promise<DailySummaryRow[]> {
  const result = await supabase
    .from('daily_summaries')
    .select(DAILY_SUMMARY_SELECT)
    .eq('tenant_id', tenantId)
    .order('summary_date', { ascending: false })
    .limit(Math.min(90, Math.max(1, limit)));
  if (result.error) throw new Error(result.error.message);
  return (result.data || []).map((row) => asRow(row as unknown as Record<string, unknown>));
}

export async function findDailySummary(supabase: SupabaseClient, tenantId: string, summaryId: string): Promise<DailySummaryRow | null> {
  const result = await supabase
    .from('daily_summaries')
    .select(DAILY_SUMMARY_SELECT)
    .eq('tenant_id', tenantId)
    .eq('id', summaryId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? asRow(result.data as unknown as Record<string, unknown>) : null;
}

/**
 * Corrida completa del módulo: calcula los resúmenes que corresponden, arma el mensaje y,
 * cuando la empresa lo tiene activado, lo envía por WhatsApp. Se usa tanto en el cron como
 * en el botón «Generar ahora» del sistema (con `generateOnly`).
 */
export async function runDailySummaryCycle(options: {
  now?: Date;
  tenantId?: string;
  date?: string;
  force?: boolean;
  generateOnly?: boolean;
} = {}): Promise<DailySummaryRunReport> {
  const supabase = getSupabaseServer();
  const now = options.now || new Date();
  const windowMinutes = dailySummaryWindowMinutes();
  const report: DailySummaryRunReport = {
    ok: true,
    ranAt: now.toISOString(),
    windowMinutes,
    considered: 0,
    generated: [],
    delivered: [],
    skipped: [],
    errors: [],
  };

  const candidates = await listCandidates(supabase, options.tenantId);
  report.considered = candidates.length;

  for (const candidate of candidates) {
    try {
      const schedule = resolveDailySummarySchedule(candidate.settings, now, windowMinutes);
      const explicitDate = options.date && isSummaryDateKey(options.date) ? options.date : null;
      if (!options.force && !schedule.due) {
        report.skipped.push({
          tenantId: candidate.tenantId,
          summaryDate: explicitDate || schedule.summaryDate,
          reason: candidate.settings.enabled ? 'NOT_DUE' : 'DISABLED',
        });
        continue;
      }

      const summaryDate = explicitDate || schedule.summaryDate;
      const generated = await generateForTenant(supabase, candidate.tenantId, summaryDate);
      if (!generated) {
        report.skipped.push({ tenantId: candidate.tenantId, summaryDate, reason: 'NOT_GENERATED' });
        continue;
      }

      const rows = await supabase
        .from('daily_summaries')
        .select(DAILY_SUMMARY_SELECT)
        .eq('tenant_id', candidate.tenantId)
        .eq('id', generated.summaryId)
        .maybeSingle();
      if (rows.error) throw new Error(rows.error.message);
      if (!rows.data) {
        report.skipped.push({ tenantId: candidate.tenantId, summaryDate, reason: 'SUMMARY_NOT_FOUND' });
        continue;
      }

      let row = asRow(rows.data as unknown as Record<string, unknown>);
      row = await persistSummaryMessage(
        supabase,
        row,
        { tenantName: candidate.tenantName, includeAlerts: candidate.settings.includeAlerts },
        process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL,
      );

      report.generated.push({
        tenantId: candidate.tenantId,
        summaryDate: row.summary_date,
        partial: Boolean(row.partial),
        salesTotal: Number(row.sales_total || 0),
        salesCount: Number(row.sales_count || 0),
      });

      if (options.generateOnly) continue;

      if (!candidate.settings.whatsappEnabled) {
        await setDeliveryState(supabase, row, { whatsapp_status: 'disabled' });
        report.delivered.push({ tenantId: candidate.tenantId, summaryDate: row.summary_date, status: 'skipped', phone: null, error: 'WHATSAPP_DISABLED_BY_TENANT' });
        continue;
      }
      if (!isWhatsAppConfigured()) {
        await setDeliveryState(supabase, row, { whatsapp_status: 'skipped', whatsapp_error: 'WHATSAPP_NOT_CONFIGURED' });
        report.delivered.push({ tenantId: candidate.tenantId, summaryDate: row.summary_date, status: 'skipped', phone: candidate.settings.whatsappPhone || null, error: 'WHATSAPP_NOT_CONFIGURED' });
        continue;
      }

      const delivery = await deliverDailySummary(supabase, row, {
        automatic: true,
        phone: candidate.settings.whatsappPhone,
        appUrl: process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL,
      });
      report.delivered.push({
        tenantId: candidate.tenantId,
        summaryDate: row.summary_date,
        status: delivery.status,
        phone: delivery.phone,
        error: delivery.error,
      });
    } catch (error: unknown) {
      report.ok = false;
      report.errors.push({
        tenantId: candidate.tenantId,
        message: (error instanceof Error ? error.message : 'unknown').slice(0, 300),
      });
    }
  }

  return report;
}

/** Envío manual desde el sistema (botón «Enviar por WhatsApp»). */
export async function sendDailySummaryNow(
  supabase: SupabaseClient,
  tenantId: string,
  summaryId: string,
  phoneOverride?: string,
): Promise<{ row: DailySummaryRow; delivery: DailySummaryDelivery }> {
  const row = await findDailySummary(supabase, tenantId, summaryId);
  if (!row) throw new Error('SUMMARY_NOT_FOUND');
  let ready = row;
  if (!ready.message.trim()) {
    const tenant = await supabase.from('tenants').select('name,timezone').eq('id', tenantId).maybeSingle();
    const { settings } = await loadDailySummarySettings(supabase, tenantId, String(tenant.data?.timezone || DEFAULT_DAILY_SUMMARY_SETTINGS.timezone));
    ready = await persistSummaryMessage(
      supabase,
      ready,
      { tenantName: String(tenant.data?.name || ''), includeAlerts: settings.includeAlerts },
      process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL,
    );
  }
  if (!isWhatsAppConfigured()) throw new Error('WHATSAPP_NOT_CONFIGURED');
  const delivery = await deliverDailySummary(supabase, ready, {
    automatic: false,
    phone: phoneOverride,
    appUrl: process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL,
  });
  const updated = await findDailySummary(supabase, tenantId, summaryId);
  return { row: updated || ready, delivery };
}
