import { formatMoney } from '@/lib/currency';
import { normalizeWhatsAppPhone } from '@/lib/whatsapp';

export const RECEIVABLE_REMINDER_SETTINGS_KEY = 'receivables_reminders';
export const REMINDER_MESSAGE_MAX_LENGTH = 900;

export type ReceivablesReminderSettings = {
  enabled: boolean;
  firstReminderDays: number;
  frequencyDays: number;
  messageTemplate: string;
  ownerAlertsEnabled: boolean;
  ownerWhatsappPhone: string;
};

export const DEFAULT_RECEIVABLE_REMINDER_SETTINGS: ReceivablesReminderSettings = {
  enabled: false,
  firstReminderDays: 3,
  frequencyDays: 3,
  messageTemplate: 'Hola {nombre}. Te recordamos que tienes un saldo pendiente de {monto} en {empresa} por la factura {factura}, con vencimiento el {vencimiento}. Si ya pagaste, ignora este mensaje. Gracias.',
  ownerAlertsEnabled: true,
  ownerWhatsappPhone: '',
};

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

export function normalizeReceivablesReminderSettings(
  raw: unknown,
  fallbackOwnerPhone = '',
): ReceivablesReminderSettings {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const messageTemplate = typeof value.messageTemplate === 'string'
    ? value.messageTemplate.trim().slice(0, REMINDER_MESSAGE_MAX_LENGTH)
    : '';
  const configuredOwnerPhone = normalizeWhatsAppPhone(value.ownerWhatsappPhone);
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_RECEIVABLE_REMINDER_SETTINGS.enabled,
    firstReminderDays: boundedInteger(value.firstReminderDays, DEFAULT_RECEIVABLE_REMINDER_SETTINGS.firstReminderDays, 0, 60),
    frequencyDays: boundedInteger(value.frequencyDays, DEFAULT_RECEIVABLE_REMINDER_SETTINGS.frequencyDays, 1, 60),
    messageTemplate: messageTemplate || DEFAULT_RECEIVABLE_REMINDER_SETTINGS.messageTemplate,
    ownerAlertsEnabled: typeof value.ownerAlertsEnabled === 'boolean' ? value.ownerAlertsEnabled : DEFAULT_RECEIVABLE_REMINDER_SETTINGS.ownerAlertsEnabled,
    ownerWhatsappPhone: configuredOwnerPhone || normalizeWhatsAppPhone(fallbackOwnerPhone),
  };
}

/** Devuelve la fecha calendario del tenant en formato estable YYYY-MM-DD. */
export function localDateKey(value: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'America/Managua',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

export function addCalendarDays(dateKey: string, days: number): string {
  const value = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(value.getTime())) return dateKey;
  value.setUTCDate(value.getUTCDate() + Math.trunc(days));
  return value.toISOString().slice(0, 10);
}

/** Diferencia de días calendario: positivo si `later` es posterior a `earlier`. */
export function calendarDaysBetween(earlier: string, later: string): number {
  const start = new Date(`${earlier}T00:00:00.000Z`).getTime();
  const end = new Date(`${later}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.trunc((end - start) / 86_400_000);
}

export type ReminderMessageVariables = {
  customerName: string;
  amount: number;
  currency: string;
  tenantName: string;
  invoiceNumber: string;
  dueDate: string;
  overdueDays?: number;
};

function displayDate(dateKey: string): string {
  const parsed = new Date(`${dateKey}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime())
    ? dateKey
    : new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed);
}

/** Reemplaza variables conocidas y deja el resto del texto como texto plano. */
export function buildReceivableReminderMessage(
  template: string,
  variables: ReminderMessageVariables,
): string {
  const replacements: Record<string, string> = {
    nombre: variables.customerName || 'cliente',
    monto: formatMoney(variables.amount, variables.currency),
    empresa: variables.tenantName || 'tu empresa',
    factura: variables.invoiceNumber || 'venta a crédito',
    vencimiento: displayDate(variables.dueDate),
    dias_vencidos: String(Math.max(0, Math.trunc(variables.overdueDays || 0))),
  };
  return template
    .replace(/\{([a-z_]+)\}/gi, (placeholder, key: string) => replacements[key.toLowerCase()] ?? placeholder)
    .trim()
    .slice(0, 1024);
}

export function receivableDueStatus(
  balance: number,
  dueDate: string | null | undefined,
  today: string,
  upcomingWindowDays = 7,
): 'current' | 'upcoming' | 'overdue' | 'paid' {
  if (balance <= 0) return 'paid';
  if (!dueDate) return 'current';
  if (dueDate < today) return 'overdue';
  return calendarDaysBetween(today, dueDate) <= upcomingWindowDays ? 'upcoming' : 'current';
}
