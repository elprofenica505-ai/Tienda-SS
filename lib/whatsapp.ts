/**
 * Envío de WhatsApp del Resumen Diario.
 *
 * Soporta los dos caminos oficiales más usados:
 *  - meta:   WhatsApp Cloud API (Meta)   → WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID
 *  - twilio: Twilio WhatsApp API         → TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM
 *
 * Reglas de seguridad:
 *  - Las credenciales viven solo en variables de entorno del servidor y nunca se registran en logs.
 *  - Si no hay proveedor configurado, el envío se marca como `skipped` (no se rompe el resumen).
 *  - Si el proveedor responde con error, se guarda un mensaje corto y saneado para diagnóstico.
 */

export type WhatsAppProvider = 'meta' | 'twilio';

export type WhatsAppSendStatus = 'sent' | 'skipped' | 'failed';

export type WhatsAppSendResult = {
  status: WhatsAppSendStatus;
  provider: WhatsAppProvider | null;
  messageId: string | null;
  phone: string;
  error: string | null;
};

export class WhatsAppConfigurationError extends Error {
  constructor(message = 'WHATSAPP_NOT_CONFIGURED') {
    super(message);
    this.name = 'WhatsAppConfigurationError';
  }
}

/** Deja el teléfono en formato E.164 (+ y entre 8 y 15 dígitos) o devuelve cadena vacía. */
export function normalizeWhatsAppPhone(value: unknown): string {
  if (typeof value !== 'string') return '';
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const normalized = `+${digits}`;
  return /^\+\d{8,15}$/.test(normalized) ? normalized : '';
}

export type EnvironmentLike = Record<string, string | undefined>;

export function resolveWhatsAppProvider(env: EnvironmentLike = process.env): WhatsAppProvider | null {
  const requested = (env.WHATSAPP_PROVIDER || '').trim().toLowerCase();
  const metaReady = Boolean(env.WHATSAPP_ACCESS_TOKEN?.trim() && env.WHATSAPP_PHONE_NUMBER_ID?.trim());
  const twilioReady = Boolean(
    env.TWILIO_ACCOUNT_SID?.trim() && env.TWILIO_AUTH_TOKEN?.trim() && env.TWILIO_WHATSAPP_FROM?.trim(),
  );
  if (requested === 'meta') return metaReady ? 'meta' : null;
  if (requested === 'twilio') return twilioReady ? 'twilio' : null;
  if (metaReady) return 'meta';
  if (twilioReady) return 'twilio';
  return null;
}

/** ¿El servidor tiene credenciales de WhatsApp listas para enviar? (no expone las credenciales) */
export function isWhatsAppConfigured(env: EnvironmentLike = process.env): boolean {
  return resolveWhatsAppProvider(env) !== null;
}

/** Mensaje de error corto y sin credenciales, listo para guardar en la fila del resumen. */
export function sanitizeProviderError(value: unknown): string {
  const text = typeof value === 'string' ? value : value instanceof Error ? value.message : 'unknown';
  return text
    .replace(/(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 ***')
    .replace(/access_token=[A-Za-z0-9._~+/=-]+/gi, 'access_token=***')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300) || 'unknown';
}

async function readProviderError(response: Response): Promise<string> {
  try {
    const body = await response.text();
    if (!body) return `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      const detail = (parsed.error as Record<string, unknown> | undefined)?.message
        || parsed.message
        || (parsed.error as Record<string, unknown> | undefined)?.error_user_msg;
      if (typeof detail === 'string' && detail.trim()) return `${detail} (HTTP ${response.status})`;
    } catch {
      // La respuesta no era JSON: se usa el texto plano.
    }
    return `${body.slice(0, 200)} (HTTP ${response.status})`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function sendWithMeta(input: { to: string; text: string }, fetchImpl: typeof fetch, timeoutMs: number): Promise<{ messageId: string | null }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN!.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!.trim();
  const version = (process.env.WHATSAPP_GRAPH_VERSION || 'v21.0').trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: input.to.replace(/^\+/, ''),
        type: 'text',
        text: { preview_url: false, body: input.text },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(await readProviderError(response));
    const data = await response.json().catch(() => ({})) as { messages?: Array<{ id?: string }> };
    return { messageId: data.messages?.[0]?.id || null };
  } finally {
    clearTimeout(timer);
  }
}

async function sendWithTwilio(input: { to: string; text: string }, fetchImpl: typeof fetch, timeoutMs: number): Promise<{ messageId: string | null }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN!.trim();
  const from = process.env.TWILIO_WHATSAPP_FROM!.trim();
  const fromAddress = from.startsWith('whatsapp:') ? from : `whatsapp:${from.startsWith('+') ? from : `+${from.replace(/\D/g, '')}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: fromAddress, To: `whatsapp:${input.to}`, Body: input.text }).toString(),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(await readProviderError(response));
    const data = await response.json().catch(() => ({})) as { sid?: string };
    return { messageId: data.sid || null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Envía un mensaje de texto por WhatsApp. Nunca lanza: siempre devuelve un resultado
 * que el llamador puede guardar en `daily_summaries`.
 */
export async function sendWhatsAppText(input: {
  to: unknown;
  text: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<WhatsAppSendResult> {
  const phone = normalizeWhatsAppPhone(input.to);
  const provider = resolveWhatsAppProvider();
  if (!provider) {
    return { status: 'skipped', provider: null, messageId: null, phone, error: 'WHATSAPP_NOT_CONFIGURED' };
  }
  if (!phone) {
    return { status: 'failed', provider, messageId: null, phone: '', error: 'WHATSAPP_PHONE_INVALID' };
  }
  const text = (input.text || '').slice(0, 4096);
  if (!text.trim()) {
    return { status: 'failed', provider, messageId: null, phone, error: 'WHATSAPP_EMPTY_MESSAGE' };
  }
  try {
    const fetchImpl = input.fetchImpl || fetch;
    const timeoutMs = Number.isFinite(input.timeoutMs) ? Number(input.timeoutMs) : 12_000;
    const result = provider === 'meta'
      ? await sendWithMeta({ to: phone, text }, fetchImpl, timeoutMs!)
      : await sendWithTwilio({ to: phone, text }, fetchImpl, timeoutMs!);
    return { status: 'sent', provider, messageId: result.messageId, phone, error: null };
  } catch (error: unknown) {
    return { status: 'failed', provider, messageId: null, phone, error: sanitizeProviderError(error) };
  }
}
