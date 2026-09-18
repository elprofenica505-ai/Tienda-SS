import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260918000008_stage8_consolidated_reports.sql');
const cash = read('app/api/cash-sessions/route.ts');
const reports = read('app/api/reports/consolidated/route.ts');

test('el cierre calcula esperado, contado y diferencia dentro de una RPC', () => {
  assert.match(migration, /cash_session_close_atomic/);
  assert.match(migration, /select \* into session_row[\s\S]*for update/);
  assert.match(migration, /expected := jsonb_build_object/);
  assert.match(migration, /counted := jsonb_build_object/);
  assert.match(migration, /difference := round/);
  assert.match(migration, /CASH_DIFFERENCE_REQUIRES_APPROVAL/);
  assert.match(cash, /rpc\('cash_session_close_atomic'/);
});

test('el arqueo es inmutable y único por sesión', () => {
  assert.match(migration, /create table if not exists public\.cash_reconciliations/);
  assert.match(migration, /unique \(tenant_id, cash_session_id\)/);
  assert.match(migration, /reconciliation_id/);
  assert.match(migration, /insert into public\.cash_reconciliations/);
});

test('existen reportes SQL de ventas, inventario, antigüedad y caja', () => {
  for (const fn of ['report_sales_consolidated', 'report_inventory_kardex_valuation', 'report_receivables_payables_aging', 'report_cash_movements']) assert.match(migration, new RegExp(`create or replace function public\\.${fn}`));
  assert.match(reports, /report_sales_consolidated/);
  assert.match(reports, /report_inventory_kardex_valuation/);
  assert.match(reports, /report_receivables_payables_aging/);
  assert.match(reports, /report_cash_movements/);
});

test('los reportes aplican tenant y sucursal en SQL', () => {
  assert.match(migration, /tenant_id=target_tenant_id/);
  assert.match(migration, /target_branch_id is null or/);
  assert.match(migration, /where cm\.tenant_id=target_tenant_id/);
  assert.match(migration, /where p\.tenant_id=target_tenant_id/);
  assert.match(migration, /where st\.tenant_id=target_tenant_id/);
});

test('las funciones y reportes quedan restringidos a service_role', () => {
  assert.match(migration, /security definer set search_path = public, pg_temp/);
  assert.match(migration, /revoke all on function public\.cash_session_close_atomic/);
  assert.match(migration, /grant execute on function public\.report_cash_movements[\s\S]*to service_role/);
  assert.match(reports, /assertBranchAccess/);
});
