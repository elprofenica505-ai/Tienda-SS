import { formatMoney, normalizeCurrency } from '@/lib/currency';

/**
 * Resumen Diario Automático — lógica pura.
 *
 * Este módulo NO toca la base de datos ni la red: normaliza la configuración de cada empresa,
 * decide si ya es hora de generar el resumen y arma el texto que se envía por WhatsApp.
 * Todo lo que se ve aquí es determinista y por eso se puede probar sin Supabase ni WhatsApp.
 */

export type DailySummaryMode = 'closing' | 'opening';

export type DailySummarySettings = {
  /** Si está apagado, el cron nunca genera ni envía el resumen de esta empresa. */
  enabled: boolean;
  /** Hora local en formato HH:MM (24 h) en la zona horaria de la empresa. */
  sendAt: string;
  /** Zona horaria IANA; por defecto la de la empresa (America/Managua). */
  timezone: string;
  /**
   * closing = resumen del día en curso a la hora configurada (p. ej. 8:00 pm, parcial).
   * opening = resumen del día anterior completo a la hora configurada (p. ej. 7:00 am).
   */
  mode: DailySummaryMode;
  whatsappEnabled: boolean;
  /** Teléfono destino en formato E.164, por ejemplo +50588888888. */
  whatsappPhone: string;
  includeAlerts: boolean;
};

export const DEFAULT_DAILY_SUMMARY_SETTINGS: DailySummarySettings = {
  enabled: false,
  sendAt: '20:00',
  timezone: 'America/Managua',
  mode: 'closing',
  whatsappEnabled: false,
  whatsappPhone: '',
  includeAlerts: true,
};

export const DAILY_SUMMARY_SETTINGS_KEY = 'daily_summary';

export type DailySummaryAlert = {
  type: string;
  severity: 'info' | 'warning' | 'critical' | string;
  title: string;
  count?: number;
  amount?: number;
  currency?: string;
  items?: string[];
  message?: string;
};

export type DailySummaryTopProduct = {
  productId?: string;
  name: string;
  sku?: string;
  quantity: number;
  revenue: number;
};

export type DailySummaryComparison = {
  previousDay?: { date?: string; total?: number; differencePercent?: number | null };
  sevenDayAverage?: { days?: number; total?: number; differencePercent?: number | null };
  sameWeekdayAverage?: { weeks?: number; total?: number; differencePercent?: number | null };
  windowSeconds?: number;
};

export type DailySummaryContent = {
  tenantId?: string;
  tenantName?: string;
  summaryDate: string;
  timezone: string;
  currency: string;
  partial: boolean;
  periodStart?: string;
  periodEnd?: string;
  generatedAt?: string;
  sales: { total: number; returns: number; net: number; count: number; averageTicket: number };
  profit: { cogs: number; gross: number; expenses: number; estimatedNet: number; marginPercent: number };
  topProducts: DailySummaryTopProduct[];
  alerts: DailySummaryAlert[];
  comparison: DailySummaryComparison;
  message?: string;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function numberOr(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isSummaryDateKey(value: unknown): value is string {
  return typeof value === 'string' && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Acepta 'HH:MM' o 'H:MM' y devuelve siempre 'HH:MM'; si no es válido, devuelve el valor por defecto. */
export function normalizeTimeOfDay(value: unknown, fallback = DEFAULT_DAILY_SUMMARY_SETTINGS.sendAt): string {
  if (typeof value === 'string') {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (match) {
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      }
    }
  }
  return fallback;
}

export function parseTimeOfDay(value: unknown): { hour: number; minute: number } | null {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value.trim())) return null;
  const [hour, minute] = value.trim().split(':').map(Number);
  return { hour, minute };
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

/** Normaliza y valida la configuración guardada por la empresa; nunca lanza. */
export function normalizeDailySummarySettings(
  raw: unknown,
  fallback: DailySummarySettings = DEFAULT_DAILY_SUMMARY_SETTINGS,
): DailySummarySettings {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const timezone = isValidTimeZone(source.timezone) ? String(source.timezone).trim() : fallback.timezone;
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : fallback.enabled,
    sendAt: normalizeTimeOfDay(source.sendAt, fallback.sendAt),
    timezone,
    mode: source.mode === 'opening' ? 'opening' : source.mode === 'closing' ? 'closing' : fallback.mode,
    whatsappEnabled: typeof source.whatsappEnabled === 'boolean' ? source.whatsappEnabled : fallback.whatsappEnabled,
    whatsappPhone: normalizeWhatsAppPhoneLocal(source.whatsappPhone) || fallback.whatsappPhone,
    includeAlerts: typeof source.includeAlerts === 'boolean' ? source.includeAlerts : fallback.includeAlerts,
  };
}

/**
 * Teléfono E.164 (+ y hasta 15 dígitos). Se acepta lo que el dueño escriba con espacios,
 * guiones o paréntesis: '8888-8888' → '+88888888' solo si ya trae código de país.
 */
export function normalizeWhatsAppPhoneLocal(value: unknown): string {
  if (typeof value !== 'string') return '';
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const normalized = `+${digits}`;
  return /^\+\d{8,15}$/.test(normalized) ? normalized : '';
}

function localParts(date: Date, timeZone: string): { dateKey: string; minutes: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const dateKey = `${read('year')}-${read('month')}-${read('day')}`;
  const minutes = Number(read('hour')) * 60 + Number(read('minute'));
  return { dateKey, minutes: Number.isFinite(minutes) ? minutes : 0 };
}

/** Fecha local (YYYY-MM-DD) de la empresa para un instante dado. */
export function localDateKey(date: Date, timeZone: string): string {
  return localParts(date, timeZone).dateKey;
}

/** Suma (o resta) días a una fecha YYYY-MM-DD sin depender de la zona horaria del servidor. */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const base = new Date(`${dateKey}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export type DailySummarySchedule = {
  /** true cuando la hora configurada ya pasó y sigue dentro de la ventana de gracia. */
  due: boolean;
  /** Día local en el que se disparó (o se disparará) la hora configurada. */
  anchorDate: string;
  /** Fecha que se resume: el día del disparo (closing) o el día anterior (opening). */
  summaryDate: string;
  /** true si el resumen cubre un día que todavía no terminó (cierre durante el día). */
  partial: boolean;
  minutesSinceSendTime: number;
  windowMinutes: number;
};

/**
 * Decide si corresponde generar/enviar el resumen ahora.
 *
 * La ventana de gracia (`windowMinutes`) existe porque el cron corre por intervalos: si una corrida
 * falla o el cron es diario, el resumen todavía se puede entregar dentro de la ventana en vez de perderse.
 */
export function resolveDailySummarySchedule(
  settings: DailySummarySettings,
  now: Date,
  windowMinutes: number,
): DailySummarySchedule {
  const time = parseTimeOfDay(settings.sendAt) || parseTimeOfDay(DEFAULT_DAILY_SUMMARY_SETTINGS.sendAt)!;
  const sendMinutes = time.hour * 60 + time.minute;
  const { dateKey: todayKey, minutes: nowMinutes } = localParts(now, settings.timezone);

  const firedToday = nowMinutes >= sendMinutes;
  const anchorDate = firedToday ? todayKey : addDaysToDateKey(todayKey, -1);
  const minutesSinceSendTime = firedToday ? nowMinutes - sendMinutes : nowMinutes + 1440 - sendMinutes;
  const safeWindow = Number.isFinite(windowMinutes) && windowMinutes > 0 ? Math.floor(windowMinutes) : 1;
  const due = settings.enabled && minutesSinceSendTime >= 0 && minutesSinceSendTime < safeWindow;

  return {
    due,
    anchorDate,
    summaryDate: settings.mode === 'opening' ? addDaysToDateKey(anchorDate, -1) : anchorDate,
    partial: settings.mode !== 'opening',
    minutesSinceSendTime,
    windowMinutes: safeWindow,
  };
}

export function percentChange(current: number, base: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(base) || base === 0) return null;
  return round2(((current - base) / base) * 100);
}

export function formatPercentChange(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'sin base de comparación';
  const sign = value > 0 ? '+' : '';
  return `${sign}${round2(value).toFixed(1)}%`;
}

const SHORT_DATE = new Intl.DateTimeFormat('es-NI', { day: 'numeric', month: 'short' });
const CLOCK_TIME = new Intl.DateTimeFormat('es-NI', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function capitalized(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/** Convierte '2026-10-02' + zona horaria en 'viernes 2 de octubre' en la zona de la empresa. */
export function formatSummaryLongDate(summaryDate: string, timeZone: string): string {
  if (!isSummaryDateKey(summaryDate)) return summaryDate;
  try {
    // Mediodía UTC: a esa hora la fecha local coincide en cualquier zona de América.
    return new Intl.DateTimeFormat('es-NI', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: isValidTimeZone(timeZone) ? timeZone : 'UTC',
    }).format(new Date(`${summaryDate}T12:00:00.000Z`));
  } catch {
    return summaryDate;
  }
}

function formatShortDate(dateKey: string | undefined): string {
  if (!dateKey || !isSummaryDateKey(dateKey)) return '';
  try {
    return SHORT_DATE.format(new Date(`${dateKey}T12:00:00.000Z`));
  } catch {
    return dateKey;
  }
}

function summaryPeriodLabel(content: DailySummaryContent): string {
  if (!content.partial) return 'día completo';
  const end = content.periodEnd ? new Date(content.periodEnd) : null;
  if (!end || Number.isNaN(end.getTime())) return 'día en curso';
  try {
    return `parcial hasta las ${CLOCK_TIME.format(end)}`;
  } catch {
    return 'día en curso';
  }
}

function quantityLabel(value: number): string {
  const rounded = Math.round(value * 10000) / 10000;
  return `${rounded.toLocaleString('es-NI')} un.`;
}

/**
 * Arma el texto que se envía por WhatsApp (y que también se muestra dentro del sistema).
 * Usa el formato de WhatsApp: *negrita* y _cursiva_.
 */
export function buildDailySummaryMessage(input: {
  content: DailySummaryContent;
  tenantName?: string;
  appUrl?: string;
  /** false = omite el bloque de alertas en el mensaje (la empresa lo tiene desactivado). */
  includeAlerts?: boolean;
}): string {
  const { content } = input;
  const tenantName = (input.tenantName || content.tenantName || '').trim();
  const currency = normalizeCurrency(content.currency);
  const money = (value: number) => formatMoney(numberOr(value), currency);
  const title = `📊 *Resumen del día — ${capitalized(formatSummaryLongDate(content.summaryDate, content.timezone))}*`;
  const subtitle = [tenantName, summaryPeriodLabel(content)].filter(Boolean).join(' · ');

  const sales = content.sales || { total: 0, returns: 0, net: 0, count: 0, averageTicket: 0 };
  const profit = content.profit || { cogs: 0, gross: 0, expenses: 0, estimatedNet: 0, marginPercent: 0 };
  const lines: string[] = [title];
  if (subtitle) lines.push(`_${subtitle}_`);
  lines.push('');

  if (numberOr(sales.count) <= 0) {
    lines.push('*Ventas:* todavía no hay ventas registradas en este período.');
  } else {
    lines.push(`*Ventas:* ${money(sales.total)}`);
    if (numberOr(sales.returns) > 0) lines.push(`*Devoluciones:* ${money(sales.returns)} · *Venta neta:* ${money(sales.net)}`);
    lines.push(`*Tickets:* ${Math.trunc(numberOr(sales.count))} · *Ticket promedio:* ${money(sales.averageTicket)}`);
  }

  const margin = numberOr(profit.marginPercent);
  lines.push(
    `*Ganancia aproximada:* ${money(profit.estimatedNet)}` +
    (margin !== 0 ? ` _(margen bruto ${margin.toFixed(1)}%)_` : '') +
    (numberOr(profit.expenses) > 0 ? ` · _gastos del día ${money(profit.expenses)}_` : ''),
  );

  const top = Array.isArray(content.topProducts) ? content.topProducts[0] : undefined;
  if (top && numberOr(top.quantity) > 0) {
    lines.push('', `*Más vendido:* ${top.name} — ${quantityLabel(numberOr(top.quantity))}`);
  }

  const comparison = content.comparison || {};
  const comparisonLines: string[] = [];
  const previousDay = comparison.previousDay;
  if (previousDay && numberOr(previousDay.total) > 0) {
    const label = formatShortDate(previousDay.date);
    comparisonLines.push(`• Ayer${label ? ` (${label})` : ''}: ${money(numberOr(previousDay.total))} (${formatPercentChange(previousDay.differencePercent)})`);
  }
  if (comparison.sevenDayAverage && numberOr(comparison.sevenDayAverage.total) > 0) {
    comparisonLines.push(`• Promedio ${comparison.sevenDayAverage.days || 7} días: ${money(numberOr(comparison.sevenDayAverage.total))} (${formatPercentChange(comparison.sevenDayAverage.differencePercent)})`);
  }
  if (comparison.sameWeekdayAverage && numberOr(comparison.sameWeekdayAverage.total) > 0) {
    comparisonLines.push(`• Mismo día, últimas ${comparison.sameWeekdayAverage.weeks || 4} semanas: ${money(numberOr(comparison.sameWeekdayAverage.total))} (${formatPercentChange(comparison.sameWeekdayAverage.differencePercent)})`);
  }
  if (comparisonLines.length > 0) {
    lines.push('', '*Comparación:*', ...comparisonLines);
  }

  const alerts = input.includeAlerts === false || !Array.isArray(content.alerts)
    ? []
    : content.alerts.filter((alert) => numberOr(alert.count) > 0);
  if (input.includeAlerts === false) {
    // La empresa desactivó las alertas en el mensaje: no se agrega la sección.
  } else if (alerts.length > 0) {
    lines.push('', `*Alertas importantes (${alerts.length}):*`);
    for (const alert of alerts.slice(0, 6)) {
      const amount = numberOr(alert.amount);
      const detail = amount > 0
        ? `${money(amount)}${numberOr(alert.count) > 0 ? ` (${Math.trunc(numberOr(alert.count))})` : ''}`
        : `${Math.trunc(numberOr(alert.count))}`;
      const names = Array.isArray(alert.items) ? alert.items.filter((item) => typeof item === 'string').slice(0, 3) : [];
      lines.push(`• ${alert.title}: ${detail}${names.length ? ` — ${names.join(', ')}` : ''}`);
    }
  } else {
    lines.push('', '*Alertas importantes:* sin novedades. ✅');
  }

  const appUrl = (input.appUrl || '').replace(/\/$/, '');
  lines.push('', appUrl ? `_ConexiaX · resumen automático · ${appUrl}/workspace/daily-summary_` : '_ConexiaX · resumen automático_');

  return lines.join('\n');
}

/** Cuerpo corto del resumen, útil para la campana de notificaciones o un correo. */
export function buildDailySummarySubject(content: DailySummaryContent, tenantName = ''): string {
  const currency = normalizeCurrency(content.currency);
  return `Resumen ${content.summaryDate}${tenantName ? ` · ${tenantName}` : ''}: ${formatMoney(numberOr(content.sales?.total), currency)} en ${Math.trunc(numberOr(content.sales?.count))} venta(s)`;
}
