import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path: string) { return readFile(path, 'utf8'); }

test('las preventas de servicios no intentan crear una reserva vacía', async () => {
  const route = await source('app/api/presales/route.ts');
  assert.match(route, /item_type/);
  assert.match(route, /const physicalItems = productIds/);
  assert.match(route, /if \(physicalItems\.length\)/);
  assert.match(route, /RESERVATION_EMPTY/);
});

test('una auditoría posterior no convierte una preventa guardada en error 500', async () => {
  const route = await source('app/api/presales/route.ts');
  assert.match(route, /presale_audit_failed_after_commit/);
  assert.match(route, /catch \(auditError\)/);
});

test('abrir Caja requiere confirmación explícita y la UI la envía', async () => {
  const api = await source('app/api/cash-sessions/route.ts');
  const ui = await source('app/workspace/cashier/page.tsx');
  assert.match(api, /body\.confirmOpen !== true/);
  assert.match(ui, /confirmOpen: true/);
  assert.match(ui, /window\.confirm/);
});
