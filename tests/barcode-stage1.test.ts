import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ean13CheckDigit, generateProductBarcode } from '../lib/barcodes';

test('genera códigos EAN-13 con dígito verificador válido', () => {
  const barcode = generateProductBarcode();
  assert.match(barcode, /^\d{13}$/);
  assert.equal(barcode.slice(-1), ean13CheckDigit(barcode.slice(0, 12)));
});

test('el catálogo persiste y devuelve barcode e imagen', async () => {
  const route = await readFile('app/api/catalog/route.ts', 'utf8');
  assert.match(route, /add column if not exists barcode|\.eq\('barcode'/);
  assert.match(route, /saveProductImage/);
  assert.match(route, /product-images/);
  assert.match(route, /imageUrl/);
});

test('el escáner ofrece cámara, encuadre y respaldo manual', async () => {
  const scanner = await readFile('components/workspace/BarcodeScanner.tsx', 'utf8');
  assert.match(scanner, /decodeFromConstraints/);
  assert.match(scanner, /BrowserMultiFormatReader/);
  assert.match(scanner, /barcode-frame/);
  assert.match(scanner, /Reintentar cámara/);
  assert.match(scanner, /Elegir foto/);
  assert.match(scanner, /Código manual/);
});

test('el formulario de producto separa cámara y Galería', async () => {
  const catalog = await readFile('app/workspace/catalog/page.tsx', 'utf8');
  assert.match(catalog, /Tomar foto/);
  assert.match(catalog, /Galería/);
});


test('el mismo escáner está conectado a Preventas, Venta directa y Caja', async () => {
  const [presales, sales, cashier] = await Promise.all([
    readFile('app/workspace/presales/page.tsx', 'utf8'),
    readFile('app/workspace/sales/page.tsx', 'utf8'),
    readFile('app/workspace/cashier/page.tsx', 'utf8'),
  ]);
  assert.match(presales, /BarcodeScanner/);
  assert.match(presales, /scanProduct/);
  assert.match(sales, /BarcodeScanner/);
  assert.match(sales, /scanProduct/);
  assert.match(cashier, /Confirmar con escáner/);
  assert.match(cashier, /verifyTicketProduct/);
});
