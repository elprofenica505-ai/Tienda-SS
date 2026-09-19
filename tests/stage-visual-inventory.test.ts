import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('el escáner confirma detecciones con sonido sin eliminar los respaldos', async () => {
  const scanner = await readFile('components/workspace/BarcodeScanner.tsx', 'utf8');
  assert.match(scanner, /playScanBeep/);
  assert.match(scanner, /acceptDetected/);
  assert.match(scanner, /decodeFromConstraints/);
  assert.match(scanner, /Elegir foto/);
});

test('catálogo ofrece detalle imprimible y tarjetas con imagen', async () => {
  const catalog = await readFile('app/workspace/catalog/page.tsx', 'utf8');
  assert.match(catalog, /printProductDetail/);
  assert.match(catalog, />Detalle</);
  assert.match(catalog, /product-card-image/);
});

test('Preventas conservan el flujo funcional de escaneo y envío a Caja', async () => {
  const presales = await readFile('app/workspace/presales/page.tsx', 'utf8');
  assert.match(presales, /function scanProduct/);
  assert.match(presales, /function sendToCashier/);
  assert.match(presales, /Enviar a caja/);
});

test('Stock carga productos al iniciar y devuelve imagen desde metadata', async () => {
  const page = await readFile('app/workspace/inventory/page.tsx', 'utf8');
  const route = await readFile('app/api/inventory/route.ts', 'utf8');
  assert.match(page, /loadInventory\(true\)/);
  assert.match(page, /inventory-chart-panel/);
  assert.match(route, /metadata/);
  assert.match(route, /imageUrl/);
});
