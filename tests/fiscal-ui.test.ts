import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('app/workspace/fiscal/page.tsx', 'utf8');
const sidebar = readFileSync('components/workspace/WorkspaceSidebar.tsx', 'utf8');
const configApi = readFileSync('app/api/fiscal/config/route.ts', 'utf8');

test('la pantalla fiscal permite elegir proveedor y ambiente', () => {
  assert.match(page, /Facturación fiscal/);
  assert.match(page, /manual/);
  assert.match(page, /sandbox/);
  assert.match(page, /production/);
  assert.match(page, /provider-choice/);
  assert.match(page, /Guardar configuración/);
});

test('la pantalla contiene datos del emisor y conexión', () => {
  for (const field of ['legalName', 'taxId', 'address', 'endpoint', 'credentialRef', 'invoicePrefix', 'nextInvoiceSequence']) assert.match(page, new RegExp(field));
});

test('la referencia de credenciales nunca se muestra como secreto', () => {
  assert.match(configApi, /credentialRef: config\.credentialRef \? 'configured'/);
  assert.match(page, /el secreto nunca se muestra/);
});

test('la pantalla queda accesible desde la navegación del workspace', () => {
  assert.match(sidebar, /workspace\/fiscal/);
  assert.match(sidebar, /Facturación fiscal/);
});
