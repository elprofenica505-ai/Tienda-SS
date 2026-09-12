import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { cashDifference, expectedByMethod, validCashMethod } from '@/lib/cash';

const cashApi = readFileSync('app/api/cash-sessions/route.ts', 'utf8');

test('los métodos de caja aceptan únicamente medios conciliables', () => {
  assert.equal(validCashMethod('cash'), true);
  assert.equal(validCashMethod('card'), true);
  assert.equal(validCashMethod('transfer'), true);
  assert.equal(validCashMethod('credit'), false);
});

test('el esperado combina fondo inicial, cobros y retiros', () => {
  const expected = expectedByMethod([
    { paymentMethod: 'cash', amount: 100 },
    { paymentMethod: 'cash', amount: 40 },
    { paymentMethod: 'card', amount: 25 },
    { paymentMethod: 'cash', amount: 15, direction: 'out' },
  ]);
  assert.deepEqual(expected, { cash: 125, card: 25, transfer: 0 });
});

test('el arqueo conserva sobrantes y faltantes con signo', () => {
  assert.equal(cashDifference({ cash: 100, card: 50, transfer: 0 }, { cash: 95, card: 50, transfer: 0 }), -5);
  assert.equal(cashDifference({ cash: 100, card: 50, transfer: 0 }, { cash: 105, card: 50, transfer: 0 }), 5);
});

test('la API de caja rechaza direcciones de movimiento inválidas', () => {
  assert.match(cashApi, /const direction = body\.direction === 'in' \|\| body\.direction === 'out'/);
  assert.match(cashApi, /!direction/);
});
