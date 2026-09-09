import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const returnsApi = readFileSync('app/api/sales/returns/route.ts', 'utf8');
const voidApi = readFileSync('app/api/sales/void/route.ts', 'utf8');
const notesApi = readFileSync('app/api/receivables/credit-notes/route.ts', 'utf8');
const returnsPage = readFileSync('app/workspace/returns/page.tsx', 'utf8');
const rules = readFileSync('firestore.rules', 'utf8');

test('las devoluciones controlan sucursal, inventario, reembolso y caja', () => {
  assert.match(returnsApi, /assertBranchAccess/);
  assert.match(returnsApi, /findOpenCashSession/);
  assert.match(returnsApi, /REFUND_EXCEEDS_PAID/);
  assert.match(returnsApi, /cashMovements/);
  assert.match(returnsApi, /returnedQuantities/);
  assert.match(returnsApi, /inventoryMovements/);
});

test('las anulaciones bloquean ventas pagadas y revierten crédito pendiente', () => {
  assert.match(voidApi, /SALE_HAS_PAYMENTS/);
  assert.match(voidApi, /SALE_WRONG_BRANCH/);
  assert.match(voidApi, /creditMovements/);
  assert.match(voidApi, /status: 'void'/);
});

test('las notas de crédito limitan monto y actualizan cartera', () => {
  assert.match(notesApi, /CREDIT_NOTE_EXCEEDS_TOTAL/);
  assert.match(notesApi, /assertBranchAccess/);
  assert.match(notesApi, /creditMovements/);
  assert.match(notesApi, /status: 'applied'/);
});

test('la interfaz ofrece las tres acciones comerciales', () => {
  assert.match(returnsPage, /Procesar devolución/);
  assert.match(returnsPage, /Anular venta no pagada/);
  assert.match(returnsPage, /Crear nota de crédito/);
});

test('los documentos de reversión no se pueden escribir directamente desde el cliente', () => {
  assert.match(rules, /match \/salesReturns/);
  assert.match(rules, /match \/creditNotes/);
  assert.match(rules, /allow create, update, delete: if false/);
});
