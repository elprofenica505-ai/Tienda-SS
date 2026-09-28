import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260928000001_ai_usage_limits.sql');
const route = read('app/api/ai/usage/route.ts');
const usageLibrary = read('lib/ai-usage.ts');
const apiPolicy = read('lib/api-policy.ts');

test('la configuración de límites IA es editable por plan y el uso está aislado por empresa y fecha', () => {
  assert.match(migration, /create table if not exists public\.ai_plan_limits/);
  assert.match(migration, /daily_query_limit integer not null check \(daily_query_limit >= 0\)/);
  assert.match(migration, /\('starter', 20, true\)/);
  assert.match(migration, /\('growth', 100, true\)/);
  assert.match(migration, /\('scale', 500, true\)/);
  assert.match(migration, /on conflict \(plan\) do nothing/);
  assert.match(migration, /create table if not exists public\.ai_usage_daily/);
  assert.match(migration, /primary key \(tenant_id, usage_date\)/);
  assert.match(migration, /last_reset_at timestamptz not null/);
});

test('el consumo del límite se resuelve en SQL de forma atómica antes del proveedor de IA', () => {
  assert.match(migration, /create or replace function public\.consume_ai_query\(target_tenant_id uuid\)/);
  assert.match(migration, /for update/);
  assert.match(migration, /if used_count >= plan_limit then/);
  assert.match(migration, /set query_count = u\.query_count \+ 1/);
  assert.match(migration, /current_now at time zone tenant_timezone/);
  assert.match(migration, /next_reset :=/);
  assert.match(migration, /grant execute on function public\.consume_ai_query\(uuid\) to service_role/);
  assert.match(migration, /revoke all on function public\.consume_ai_query\(uuid\) from public, anon, authenticated/);
});

test('la ruta de uso requiere sesión, empresa activa y rol de administración; no integra Gemini todavía', () => {
  assert.match(route, /requireTenantMember\(request, AI_MANAGER_ROLES\)/);
  assert.match(route, /const AI_MANAGER_ROLES: TenantRole\[\] = \['owner', 'admin', 'gerente', 'jefe'\]/);
  assert.match(route, /getAiUsageStatus\(context\.tenantId\)/);
  assert.match(route, /consumeAiQuery\(context\.tenantId\)/);
  assert.match(route, /status: 429/);
  assert.match(route, /Límite diario de consultas alcanzado, disponible mañana\./);
  assert.match(route, /tenantErrorResponse/);
  assert.doesNotMatch(route, /gemini|generativelanguage|google\.generative/i);
});

test('los RPC server-side se mantienen en una biblioteca compartida para que la futura ruta Gemini los use', () => {
  assert.match(usageLibrary, /rpc\('get_ai_usage_status'/);
  assert.match(usageLibrary, /rpc\('consume_ai_query'/);
  assert.match(apiPolicy, /pattern: \/\^\\\/api\\\/ai\\\/usage\$\//);
});
