import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { resolveWhatsAppProvider } from '@/lib/whatsapp';
import { recordInboundWhatsAppReply } from '@/lib/receivables-reminders-service';
import {
  parseMetaWhatsAppMessages,
  parseTwilioWhatsAppMessage,
  verifyMetaWhatsAppSignature,
  verifyTwilioWhatsAppSignature,
} from '@/lib/whatsapp-webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const NO_STORE = { 'Cache-Control': 'no-store' };
const MAX_WEBHOOK_BODY_LENGTH = 1_000_000;

function safeSecretMatch(supplied: string, expected: string): boolean {
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

function providerFromEnvironment(): 'meta' | 'twilio' | null {
  const explicit = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase();
  if (explicit === 'meta' || explicit === 'twilio') return explicit;
  return resolveWhatsAppProvider();
}

/** Verificación GET solicitada por Meta al registrar el webhook. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get('hub.mode') || '';
  const token = params.get('hub.verify_token') || '';
  const challenge = params.get('hub.challenge') || '';
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() || '';
  if (mode !== 'subscribe' || !expected || !safeSecretMatch(token, expected) || !challenge) {
    return NextResponse.json({ ok: false, error: 'Verificación de webhook no autorizada.' }, { status: 403, headers: NO_STORE });
  }
  return new Response(challenge, { status: 200, headers: { ...NO_STORE, 'Content-Type': 'text/plain; charset=utf-8' } });
}

/** Recibe las respuestas entrantes y cierra los avisos pendientes por número de WhatsApp. */
export async function POST(request: NextRequest) {
  const provider = providerFromEnvironment();
  if (!provider) {
    return NextResponse.json({ ok: false, error: 'El proveedor de WhatsApp no está configurado.' }, { status: 503, headers: NO_STORE });
  }
  const rawBody = await request.text();
  if (rawBody.length > MAX_WEBHOOK_BODY_LENGTH) {
    return NextResponse.json({ ok: false, error: 'El mensaje recibido supera el tamaño permitido.' }, { status: 413, headers: NO_STORE });
  }

  let messages: Array<{ from: string; messageId: string | null; receivedAt: Date }> = [];
  if (provider === 'meta') {
    const appSecret = process.env.WHATSAPP_APP_SECRET?.trim() || '';
    const signature = request.headers.get('x-hub-signature-256') || '';
    if (!appSecret || !verifyMetaWhatsAppSignature(rawBody, signature, appSecret)) {
      return NextResponse.json({ ok: false, error: 'Firma del webhook no válida.' }, { status: 401, headers: NO_STORE });
    }
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ ok: false, error: 'El evento recibido no es JSON válido.' }, { status: 400, headers: NO_STORE });
    }
    messages = parseMetaWhatsAppMessages(payload);
  } else {
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || '';
    const publicBase = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim();
    if (!authToken || !publicBase) {
      return NextResponse.json({ ok: false, error: 'Falta configurar la verificación entrante de Twilio.' }, { status: 503, headers: NO_STORE });
    }
    const parameters = new URLSearchParams(rawBody);
    let publicUrl: string;
    try {
      publicUrl = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, publicBase).toString();
    } catch {
      return NextResponse.json({ ok: false, error: 'La URL pública del webhook no es válida.' }, { status: 503, headers: NO_STORE });
    }
    const signature = request.headers.get('x-twilio-signature') || '';
    if (!verifyTwilioWhatsAppSignature({ url: publicUrl, parameters, signature, authToken })) {
      return NextResponse.json({ ok: false, error: 'Firma del webhook no válida.' }, { status: 401, headers: NO_STORE });
    }
    const message = parseTwilioWhatsAppMessage(parameters);
    if (message) messages = [message];
  }

  try {
    for (const message of messages) {
      await recordInboundWhatsAppReply({
        phone: message.from,
        messageId: message.messageId,
        receivedAt: message.receivedAt,
      });
    }
    return NextResponse.json({ ok: true, received: messages.length }, { headers: NO_STORE });
  } catch (error: unknown) {
    console.error('receivables_whatsapp_webhook_failed', {
      message: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    });
    return NextResponse.json({ ok: false, error: 'No se pudo registrar la respuesta recibida.' }, { status: 503, headers: NO_STORE });
  }
}
