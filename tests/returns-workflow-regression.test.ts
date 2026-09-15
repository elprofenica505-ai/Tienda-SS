import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path: string) { return readFile(path, 'utf8'); }

test('devoluciones reciben productos identificables y cantidades ya devueltas', async () => {
  const salesApi = await source('app/api/sales/route.ts');
  const returnsPage = await source('app/workspace/returns/page.tsx');
  assert.match(salesApi, /from\('products'\)\.select\('id,name,sku'\)/);
  assert.match(salesApi, /from\('sale_return_items'\)\.select\('sale_id,product_id,quantity'\)/);
  assert.match(salesApi, /productId: item\.product_id/);
  assert.match(salesApi, /returnedQuantities/);
  assert.match(returnsPage, /item\.name/);
});

test('el reembolso busca una sesión de caja abierta si la UI no envía una', async () => {
  const returnsApi = await source('app/api/sales/returns/route.ts');
  assert.match(returnsApi, /from\('cash_sessions'\)\.select\('id'\)/);
  assert.match(returnsApi, /status', 'open'/);
  assert.match(returnsApi, /cashSessionId/);
});

test('seleccionar una venta no marca todos sus productos para devolución', async () => {
  const returnsPage = await source('app/workspace/returns/page.tsx');
  assert.match(returnsPage, /setQuantities\(Object\.fromEntries/);
  assert.match(returnsPage, /\[item\.productId, 0\]/);
});
