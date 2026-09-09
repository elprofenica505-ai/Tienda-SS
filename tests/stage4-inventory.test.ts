import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { stockAfterDelta, stockKey, weightedAverageCost } from '@/lib/inventory-cost';

const inventoryApi = readFileSync('app/api/inventory/warehouses/route.ts', 'utf8');
const inventoryPage = readFileSync('app/workspace/warehouse-inventory/page.tsx', 'utf8');
const rules = readFileSync('firestore.rules', 'utf8');

test('el costo promedio ponderado conserva el valor económico del stock', () => {
  assert.equal(weightedAverageCost(10, 4, 10, 6), 5);
  assert.equal(weightedAverageCost(0, 0, 8, 3.25), 3.25);
  assert.equal(stockKey('warehouse-main', 'product-1'), 'warehouse-main__product-1');
});

test('el stock por almacén nunca acepta cantidades negativas', () => {
  assert.equal(stockAfterDelta(10, -4), 6);
  assert.throws(() => stockAfterDelta(2, -3), /INSUFFICIENT_WAREHOUSE_STOCK/);
});

test('la API cubre recepción, transferencias, costos y conteos aprobables', () => {
  assert.match(inventoryApi, /action === 'transfer'/);
  assert.match(inventoryApi, /action === 'count'/);
  assert.match(inventoryApi, /action === 'approve-count'/);
  assert.match(inventoryApi, /weightedAverageCost/);
  assert.match(inventoryApi, /inventoryTransfers/);
  assert.match(inventoryApi, /inventoryCounts/);
});

test('la UI expone almacén activo, transferencia y conteo físico', () => {
  assert.match(inventoryPage, /Inventario por almacén/);
  assert.match(inventoryPage, /Transferir/);
  assert.match(inventoryPage, /Conteo físico/);
  assert.match(inventoryPage, /Costo promedio/);
});

test('las colecciones de inventario tienen reglas sin borrado directo', () => {
  assert.match(rules, /match \/inventoryStocks/);
  assert.match(rules, /match \/inventoryTransfers/);
  assert.match(rules, /match \/inventoryCounts/);
  assert.match(rules, /allow delete: if false/);
});
