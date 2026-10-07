import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  WEAK_LATENCY_MS,
  classifyProbe,
  connectivityCopy,
  describeRequestError,
  isNetworkError,
  isServerStatus,
} from '../lib/connectivity';

const css = readFileSync('app/globals.css', 'utf8');
const cashier = readFileSync('app/workspace/cashier/page.tsx', 'utf8');
const finance = readFileSync('app/workspace/finance/page.tsx', 'utf8');
const layout = readFileSync('app/layout.tsx', 'utf8');
const toast = readFileSync('components/workspace/ConnectivityToast.tsx', 'utf8');

/** Strips @media/@print wrappers so we only assert on unconditional base rules. */
function baseRules(source: string): string {
  let out = '';
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('@media', index)) {
      let depth = 1;
      let cursor = source.indexOf('{', index) + 1;
      while (cursor < source.length && depth > 0) {
        if (source[cursor] === '{') depth += 1;
        else if (source[cursor] === '}') depth -= 1;
        cursor += 1;
      }
      index = cursor;
      continue;
    }
    out += source[index];
    index += 1;
  }
  return out;
}

const base = baseRules(css);

test('cada clase cash-movement usada en Caja tiene su regla base, no solo overrides responsive', () => {
  const used = Array.from(new Set(cashier.match(/cash-movement[a-z-]*/g) || []));
  assert.ok(used.length >= 13);
  const missing = used.filter((name) => !new RegExp(`\\.${name}[\\s,{:.>]`).test(base));
  assert.deepEqual(missing, [], `faltan reglas base para: ${missing.join(', ')}`);
});

test('los movimientos recientes usan rejilla 360px + 1fr con detalle sticky y sin desbordes', () => {
  assert.match(base, /\.cash-movement-layout\{[^}]*grid-template-columns:360px minmax\(0,1fr\)/);
  assert.match(base, /\.cash-movement-layout\{[^}]*align-items:start/);
  assert.match(base, /\.cash-movement-detail\{[^}]*position:sticky/);
  assert.match(base, /\.cash-movement-detail\{[^}]*min-width:0/);
  assert.match(base, /\.cash-movement-list\{[^}]*overflow-y:auto/);
  assert.match(base, /\.cash-movement-list\{[^}]*min-width:0/);
});

test('las filas y el detalle recortan el texto largo en vez de montarse', () => {
  assert.match(base, /\.cash-movement-row-copy b,\.cash-movement-row-copy small\{[^}]*text-overflow:ellipsis/);
  assert.match(base, /\.cash-movement-row-copy\{[^}]*min-width:0/);
  assert.match(base, /\.cash-movement-facts b\{[^}]*overflow-wrap:anywhere/);
});

test('en pantallas angostas el detalle deja de ser sticky y la rejilla cae a una columna', () => {
  assert.match(css, /@media\(max-width:900px\)\{\.cash-movement-detail\{position:static\}\}/);
  assert.match(css, /@media\(max-width:900px\)\{\.cash-movement-layout\{grid-template-columns:1fr\}/);
});

test('Finanzas ofrece filtros Todos, categoría, dirección y método de pago', () => {
  assert.match(finance, /onClick=\{\(\) => setCategory\('all'\)\}>Todos</);
  assert.match(finance, /categories\.map\(\(item\) =>/);
  assert.match(finance, /setDirection\(event\.target\.value as DirectionFilter\)/);
  assert.match(finance, /<option value="in">Entradas<\/option>/);
  assert.match(finance, /setPayment\(event\.target\.value\)/);
  assert.match(finance, /function resetFilters\(\)/);
});

test('Finanzas busca por descripción, categoría y notas', () => {
  assert.match(finance, /const needle = search\.trim\(\)\.toLowerCase\(\)/);
  assert.match(finance, /\[item\.description, item\.category, item\.notes/);
});

test('Finanzas agrupa por fecha en la zona horaria del negocio y suma cada día', () => {
  assert.match(finance, /new Intl\.DateTimeFormat\('en-CA', \{ timeZone: timezone/);
  assert.match(finance, /const groups = useMemo\(/);
  assert.match(finance, /group\.in \+= item\.amount; else group\.out \+= item\.amount/);
  assert.match(finance, /finance-day-group/);
});

test('Finanzas muestra métricas enriquecidas y un mini-gráfico de tendencia', () => {
  assert.match(finance, /finance-metrics-enhanced/);
  assert.match(finance, /Ajustes de caja/);
  assert.match(finance, /const chart = useMemo\(/);
  assert.match(finance, /finance-minichart/);
  assert.match(base, /\.finance-minichart\{/);
  assert.match(base, /\.finance-metrics-enhanced\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});

test('Finanzas unifica gastos y movimientos de caja en una sola línea de tiempo ordenada', () => {
  assert.match(finance, /const entries = useMemo<FinanceEntry\[\]>/);
  assert.match(finance, /\.sort\(\(a, b\) => \(b\.createdAt \|\| ''\)\.localeCompare\(a\.createdAt \|\| ''\)\)/);
});

test('el aviso de conectividad se monta de forma global en el layout raíz', () => {
  assert.match(layout, /import \{ ConnectivityToast \} from '@\/components\/workspace\/ConnectivityToast'/);
  assert.match(layout, /<ConnectivityToast \/>/);
  assert.match(base, /\.connectivity-toast\{[^}]*position:fixed/);
});

test('el aviso sondea el endpoint liviano, escucha online/offline y permite reintentar', () => {
  assert.match(toast, /fetch\('\/api\/health'/);
  assert.match(toast, /addEventListener\('offline'/);
  assert.match(toast, /addEventListener\('online'/);
  assert.match(toast, /Reintentar/);
  assert.match(toast, /role="status"/);
});

test('una caída de red se reporta como señal débil y nunca como error de servidor', () => {
  const message = describeRequestError(new TypeError('Failed to fetch'), 'Error de servidor');
  assert.match(message, /Señal débil/);
  assert.doesNotMatch(message, /Error de servidor/);
  assert.match(describeRequestError(new Error('boom'), 'Respaldo', 'offline'), /Sin conexión/);
});

test('un error real del servidor conserva su mensaje cuando la conexión está sana', () => {
  assert.equal(describeRequestError(new Error('No se pudo cobrar el ticket.'), 'Respaldo'), 'No se pudo cobrar el ticket.');
  assert.equal(describeRequestError(null, 'Respaldo'), 'Respaldo');
  assert.ok(isServerStatus(503));
  assert.ok(!isServerStatus(403));
});

test('se reconocen los fallos de transporte habituales', () => {
  assert.ok(isNetworkError(new TypeError('Failed to fetch')));
  assert.ok(isNetworkError(new Error('NetworkError when attempting to fetch resource')));
  assert.ok(isNetworkError(new Error('The operation timed out')));
  assert.ok(!isNetworkError(new Error('Saldo insuficiente')));
  assert.ok(!isNetworkError(null));
});

test('la calidad de conexión distingue sin conexión, señal débil y conexión sana', () => {
  assert.equal(classifyProbe({ online: false, reachable: false, latencyMs: 0 }), 'offline');
  assert.equal(classifyProbe({ online: true, reachable: false, latencyMs: 0, consecutiveFailures: 1 }), 'weak');
  assert.equal(classifyProbe({ online: true, reachable: false, latencyMs: 0, consecutiveFailures: 2 }), 'offline');
  assert.equal(classifyProbe({ online: true, reachable: true, latencyMs: WEAK_LATENCY_MS + 1 }), 'weak');
  assert.equal(classifyProbe({ online: true, reachable: true, latencyMs: 80, effectiveType: '2g' }), 'weak');
  assert.equal(classifyProbe({ online: true, reachable: true, latencyMs: 80, effectiveType: '4g' }), 'online');
});

test('el texto del aviso habla de señal, no de fallas del servidor', () => {
  assert.equal(connectivityCopy('online'), null);
  assert.equal(connectivityCopy('weak')?.title, 'Señal débil');
  assert.equal(connectivityCopy('offline')?.title, 'Sin conexión');
  assert.doesNotMatch(connectivityCopy('weak')!.detail, /servidor/i);
});

test('Caja traduce los fallos de red con el mismo criterio que Finanzas', () => {
  assert.match(cashier, /import \{ describeRequestError \} from '@\/lib\/connectivity'/);
  assert.match(finance, /import \{ describeRequestError \} from '@\/lib\/connectivity'/);
  assert.doesNotMatch(cashier, /error instanceof Error \? error\.message :/);
});
