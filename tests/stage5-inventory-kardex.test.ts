import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260918000005_stage5_inventory_kardex.sql');
const inventoryApi = read('app/api/inventory/route.ts');
const warehouseApi = read('app/api/inventory/warehouses/route.ts');

test('el kardex guarda saldos anteriores y posteriores', () => {
  assert.match(migration, /previous_quantity/);
  assert.match(migration, /new_quantity/);
  assert.match(migration, /previous_average_cost/);
  assert.match(migration, /new_average_cost/);
  assert.match(migration, /inventory_movements_kardex_idx/);
  assert.match(migration, /'previous_quantity', new\.previous_quantity/);
  assert.match(migration, /'new_quantity', new\.new_quantity/);
});

test('inventory_movements es append-only y bloquea modificaciones destructivas', () => {
  assert.match(migration, /inventory_movement_immutable_guard/);
  assert.match(migration, /INVENTORY_KARDEX_IMMUTABLE/);
  assert.match(migration, /before update or delete on public\.inventory_movements/);
  assert.match(migration, /revoke update, delete on public\.inventory_movements/);
});

test('la operación server-side rechaza stock insuficiente', () => {
  assert.match(migration, /apply_inventory_movement/);
  assert.match(migration, /after_qty < 0/);
  assert.match(migration, /reserved_quantity > after_qty/);
  assert.match(migration, /raise exception 'INSUFFICIENT_STOCK'/);
  assert.match(migration, /for update/);
});

test('las entradas actualizan costo promedio ponderado', () => {
  assert.match(migration, /average_cost numeric/);
  assert.match(migration, /before_qty \* before_cost/);
  assert.match(migration, /target_quantity \* greatest/);
  assert.match(migration, /after_cost := case when target_quantity > 0/);
  assert.match(migration, /update public\.inventory_stocks set quantity = after_qty, average_cost = after_cost/);
});

test('las rutas de inventario mantienen movimientos detrás de operaciones server-side', () => {
  assert.match(inventoryApi, /rpc\('adjust_inventory'/);
  assert.match(warehouseApi, /rpc\('adjust_inventory'/);
  assert.match(migration, /grant execute on function public\.apply_inventory_movement[\s\S]*to service_role/);
});
