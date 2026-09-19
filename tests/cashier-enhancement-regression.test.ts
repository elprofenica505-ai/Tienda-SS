import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Caja calcula cobros y movimientos desde cash_movements', async () => {
  const route = await readFile('app/api/cash-sessions/route.ts', 'utf8');
  assert.match(route, /from\('cash_movements'\)/);
  assert.match(route, /salesCount/);
  assert.match(route, /movementCount/);
  assert.match(route, /reference_type === 'sale'/);
});

test('Preventas enriquecen líneas con descripción e imagen de metadata', async () => {
  const route = await readFile('app/api/presales/route.ts', 'utf8');
  assert.match(route, /productImage/);
  assert.match(route, /description/);
  assert.match(route, /metadata\.imageUrl/);
  assert.match(route, /productById/);
});

test('Caja separa acciones pendientes para evitar botones amontonados', async () => {
  const page = await readFile('app/workspace/cashier/page.tsx', 'utf8');
  const styles = await readFile('app/globals.css', 'utf8');
  assert.match(page, /pending-presale-actions/);
  assert.match(page, /pending-presale-items/);
  assert.match(styles, /pending-presale-actions/);
  assert.match(styles, /white-space:nowrap/);
});
