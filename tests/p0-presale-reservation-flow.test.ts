import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path: string) { return readFile(path, 'utf8'); }

test('enviar una preventa reserva stock y guarda su almacén', async () => {
  const api = await source('app/api/presales/route.ts');
  const migration = await source('supabase/migrations/20260914000006_presale_stock_reservations.sql');
  assert.match(api, /rpc\('reserve_inventory'/);
  assert.match(api, /reservation_id/);
  assert.match(api, /warehouse_id/);
  assert.match(migration, /available := stock_row\.quantity - stock_row\.reserved_quantity/);
  assert.match(migration, /set reserved_quantity=reserved_quantity\+requested/);
});

test('cancelar libera y cobrar consume la reserva', async () => {
  const api = await source('app/api/presales/route.ts');
  const checkout = await source('app/api/presales/checkout/route.ts');
  const migration = await source('supabase/migrations/20260914000006_presale_stock_reservations.sql');
  assert.match(api, /rpc\('release_inventory_reservation'/);
  assert.match(checkout, /rpc\('consume_inventory_reservation'/);
  assert.match(migration, /status='consumed'/);
});

test('inventario expone físico, reservado y disponible', async () => {
  const api = await source('app/api/inventory/route.ts');
  const page = await source('app/workspace/inventory/page.tsx');
  assert.match(api, /reserved_quantity/);
  assert.match(api, /available:/);
  assert.match(page, /Reservado/);
  assert.match(page, /Disponible/);
});
