import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(path, 'utf8');

test('el historial de inventario identifica producto y responsable', async () => {
  const api = await read('app/api/inventory/route.ts');
  const page = await read('app/workspace/inventory/page.tsx');
  assert.match(api, /from\('products'\)\.select\('id,name,sku'\)/);
  assert.match(api, /from\('profiles'\)\.select\('auth_user_id,display_name,email'\)/);
  assert.match(api, /productName:/);
  assert.match(api, /performedByName:/);
  assert.match(page, /movement\.productName/);
  assert.match(page, /movement\.performedByName/);
  assert.match(page, /Responsable:/);
});

test('cancelar preventa conserva trazabilidad y alcance de sucursal', async () => {
  const api = await read('app/api/presales/route.ts');
  const seller = await read('app/workspace/presales/page.tsx');
  const cashier = await read('app/workspace/cashier/page.tsx');
  assert.match(api, /'cancelled'/);
  assert.match(api, /currentResult\.data\.status !== 'sent_to_cashier'/);
  assert.match(api, /assertBranchAccess\(context, currentResult\.data\.branch_id\)/);
  assert.match(api, /presale\.\$\{action\}/);
  assert.match(seller, /cancelPresale/);
  assert.match(seller, /action: 'cancel'/);
  assert.match(cashier, /cancelPresale/);
  assert.match(cashier, /Cancelar/);
});
