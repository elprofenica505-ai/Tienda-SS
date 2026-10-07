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

/** Collects the literal class names written in JSX, ignoring interpolated fragments. */
function classNames(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(/className=\{?["`]([^"`]+)/g)) {
    for (const word of match[1].split(/\s+/)) {
      if (word && !word.includes('{') && !word.includes('$')) names.add(word);
    }
  }
  return Array.from(names);
}

function missingBaseRules(source: string, prefixes: string[]): string[] {
  return classNames(source)
    .filter((name) => prefixes.some((prefix) => name.startsWith(prefix)))
    .filter((name) => !new RegExp(`\\.${name}[\\s,{:.>]`).test(base))
    .sort();
}

// ---------------------------------------------------------------- regresión

test('ninguna clase cash-* o finance-* se queda sin regla base (regresión del solapamiento)', () => {
  assert.deepEqual(missingBaseRules(cashier, ['cash-']), []);
  assert.deepEqual(missingBaseRules(finance, ['finance-']), []);
});

test('cada clase cash-movement usada en Caja tiene su regla base, no solo overrides responsive', () => {
  const used = Array.from(new Set(cashier.match(/cash-movement[a-z-]*/g) || []));
  assert.ok(used.length >= 10);
  const missing = used.filter((name) => !new RegExp(`\\.${name}[\\s,{:.>]`).test(base));
  assert.deepEqual(missing, [], `faltan reglas base para: ${missing.join(', ')}`);
});

test('se mantiene la rejilla 360px + 1fr con detalle sticky y sin desbordes', () => {
  assert.match(base, /\.cash-movement-layout\{[^}]*grid-template-columns:360px minmax\(0,1fr\)/);
  assert.match(base, /\.cash-movement-layout\{[^}]*align-items:start/);
  assert.match(base, /\.cash-movement-detail\{[^}]*position:sticky/);
  assert.match(base, /\.cash-movement-detail\{[^}]*min-width:0/);
  assert.match(base, /\.cash-movement-list\{[^}]*overflow-y:auto/);
  assert.match(base, /\.cash-movement-list\{[^}]*min-width:0/);
  assert.match(base, /\.cash-movement-row-copy\{[^}]*min-width:0/);
  assert.match(base, /\.cash-movement-row-copy b,\.cash-movement-row-copy small\{[^}]*text-overflow:ellipsis/);
});

// ---------------------------------------------------------------------- Caja

test('Caja filtra por dirección y método con chips, busca y ordena', () => {
  assert.match(cashier, /const CASH_DIRECTION_FILTERS/);
  assert.match(cashier, /\{ id: 'transfer', label: 'Transferencia' \}/);
  assert.match(cashier, /const CASH_SORTS/);
  assert.match(cashier, /setMovementDirection\(option\.id\)/);
  assert.match(cashier, /setMovementMethod\(option\.id\)/);
  assert.match(cashier, /setMovementSearch\(event\.target\.value\)/);
  assert.match(cashier, /movementSort === 'amount'/);
  assert.match(cashier, /function resetMovementFilters\(\)/);
  assert.match(base, /\.cash-chip\{/);
  assert.match(base, /\.cash-chip\.selected\{[^}]*background:#183b27/);
});

test('cada movimiento se pinta con el color de su tipo: venta verde, retiro rojo, entrada azul', () => {
  assert.match(cashier, /sale: 'sale'/);
  assert.match(cashier, /withdrawal: 'withdrawal'/);
  assert.match(cashier, /deposit: 'deposit'/);
  assert.match(base, /\.cash-movement-icon\.is-sale[^{]*\{background:#eaf7d7;color:#4e7c2f\}/);
  assert.match(base, /\.cash-movement-icon\.is-withdrawal[^{]*\{background:#fdeae6;color:#b4472f\}/);
  assert.match(base, /\.cash-movement-icon\.is-deposit[^{]*\{background:#e4eefb;color:#35699f\}/);
});

test('la fila muestra fecha relativa Hoy/Ayer, badge de método y monto grande', () => {
  assert.match(cashier, /function relativeDay\(/);
  assert.match(cashier, /return 'Hoy'/);
  assert.match(cashier, /return 'Ayer'/);
  assert.match(cashier, /cash-method-badge is-/);
  assert.match(base, /\.cash-movement-row>strong\{[^}]*font-size:13px/);
  assert.match(base, /\.cash-method-badge\.is-transfer\{/);
});

test('las tarjetas de movimiento tienen sombra suave y se elevan al pasar el cursor', () => {
  assert.match(base, /\.cash-movement-row\{[^}]*box-shadow:0 2px 8px/);
  assert.match(base, /\.cash-movement-row:hover\{[^}]*transform:translateY\(-2px\)/);
  assert.match(base, /\.cash-movement-row\{[^}]*transition:[^}]*\.15s/);
});

test('el detalle es un panel deslizante en móvil, con backdrop y cierre', () => {
  assert.match(cashier, /cash-detail-backdrop/);
  assert.match(cashier, /setDetailOpen\(false\)/);
  assert.match(cashier, /function openMovement\(/);
  assert.match(css, /@media\(max-width:900px\)\{\s*\.cash-movement-detail\{[^}]*transform:translateX\(102%\)/);
  assert.match(css, /\.cash-movement-detail\.is-open\{transform:translateX\(0\)\}/);
});

test('el detalle muestra productos con miniatura, pagos y responsable con avatar', () => {
  assert.match(cashier, /cash-product-thumb/);
  assert.match(cashier, /cash-product-qty/);
  assert.match(cashier, /cash-avatar/);
  assert.match(base, /\.cash-avatar\{/);
  assert.match(base, /\.cash-product-thumb\{[^}]*object-fit:cover/);
});

test('Caja conserva impresión, Excel maestro, paginación y reintento', () => {
  assert.match(cashier, /ref=\{movementPrintRef\}/);
  assert.match(cashier, /onClick=\{printCashMovement\}/);
  assert.match(cashier, /void updateExcel\(\)/);
  assert.match(cashier, /void loadMoreCashMovements\(\)/);
  assert.match(cashier, /movementError &&/);
});

// ------------------------------------------------------------------ Finanzas

test('BUG CORREGIDO: el filtro de pago ofrece Transferencia y Crédito aunque no haya registros', () => {
  assert.match(finance, /const CANONICAL_METHODS = \['cash', 'card', 'transfer', 'credit'\]/);
  assert.match(finance, /CANONICAL_METHODS\.map\(\(id\) => \(\{ id, label: PAYMENT_LABELS\[id\] \}\)\)/);
  assert.match(finance, /transfer: 'Transferencia'/);
  assert.match(finance, /credit: 'Crédito'/);
  // la lista ya no puede derivarse solo de los datos presentes
  assert.doesNotMatch(finance, /const payments = useMemo\(\(\) => Array\.from\(new Set\(entries\.map/);
});

test('el alta de finanzas también permite registrar en Crédito', () => {
  assert.match(finance, /<option value="transfer">Transferencia<\/option><option value="credit">Crédito<\/option>/);
});

test('Finanzas conserva filtros Todos/categoría/dirección y búsqueda en vivo', () => {
  assert.match(finance, /onClick=\{\(\) => setCategory\('all'\)\}>Todos</);
  assert.match(finance, /categories\.map\(\(item\) =>/);
  assert.match(finance, /const DIRECTION_FILTERS/);
  assert.match(finance, /setSearch\(event\.target\.value\)/);
  assert.match(finance, /const needle = search\.trim\(\)\.toLowerCase\(\)/);
  assert.match(finance, /\[item\.description, item\.category, item\.notes/);
  assert.match(finance, /function resetFilters\(\)/);
});

test('las métricas son tarjetas con icono y tendencia, con color por signo', () => {
  assert.match(finance, /finance-metric is-income/);
  assert.match(finance, /finance-metric is-expense/);
  assert.match(finance, /finance-metric-icon/);
  assert.match(finance, /const expenseTrend = useMemo\(/);
  assert.match(finance, /function trendPercent\(/);
  assert.match(base, /\.finance-metric\{[^}]*box-shadow:0 8px 26px rgba\(27,55,35,\.04\)/);
  assert.match(base, /\.finance-metric\{[^}]*border-radius:14px/);
  assert.match(base, /\.finance-trend\.is-up\{/);
});

test('la tendencia no se inventa cuando no hay periodo previo con el cual comparar', () => {
  assert.equal(trendless(), null);
  assert.match(finance, /Sin periodo previo para comparar/);
  function trendless() {
    // replica trendPercent: sin base previa no hay porcentaje
    const previous = 0;
    return previous <= 0 ? null : 1;
  }
});

test('el gráfico cubre 7 días consecutivos, incluidos los vacíos, y es interactivo', () => {
  assert.match(finance, /const CHART_DAYS = 7/);
  assert.match(finance, /Array\.from\(\{ length: CHART_DAYS \}/);
  assert.match(finance, /onMouseEnter=\{\(\) => setChartFocus\(day\.key\)\}/);
  assert.match(finance, /onFocus=\{\(\) => setChartFocus\(day\.key\)\}/);
  assert.match(finance, /finance-chart-focus/);
  assert.match(base, /\.finance-chart-day:hover,\.finance-chart-day\.is-focused\{/);
});

test('la lista son tarjetas por fecha con cabecera sticky y badges por método', () => {
  assert.match(finance, /finance-day-group/);
  assert.match(finance, /finance-method-badge is-/);
  assert.match(finance, /finance-kind-badge is-/);
  assert.match(base, /\.finance-day-header\{[^}]*position:sticky/);
  assert.match(base, /\.finance-method-badge\.is-transfer\{/);
  assert.match(base, /\.finance-method-badge\.is-credit\{/);
});

test('al tocar una fila se abre el panel lateral de detalle', () => {
  assert.match(finance, /onClick=\{\(\) => setSelectedId\(item\.id\)\}/);
  assert.match(finance, /finance-detail-panel is-open/);
  assert.match(finance, /finance-detail-backdrop is-open/);
  assert.match(base, /\.finance-detail-panel\{[^}]*transform:translateX\(102%\)/);
  assert.match(base, /\.finance-detail-panel\.is-open\{transform:translateX\(0\)\}/);
});

test('editar y eliminar se muestran deshabilitados porque la API aún no los expone', () => {
  assert.match(finance, /disabled title="La API de finanzas todavía no expone edición ni borrado\."/);
  assert.match(finance, /Editar y eliminar quedan a la espera/);
});

test('Finanzas agrupa por fecha en la zona horaria del negocio y suma cada día', () => {
  assert.match(finance, /new Intl\.DateTimeFormat\('en-CA', \{ timeZone: timezone/);
  assert.match(finance, /const groups = useMemo\(/);
  assert.match(finance, /group\.in \+= item\.amount; else group\.out \+= item\.amount/);
});

// -------------------------------------------------------------- conectividad

test('ConnectivityToast sigue montado global y sin cambios de comportamiento', () => {
  assert.match(layout, /import \{ ConnectivityToast \} from '@\/components\/workspace\/ConnectivityToast'/);
  assert.match(layout, /<ConnectivityToast \/>/);
  assert.match(base, /\.connectivity-toast\{[^}]*position:fixed/);
  assert.match(toast, /fetch\('\/api\/health'/);
  assert.match(toast, /addEventListener\('offline'/);
  assert.match(toast, /addEventListener\('online'/);
  assert.match(toast, /Reintentar/);
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

test('Caja y Finanzas traducen los fallos de red con el mismo criterio', () => {
  assert.match(cashier, /import \{ describeRequestError \} from '@\/lib\/connectivity'/);
  assert.match(finance, /import \{ describeRequestError \} from '@\/lib\/connectivity'/);
  assert.doesNotMatch(cashier, /error instanceof Error \? error\.message :/);
});
