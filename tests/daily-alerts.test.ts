import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260928000002_daily_smart_alerts.sql');
const cronRoute = read('app/api/cron/daily-alerts/route.ts');
const notificationRoute = read('app/api/notifications/route.ts');
const notificationPage = read('app/workspace/notifications/page.tsx');
const sidebar = read('components/workspace/WorkspaceSidebar.tsx');
const apiPolicy = read('lib/api-policy.ts');
const vercelConfig = read('vercel.json');
const envExample = read('.env.example');

test('las alertas se guardan por tenant y tienen estado activo, leído y resuelto', () => {
  assert.match(migration, /create table if not exists public\.daily_smart_alerts/);
  assert.match(migration, /unique \(tenant_id, alert_key\)/);
  assert.match(migration, /is_active boolean not null default true/);
  assert.match(migration, /is_read boolean not null default false/);
  assert.match(migration, /resolved_at timestamptz/);
  assert.match(migration, /revoke all on table public\.daily_smart_alerts from public, anon, authenticated/);
});

test('la generación diaria calcula bajo stock, créditos vencidos, comparación y productos sin movimiento', () => {
  assert.match(migration, /stock\.total_quantity < p\.min_stock/);
  assert.match(migration, /r\.due_date < tenant_today/);
  assert.match(migration, /values \(7\), \(14\), \(21\), \(28\)/);
  assert.match(migration, /m\.created_at >= movement_cutoff/);
  assert.match(migration, /p\.created_at < movement_cutoff/);
  assert.match(migration, /on conflict \(tenant_id, alert_key\) do update/);
  assert.match(migration, /set is_active = false/);
  assert.match(migration, /grant execute on function public\.generate_daily_smart_alerts\(\) to service_role/);
});

test('el cron diario exige secreto y llama la generación SQL server-side', () => {
  assert.match(cronRoute, /process\.env\.CRON_SECRET/);
  assert.match(cronRoute, /timingSafeEqual/);
  assert.match(cronRoute, /rpc\('generate_daily_smart_alerts'/);
  assert.match(apiPolicy, /GET \/api\/cron\/daily-alerts/);
  assert.match(vercelConfig, /"path": "\/api\/cron\/daily-alerts"/);
  assert.match(vercelConfig, /"schedule": "59 5 \* \* \*"/);
  assert.match(envExample, /CRON_SECRET=/);
});

test('la bandeja muestra alertas guardadas solo a roles de administración y permite marcarlas leídas', () => {
  assert.match(notificationRoute, /MANAGER_ROLES\.has\(context\.role\)/);
  assert.match(notificationRoute, /from\('daily_smart_alerts'\)/);
  assert.match(notificationRoute, /activeAlertsCount/);
  assert.match(notificationRoute, /source === 'daily_alert'/);
  assert.match(notificationPage, /alertas operativas se actualizan/i);
  assert.match(sidebar, /Alertas diarias/);
  assert.match(sidebar, /activeAlertCount/);
});

test('la fase de alertas no llama Gemini ni incluye integración de WhatsApp', () => {
  assert.doesNotMatch(migration, /gemini|generativelanguage|whatsapp/i);
  assert.doesNotMatch(cronRoute, /gemini|generativelanguage|whatsapp/i);
});
