import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const script = readFileSync('scripts/migrate-inventory-stocks.ts', 'utf8');

test('la migración de inventario está protegida y tiene dry-run por defecto', () => {
  assert.match(script, /const CONFIRM = 'MIGRATE_INVENTORY_STOCKS'/);
  assert.match(script, /if \(options\.apply && options\.confirm !== CONFIRM\)/);
  assert.match(script, /mode: 'dry-run' \| 'apply'/);
  assert.match(script, /if \(!options\.apply\) warnings\.push\('Dry-run/);
});

test('la migración solo crea faltantes del almacén principal', () => {
  assert.match(script, /warehouse-main/);
  assert.match(script, /batch\.create/);
  assert.match(script, /Nunca sobrescribe/);
  assert.match(script, /inventoryStocks existente/);
  assert.match(script, /migratedFrom: 'products\.stock'/);
  assert.doesNotMatch(script, /batch\.set\(/);
  assert.doesNotMatch(script, /batch\.update\(/);
});

test('la migración reconcilia el stock legacy contra la suma de almacenes', () => {
  assert.match(script, /warehouseStocksScanned/);
  assert.match(script, /canonicalDocs\.reduce/);
  assert.match(script, /canonicalStock/);
  assert.match(script, /difference/);
  assert.match(script, /canonicalSnapshot = await tenant\.collection\('inventoryStocks'\)\.get\(\)/);
});

test('la ayuda del script no requiere conexión a Firebase', () => {
  const output = execFileSync('npx', ['tsx', 'scripts/migrate-inventory-stocks.ts', '--help'], { encoding: 'utf8' });
  assert.match(output, /MIGRATE_INVENTORY_STOCKS/);
  assert.match(output, /dry-run/);
});
