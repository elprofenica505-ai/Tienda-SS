import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  addCalendarDays,
  buildReceivableReminderMessage,
  calendarDaysBetween,
  localDateKey,
  normalizeReceivablesReminderSettings,
  receivableDueStatus,
} from '@/lib/receivables-reminders';
import {
  parseMetaWhatsAppMessages,
  parseTwilioWhatsAppMessage,
  verifyMetaWhatsAppSignature,
  verifyTwilioWhatsAppSignature,
} from '@/lib/whatsapp-webhooks';
import { isWhatsAppAutomationConfigured, sendWhatsAppAutomatedMessage } from '@/lib/whatsapp';

test('normaliza configuración, límites y teléfono alterno del dueño', () => {
  const settings = normalizeReceivablesReminderSettings({
    enabled: true,
    firstReminderDays: 90,
    frequencyDays: 0,
    messageTemplate: '   Hola {nombre}   ',
    ownerWhatsappPhone: 'no válido',
  }, '+505 8888 8888');
  assert.equal(settings.enabled, true);
  assert.equal(settings.firstReminderDays, 60);
  assert.equal(settings.frequencyDays, 1);
  assert.equal(settings.messageTemplate, 'Hola {nombre}');
  assert.equal(settings.ownerWhatsappPhone, '+50588888888');
});

test('calendario local maneja zona horaria, anticipación y estados de cuenta', () => {
  const instant = new Date('2026-10-03T05:30:00.000Z');
  assert.equal(localDateKey(instant, 'America/Managua'), '2026-10-02');
  assert.equal(addCalendarDays('2026-10-02', 3), '2026-10-05');
  assert.equal(calendarDaysBetween('2026-10-02', '2026-10-05'), 3);
  assert.equal(receivableDueStatus(120, '2026-10-02', '2026-10-02'), 'upcoming');
  assert.equal(receivableDueStatus(120, '2026-10-12', '2026-10-02'), 'current');
  assert.equal(receivableDueStatus(120, '2026-10-01', '2026-10-02'), 'overdue');
  assert.equal(receivableDueStatus(0, '2026-10-01', '2026-10-02'), 'paid');
});

test('el mensaje sustituye variables conocidas sin evaluar contenido del cliente', () => {
  const message = buildReceivableReminderMessage(
    'Hola {nombre}: debes {monto} a {empresa} por {factura}; vence {vencimiento}. {unknown}',
    { customerName: 'Lucía', amount: 25, currency: 'USD', tenantName: 'Tienda Central', invoiceNumber: 'F-101', dueDate: '2026-10-03', overdueDays: 2 },
  );
  assert.match(message, /Hola Lucía/);
  assert.match(message, /Tienda Central/);
  assert.match(message, /F-101/);
  assert.match(message, /\{unknown\}/);
});

test('webhook Meta valida HMAC y extrae solamente metadatos del mensaje', () => {
  const payload = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '50588888888', id: 'wamid.abc', timestamp: '1790942400', text: { body: 'texto privado' } }] } }] }] });
  const secret = 'meta-app-secret-test';
  const signature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
  assert.equal(verifyMetaWhatsAppSignature(payload, signature, secret), true);
  assert.equal(verifyMetaWhatsAppSignature(payload, signature, 'otro'), false);
  const messages = parseMetaWhatsAppMessages(JSON.parse(payload));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].from, '50588888888');
  assert.equal(messages[0].messageId, 'wamid.abc');
  assert.equal(messages[0].receivedAt.toISOString(), '2026-10-02T12:00:00.000Z');
});

test('webhook Twilio verifica firma sobre URL y parámetros ordenados', () => {
  const url = 'https://tienda.example/api/webhooks/whatsapp';
  const parameters = new URLSearchParams({ To: 'whatsapp:+15551234567', From: 'whatsapp:+50588888888', Body: 'hola' });
  let signed = url;
  for (const key of ['Body', 'From', 'To']) signed += key + parameters.get(key);
  const signature = createHmac('sha1', 'twilio-auth-secret').update(signed).digest('base64');
  assert.equal(verifyTwilioWhatsAppSignature({ url, parameters, signature, authToken: 'twilio-auth-secret' }), true);
  assert.equal(verifyTwilioWhatsAppSignature({ url, parameters, signature, authToken: 'wrong' }), false);
  const inbound = parseTwilioWhatsAppMessage(parameters);
  assert.equal(inbound?.from, 'whatsapp:+50588888888');
});

test('el envío de cobranza exige plantilla proactiva aprobada', async () => {
  const previous = {
    provider: process.env.WHATSAPP_PROVIDER,
    token: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    template: process.env.WHATSAPP_REMINDER_TEMPLATE_NAME,
  };
  process.env.WHATSAPP_PROVIDER = 'meta';
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
  delete process.env.WHATSAPP_REMINDER_TEMPLATE_NAME;
  try {
    assert.equal(isWhatsAppAutomationConfigured(), false);
    const skipped = await sendWhatsAppAutomatedMessage({ to: '+50588888888', text: 'mensaje de cobro' });
    assert.equal(skipped.status, 'skipped');
    assert.equal(skipped.error, 'WHATSAPP_REMINDER_TEMPLATE_NOT_CONFIGURED');
  } finally {
    if (previous.provider === undefined) delete process.env.WHATSAPP_PROVIDER; else process.env.WHATSAPP_PROVIDER = previous.provider;
    if (previous.token === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN; else process.env.WHATSAPP_ACCESS_TOKEN = previous.token;
    if (previous.phoneId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID; else process.env.WHATSAPP_PHONE_NUMBER_ID = previous.phoneId;
    if (previous.template === undefined) delete process.env.WHATSAPP_REMINDER_TEMPLATE_NAME; else process.env.WHATSAPP_REMINDER_TEMPLATE_NAME = previous.template;
  }
});
