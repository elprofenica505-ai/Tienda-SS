import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { after, before } from 'node:test';
import { NextRequest } from 'next/server';
import { GEMINI_MODEL, resolveGeminiModel } from '@/lib/ai/gemini';
import { seedMember, startFakeSupabase, type FakeSupabase } from './helpers/fake-supabase';

const TENANT = '99999999-9999-4999-8999-999999999999';
const OWNER = 'conexia-owner-token';
/** Clave deliberadamente falsa: nunca se pega una key real en el repositorio. */
const FAKE_SYSTEM_KEY = 'clave-falsa-de-prueba-no-es-un-secreto';

const geminiSource = readFileSync('lib/ai/gemini.ts', 'utf8');
const chatSource = readFileSync('app/api/ai/chat/route.ts', 'utf8');
const assistantPage = readFileSync('app/workspace/assistant/page.tsx', 'utf8');
const layoutSource = readFileSync('app/layout.tsx', 'utf8');
const styles = readFileSync('app/globals.css', 'utf8');
const migration = readFileSync('supabase/migrations/20261008000003_ai_assistant.sql', 'utf8');

test('Conexia llama a gemini-3.1-flash-lite y dejó de usar el modelo retirado', () => {
  assert.equal(GEMINI_MODEL, 'gemini-3.1-flash-lite');
  assert.match(geminiSource, /export const DEFAULT_GEMINI_MODEL = 'gemini-3\.1-flash-lite'/);
  // La única mención permitida al modelo viejo es el comentario que explica el retiro.
  const withoutComments = geminiSource.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(withoutComments, /gemini-1\.5-flash/);
  assert.doesNotMatch(chatSource, /gemini-1\.5-flash/, 'la ruta de chat no debe fijar el modelo retirado');
  assert.match(chatSource, /resolveGeminiModel\(\)/);
});

test('un futuro retiro de modelo se resuelve con GEMINI_MODEL sin publicar código', () => {
  const previous = process.env.GEMINI_MODEL;
  try {
    delete process.env.GEMINI_MODEL;
    assert.equal(resolveGeminiModel(), 'gemini-3.1-flash-lite');
    process.env.GEMINI_MODEL = '   ';
    assert.equal(resolveGeminiModel(), 'gemini-3.1-flash-lite', 'un valor vacío no puede dejar el modelo en blanco');
    process.env.GEMINI_MODEL = ' gemini-2.5-flash ';
    assert.equal(resolveGeminiModel(), 'gemini-2.5-flash');
  } finally {
    if (previous === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previous;
  }
});

test('la cuota gratuita sigue siendo 20 consultas por empresa y día en America/Managua', () => {
  assert.match(migration, /daily_limit integer not null default 20 check \(daily_limit between 1 and 100\)/i);
  assert.match(migration, /target_limit integer default 20/i);
  assert.match(migration, /at time zone 'America\/Managua'/i);
  assert.match(chatSource, /consume_ai_chat_quota/);
});

test('las API keys nunca llegan al navegador ni a los logs', () => {
  assert.doesNotMatch(assistantPage, /process\.env/, 'el cliente no debe leer variables del servidor');
  for (const source of [assistantPage, chatSource, geminiSource]) {
    assert.doesNotMatch(source, /NEXT_PUBLIC_[A-Z_]*GEMINI/);
    assert.doesNotMatch(source, /console\.(log|error|warn|info)\(/, 'ninguna rama puede registrar el error crudo del proveedor');
  }
  assert.match(chatSource, /AI_ENCRYPTION_KEY|decryptApiKey/);
});

test('el viewport móvil es explícito para no servir el escritorio comprimido', () => {
  assert.match(layoutSource, /export const viewport: Viewport/);
  assert.match(layoutSource, /width: 'device-width'/);
  assert.match(layoutSource, /initialScale: 1/);
  assert.match(layoutSource, /viewportFit: 'cover'/, 'sin cover no funcionan los env(safe-area-inset-*)');
});

test('Conexia se adapta a móvil hasta 720px con svh, safe-area y editor visible', () => {
  assert.doesNotMatch(styles, /@media\(max-width:600px\)\{\.assistant/, 'el corte del asistente debe ser 720px');
  assert.match(styles, /@media\(max-width:720px\)\{[\s\S]{0,220}?\.assistant-shell\{/);
  assert.match(assistantPage, /workspace-page assistant-shell/);
  assert.match(styles, /\.assistant-shell\{[^}]*height:100vh;height:100svh/);
  // El área de mensajes absorbe el alto disponible; así el editor no se esconde.
  assert.match(styles, /\.assistant-messages\{flex:1 1 auto;max-height:none;min-height:0/);
  assert.match(styles, /\.assistant-chat-panel\{[^}]*flex:1 1 auto;height:auto;min-height:0/);
  assert.match(styles, /\.assistant-composer\{[^}]*env\(safe-area-inset-bottom/);
  assert.match(styles, /\.assistant-config-modal\{[^}]*max-height:calc\(100svh - 12px\)/);
  // 16px evita el zoom automático de iOS al enfocar el editor.
  assert.match(styles, /\.assistant-composer textarea\{font-size:16px/);
  assert.match(styles, /\.assistant-quota-badge\{[^}]*text-overflow:ellipsis/);
  assert.match(styles, /\.workspace-page\{[^}]*min-height:100vh;min-height:100svh/);
});

let fake: FakeSupabase;
let chatRoute: typeof import('@/app/api/ai/chat/route');
let consumed = 0;
let released = 0;

function chatRequest(message = '¿Cuánto vendí hoy?') {
  return new NextRequest('http://localhost/api/ai/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${OWNER}`,
      'x-tenant-id': 'tienda-conexia',
    },
    body: JSON.stringify({ message }),
  });
}

before(async () => {
  fake = await startFakeSupabase();
  seedMember(fake, { slug: 'tienda-conexia', tenantUuid: TENANT, role: 'owner', token: OWNER, userId: 'conexia-owner' });
  fake.tables.tenant_ai_config = [{
    id: 'config-1',
    tenant_id: TENANT,
    provider: 'gemini',
    api_key_encrypted: null,
    personality: 'conexia',
    daily_limit: 20,
    enabled: false,
    custom_instructions: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  }];
  fake.tables.ai_chat_history = [];
  fake.rpc.consume_ai_chat_quota = () => {
    consumed += 1;
    return { body: { allowed: true, used: consumed, limit: 20, remaining: 20 - consumed, localDate: '2026-10-08', resetAt: '2026-10-09T06:00:00.000Z', timezone: 'America/Managua' } };
  };
  fake.rpc.release_ai_chat_quota = () => {
    consumed = Math.max(0, consumed - 1);
    released += 1;
    return { body: { released: true, used: consumed, localDate: '2026-10-08', timezone: 'America/Managua' } };
  };
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  process.env.RATE_LIMIT_SHARED = 'false';
  process.env.GEMINI_API_KEY = FAKE_SYSTEM_KEY;
  chatRoute = await import('@/app/api/ai/chat/route');
});

after(async () => {
  await fake.close();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.GEMINI_API_KEY;
});

test('si Gemini falla, la consulta reservada se libera y no se descuenta', { timeout: 60_000 }, async () => {
  const before_ = consumed;
  const response = await chatRoute.POST(chatRequest());
  const text = await response.text();

  assert.notEqual(response.status, 200, 'con una clave inválida Gemini no puede responder');
  assert.ok([429, 502, 503].includes(response.status), `estado inesperado ${response.status}: ${text}`);
  assert.match(text, /no fue descontada/i, 'el mensaje debe aclarar que la consulta no se cobró');
  assert.doesNotMatch(text, new RegExp(FAKE_SYSTEM_KEY), 'la respuesta nunca puede filtrar la API key');

  // El mensaje del usuario queda guardado antes de llamar a Gemini: prueba que
  // la liberación la dispara la falla del proveedor y no un paso anterior.
  assert.deepEqual(fake.tables.ai_chat_history.map((row) => row.role), ['user']);
  assert.equal(consumed, before_, 'el contador neto de consultas no debe crecer tras una falla');
  assert.equal(released, 1, 'debe llamarse exactamente una vez a release_ai_chat_quota');
  const release = fake.rpcCalls.filter((call) => call.name === 'release_ai_chat_quota');
  assert.equal(release.length, 1);
  assert.deepEqual(release[0].body, { target_tenant_id: TENANT });

  const body = JSON.parse(text) as { quota?: { used: number; remaining: number; timezone: string } };
  assert.equal(body.quota?.timezone, 'America/Managua');
  assert.equal(body.quota?.remaining, 20, 'al usuario debe devolvérsele la consulta liberada');
});
