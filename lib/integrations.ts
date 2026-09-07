import { createHmac, timingSafeEqual } from 'node:crypto';

export type WebhookEnvelope = {
  id: string;
  version: '2026-01';
  type: string;
  tenantId: string;
  occurredAt: string;
  data: Record<string, unknown>;
};

export function signWebhook(payload: string, secret: string, timestampSeconds = Math.floor(Date.now() / 1000)): string {
  const signed = `${timestampSeconds}.${payload}`;
  const signature = createHmac('sha256', secret).update(signed).digest('hex');
  return `t=${timestampSeconds},v1=${signature}`;
}

export function verifyWebhook(payload: string, header: string, secret: string, toleranceSeconds = 300, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const parts = header.split(',').reduce<Record<string, string>>((result, part) => {
    const separator = part.indexOf('=');
    if (separator > 0) result[part.slice(0, separator)] = part.slice(separator + 1);
    return result;
  }, {});
  const timestamp = Number(parts.t);
  const received = parts.v1 || '';
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > toleranceSeconds || !/^[a-f0-9]{64}$/.test(received)) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

function escapeCsv(value: unknown): string {
  const text = value == null ? '' : String(value);
  const neutralized = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(neutralized) ? `"${neutralized.replaceAll('"', '""')}"` : neutralized;
}

export function toCsv(rows: readonly Record<string, unknown>[], columns: readonly string[]): string {
  return [columns.join(','), ...rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(','))].join('\n');
}

export function createWebhookEnvelope(tenantId: string, type: string, data: Record<string, unknown>, id: string): WebhookEnvelope {
  return { id, version: '2026-01', type, tenantId, occurredAt: new Date().toISOString(), data };
}
