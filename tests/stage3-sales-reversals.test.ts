import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const returnsApi = readFileSync('app/api/sales/returns/route.ts', 'utf8');
const voidApi = readFileSync('app/api/sales/void/route.ts', 'utf8');
const salesApi = readFileSync('app/api/sales/route.ts', 'utf8');
const presaleCheckoutApi = readFileSync('app/api/presales/checkout/route.ts', 'utf8');
const reservationsApi = readFileSync('app/api/inventory/reservations/route.ts', 'utf8');
const notesApi = readFileSync('app/api/receivables/credit-notes/route.ts', 'utf8');
const returnsPage = readFileSync('app/workspace/returns/page.tsx', 'utf8');
const rules = readFileSync('firestore.rules', 'utf8');

test('las devoluciones controlan sucursal, inventario, reembolso y caja', () => {
  assert.match(returnsApi, /assertBranchAccess/);
  assert.match(returnsApi, /RETURN_EXCEEDS_SOLD/);
  assert.match(returnsApi, /create_sale_return/);
  assert.match(returnsApi, /target_refund_method/);
  assert.match(returnsApi, /writeImmutableAudit/);
});

test('las anulaciones bloquean ventas pagadas y revierten crédito pendiente', () => {
  assert.match(voidApi, /SALE_HAS_PAYMENTS/);
  assert.match(voidApi, /void_sale/);
  assert.match(voidApi, /target_reason/);
  assert.match(voidApi, /writeImmutableAudit/);
});

test('las notas de crédito limitan monto y actualizan cartera', () => {
  assert.match(notesApi, /CREDIT_NOTE_EXCEEDS_TOTAL/);
  assert.match(notesApi, /assertBranchAccess/);
  assert.match(notesApi, /create_credit_note/);
  assert.match(notesApi, /writeImmutableAudit/);
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

test('el listado de ventas impone el alcance de sucursal server-side', () => {
  assert.match(salesApi, /context\.branchIds/);
  assert.match(salesApi, /assertBranchAccess/);
  assert.match(salesApi, /eq\('branch_id', branchId\)/);
});

test('ventas, preventas y reservas usan stock por almacén', () => {
  for (const code of [salesApi, presaleCheckoutApi, reservationsApi]) {
    assert.match(code, /warehouseId/);
    assert.match(code, /branchId/);
  }
  assert.match(salesApi, /target_warehouse_id/);
  assert.match(presaleCheckoutApi, /writeImmutableAudit/);
  assert.match(reservationsApi, /writeImmutableAudit/);
});
