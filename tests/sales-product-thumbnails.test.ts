import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sales = readFileSync('app/workspace/sales/page.tsx', 'utf8');
const css = readFileSync('app/globals.css', 'utf8');
const catalogRoute = readFileSync('app/api/catalog/route.ts', 'utf8');

test('el catálogo ya envía la foto de cada producto y el panel de Ventas la declara y la muestra', () => {
  assert.match(catalogRoute, /imageUrl: typeof metadata\.imageUrl === 'string' \? metadata\.imageUrl : null/);
  assert.match(sales, /type Product = \{[^}]*imageUrl\?: string \| null/);
  assert.match(sales, /<ProductThumb src=\{product\.imageUrl\} \/>/);
  assert.match(sales, /<img className="presale-product-image" src=\{src\}/);
});

test('si la foto falta o no carga, Ventas vuelve al ícono para no dejar cuadros vacíos', () => {
  assert.match(sales, /if \(!src \|\| failedSrc === src\) return <span className="presale-product-placeholder"/);
  assert.match(sales, /onError=\{\(\) => setFailedSrc\(src\)\}/);
});

test('las miniaturas no cambian la lógica de venta: tocar agrega al ticket y sin stock sigue deshabilitado', () => {
  assert.match(sales, /onClick=\{\(\) => add\(product\)\} disabled=\{product\.itemType !== 'service' && product\.stock <= 0\}/);
  assert.match(sales, /<b>\{product\.name\}<\/b>/);
});

test('los estilos de miniatura que usa Ventas existen (los mismos que Preventa)', () => {
  assert.match(css, /\.presale-product-image,\.presale-product-placeholder\{/);
});
