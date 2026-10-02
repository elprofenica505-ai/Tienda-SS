import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('app/workspace/notifications/page.tsx', 'utf8');
const css = readFileSync('app/globals.css', 'utf8');

test('la pantalla de alertas distingue el stock agotado como crítico, con su ícono y su etiqueta', () => {
  assert.match(page, /out_of_stock: '⚠'/);
  assert.match(page, /severity === 'critical'\) return 'Crítico'/);
  assert.match(css, /\.notice-icon\.out_of_stock\{/);
});

test('las alertas en vivo no se marcan como leídas, no cuentan como "sin leer" y explican que se quitan solas', () => {
  assert.match(page, /source: 'notification' \| 'daily_alert' \| 'live_alert'/);
  assert.match(page, /item\.source !== 'live_alert'/);
  assert.match(page, /se quita sola al reponer el inventario/);
});

test('el botón "Actualizar alertas" recalcula solo para administración y después vuelve a leer la bandeja', () => {
  assert.match(page, /Actualizar alertas/);
  assert.match(page, /action: 'refresh'/);
  assert.match(page, /MANAGER_ROLES\.has\(member\.role\)/);
  assert.match(page, /await load\(\);/);
});

test('si no se pudo revisar el stock en vivo, la pantalla lo avisa y sigue mostrando lo guardado', () => {
  assert.match(page, /No pudimos revisar el stock en vivo/);
  assert.match(page, /liveStock && !liveStock\.ok/);
});

test('el texto informa que el stock se actualiza al instante y el resto una vez al día o al pulsar el botón', () => {
  assert.match(page, /Las alertas de stock se actualizan al instante/);
  assert.match(page, /alertas operativas se actualizan una vez al día o cuando pulsas/);
});
