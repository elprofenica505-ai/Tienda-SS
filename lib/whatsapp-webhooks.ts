import { createHmac, timingSafeEqual } from 'node:crypto';

function constantTimeTextEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyMetaWhatsAppSignature(rawBody: string, header: string, appSecret: string): boolean {
  const supplied = /^sha256=([a-f0-9]{64})$/i.exec(header.trim())?.[1] || '';
  if (!supplied || !appSecret.trim()) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return constantTimeTextEqual(supplied.toLowerCase(), expected);
}

/** Twilio firma la URL pública exacta seguida de los parámetros POST ordenados por nombre. */
export function verifyTwilioWhatsAppSignature(input: {
  url: string;
  parameters: URLSearchParams;
  signature: string;
  authToken: string;
}): boolean {
  if (!input.authToken.trim() || !input.signature.trim()) return false;
  let signed = input.url;
  const keys = Array.from(new Set(Array.from(input.parameters.keys()))).sort();
  for (const key of keys) {
    const values = input.parameters.getAll(key).sort();
    for (const value of values) signed += key + value;
  }
  const expected = createHmac('sha1', input.authToken).update(signed).digest('base64');
  return constantTimeTextEqual(input.signature, expected);
}

export type InboundWhatsAppMessage = { from: string; messageId: string | null; receivedAt: Date };

export function parseMetaWhatsAppMessages(value: unknown): InboundWhatsAppMessage[] {
  if (!value || typeof value !== 'object') return [];
  const root = value as { entry?: Array<{ changes?: Array<{ value?: { messages?: Array<Record<string, unknown>> } }> }> };
  const messages: InboundWhatsAppMessage[] = [];
  for (const entry of root.entry || []) {
    for (const change of entry.changes || []) {
      for (const message of change.value?.messages || []) {
        const from = typeof message.from === 'string' ? message.from : '';
        if (!from) continue;
        const seconds = Number(message.timestamp);
        const receivedAt = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
        messages.push({
          from,
          messageId: typeof message.id === 'string' ? message.id.slice(0, 180) : null,
          receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
        });
      }
    }
  }
  return messages;
}

export function parseTwilioWhatsAppMessage(parameters: URLSearchParams): InboundWhatsAppMessage | null {
  const from = parameters.get('From') || parameters.get('WaId') || '';
  if (!from) return null;
  const messageId = parameters.get('MessageSid') || parameters.get('SmsMessageSid') || null;
  return { from, messageId: messageId?.slice(0, 180) || null, receivedAt: new Date() };
}
