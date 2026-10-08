import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canUseAiAssistant } from '@/lib/ai/access';
import { buildSystemPrompt, type TenantAIContext } from '@/lib/ai/context';
import { decryptApiKey, encryptApiKey, maskApiKey } from '@/lib/ai/encryption';
import { getApiPolicy } from '@/lib/api-policy';

const migration = readFileSync('supabase/migrations/20261008000003_ai_assistant.sql', 'utf8');

test('Conexia sólo reconoce owner, admin, gerente y jefe como roles de inteligencia', () => {
  for (const role of ['owner', 'admin', 'gerente', 'jefe']) assert.equal(canUseAiAssistant(role), true, `${role} debe poder usar Conexia`);
  for (const role of ['vendedor', 'cajero', 'bodega', 'supervisor_sucursal', 'solo_lectura']) assert.equal(canUseAiAssistant(role), false, `${role} no debe poder usar Conexia`);
  assert.deepEqual(getApiPolicy('/api/ai/chat', 'GET'), { module: 'dashboard', action: 'view' });
});

test('las API keys BYOK se cifran con AES-GCM y se muestran únicamente enmascaradas', () => {
  const previous = process.env.AI_ENCRYPTION_KEY;
  // AES-256-GCM accepts a passphrase that the implementation derives with SHA-256.
  // Deliberately human-readable so secret scanners never treat a fixture as a key.
  process.env.AI_ENCRYPTION_KEY = 'unit test encryption key, not a secret';
  try {
    const encrypted = encryptApiKey('abcd1234wxyz');
    assert.match(encrypted, /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    assert.notEqual(encrypted.includes('abcd1234wxyz'), true);
    assert.equal(decryptApiKey(encrypted), 'abcd1234wxyz');
    assert.equal(maskApiKey('abcd1234wxyz'), 'abcd••••wxyz');
  } finally {
    if (previous === undefined) delete process.env.AI_ENCRYPTION_KEY;
    else process.env.AI_ENCRYPTION_KEY = previous;
  }
});

test('el prompt de Conexia incluye datos reales, nicho y la regla de no inventar', () => {
  const context: TenantAIContext = {
    companyName: 'Ferretería Central',
    businessType: 'ferretería y materiales de construcción',
    currency: 'NIO',
    timezone: 'America/Managua',
    localDate: '2026-10-07',
    range: { from: '2026-10-07T06:00:00.000Z', to: '2026-10-08T06:00:00.000Z' },
    salesToday: { count: 3, total: 1250, paidTotal: 1200, truncated: false },
    lowStock: [{ name: 'Tornillo 2 pulgadas', sku: 'TOR-2', stock: 2, available: 2, minStock: 5 }],
    queriedProducts: [{ name: 'Tornillo 2 pulgadas', sku: 'TOR-2', stock: 2, available: 2, minStock: 5 }],
    finance: { expenses: 100, cashMovementNet: 1100, nonSaleCashAdjustments: 0, netFlow: 1100 },
    branches: [{ id: 'branch-1', name: 'Sucursal Principal', code: 'MAIN', salesCount: 3, salesTotal: 1250 }],
    mainBranch: { id: 'branch-1', name: 'Sucursal Principal', code: 'MAIN', salesCount: 3, salesTotal: 1250 },
    catalog: { activeProducts: 50, stockRowsTruncated: false },
  };
  const prompt = buildSystemPrompt(context, { personality: 'inventory', customInstructions: '' });
  assert.match(prompt, /Eres Conexia, asistente de ConexiaX, empresa Ferretería Central/);
  assert.match(prompt, /Tornillo 2 pulgadas/);
  assert.match(prompt, /Ventas hoy: 3 ventas registradas/);
  assert.match(prompt, /Nunca inventes montos/);
  assert.match(prompt, /Experto Inventario|inventario/i);
});

test('la migración de IA mantiene cuota atómica Managua y tablas sólo de service_role', () => {
  assert.match(migration, /create table if not exists public\.tenant_ai_config/i);
  assert.match(migration, /create table if not exists public\.ai_chat_daily_usage/i);
  assert.match(migration, /create table if not exists public\.ai_chat_history/i);
  assert.match(migration, /target_limit integer default 20/i);
  assert.match(migration, /at time zone 'America\/Managua'/i);
  assert.match(migration, /create or replace function public\.release_ai_chat_quota/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.tenant_ai_config to service_role/i);
  assert.match(migration, /revoke all on table public\.tenant_ai_config from public, anon, authenticated/i);
});
