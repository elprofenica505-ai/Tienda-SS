import { addDaysToDateKey, isValidTimeZone, localDateKey } from '@/lib/daily-summary';

export const DEFAULT_FINANCIAL_TIME_ZONE = 'America/Managua';

export type FinancialPeriod = {
  days: number;
  fromDate: string;
  toDate: string;
  from: string;
  to: string;
  timeZone: string;
};

export function normalizeFinancialTimeZone(value: unknown): string {
  return isValidTimeZone(value) ? String(value).trim() : DEFAULT_FINANCIAL_TIME_ZONE;
}

/** Converts midnight in a tenant's IANA time zone to its UTC instant. */
export function localMidnightAsUtc(dateKey: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error('INVALID_LOCAL_DATE');
  const wanted = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0);
  let candidate = wanted;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeFinancialTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  // Iteratively correct the UTC guess by the difference between the requested
  // wall-clock time and the wall-clock time represented by that guess. This
  // also handles daylight-saving changes without assuming a fixed UTC offset.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const parts = formatter.formatToParts(new Date(candidate));
    const part = (name: string) => parts.find((item) => item.type === name)?.value || '0';
    const represented = Date.UTC(
      Number(part('year')),
      Number(part('month')) - 1,
      Number(part('day')),
      Number(part('hour')),
      Number(part('minute')),
      Number(part('second')),
    );
    const correction = wanted - represented;
    if (correction === 0) break;
    candidate += correction;
  }

  return new Date(candidate);
}

export function getFinancialPeriod(daysValue: unknown, timeZoneValue: unknown, now = new Date()): FinancialPeriod {
  const parsed = Number(daysValue);
  const days = Number.isFinite(parsed) ? Math.min(365, Math.max(7, Math.floor(parsed))) : 30;
  const timeZone = normalizeFinancialTimeZone(timeZoneValue);
  const toDate = localDateKey(now, timeZone);
  const fromDate = addDaysToDateKey(toDate, -(days - 1));
  const exclusiveToDate = addDaysToDateKey(toDate, 1);
  return {
    days,
    fromDate,
    toDate,
    from: localMidnightAsUtc(fromDate, timeZone).toISOString(),
    to: localMidnightAsUtc(exclusiveToDate, timeZone).toISOString(),
    timeZone,
  };
}

export function localDateTime(value: unknown, timeZone: string): string {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeFinancialTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function localDateOfInstant(value: unknown, timeZone: string): string {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '';
  return localDateKey(date, normalizeFinancialTimeZone(timeZone));
}
