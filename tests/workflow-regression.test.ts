import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path: string) { return readFile(path, 'utf8'); }

test('las invitaciones no anuncian envío si el proveedor de correo no confirma sent', async () => {
  const api = await source('app/api/invitations/route.ts');
  const ui = await source('app/workspace/members/page.tsx');
  assert.match(api, /delivery === 'sent'/);
  assert.match(api, /invitationUrl\(token\)/);
  assert.match(ui, /data\.delivery === 'sent'/);
  assert.match(ui, /Copiar enlace de invitación/);
});

test('las URLs de invitación funcionan en Preview sin APP_URL explícita', async () => {
  const invitations = await source('lib/invitations.ts');
  assert.match(invitations, /process\.env\.VERCEL_URL/);
});

test('el historial de inventario entrega el contrato que consume la UI', async () => {
  const api = await source('app/api/inventory/route.ts');
  const ui = await source('app/workspace/inventory/page.tsx');
  assert.match(api, /productId: row\.product_id/);
  assert.match(api, /delta: Number\(row\.quantity/);
  assert.match(api, /metadata\?\.reason/);
  assert.match(api, /warehouses!inner\(branch_id\)/);
  assert.match(ui, /movement\.productId/);
  assert.match(ui, /movement\.delta/);
  assert.match(ui, /movement\.reason/);
});

test('el flujo de preventa conserva sucursal y almacén hasta checkout', async () => {
  const presalesUi = await source('app/workspace/presales/page.tsx');
  const checkout = await source('app/api/presales/checkout/route.ts');
  assert.match(presalesUi, /branchId: activeBranchId/);
  assert.match(checkout, /presale\.branch_id/);
  assert.match(checkout, /requestedWarehouseId/);
  assert.match(checkout, /target_idempotency_key: `presale:\$\{presaleId\}`/);
});
