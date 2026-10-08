import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync('components/assistant/AssistantVisuals.tsx', 'utf8');
const visuals = readFileSync('lib/ai/visuals.ts', 'utf8');
const chatRoute = readFileSync('app/api/ai/chat/route.ts', 'utf8');
const assistantPage = readFileSync('app/workspace/assistant/page.tsx', 'utf8');
const styles = readFileSync('app/globals.css', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string>; scripts: { test: string } };

test('el componente de gráficas pinta barras, pastel y tabla sin dependencias nuevas', () => {
  assert.match(component, /export function AssistantVisuals/);
  // Barras con ancho porcentual en divs, no con librerías de charting.
  assert.match(component, /viz-bar-row/);
  assert.match(component, /width: `\$\{barWidth\(/);
  assert.match(component, /const barWidth = |function barWidth\(/);
  // Pastel con conic-gradient y leyenda; tabla real para el cuadro comparativo.
  assert.match(component, /conic-gradient\(/);
  assert.match(component, /viz-pie-chart/);
  assert.match(component, /viz-legend/);
  assert.match(component, /<table className="viz-table">/);
  // Los métodos de pago se muestran con los mismos nombres que Reportes.
  assert.match(component, /const PAYMENT_LABELS: Record<string, string> = \{\n\s*cash: 'Efectivo',/);
  assert.match(component, /paymentLabel\(item\.label\)/);
  // Sólo las columnas de dinero usan la moneda del negocio.
  assert.match(component, /const MONEY_COLUMN = \/ingreso\|ventas\|utilidad\|hoy\|ayer\|total\|margen\|gasto\/i/);
  assert.match(component, /MONEY_COLUMN\.test\(column\) \? money\(value\)/);
  // Sin SVG ni paquetes externos: CSS puro y React.
  assert.doesNotMatch(component, /<svg/);
  assert.doesNotMatch(component, /from '(?!@\/)[^']+'/, 'el componente no puede agregar dependencias');
  for (const dependency of ['chart.js', 'recharts', 'd3', 'victory', 'apexcharts']) {
    assert.equal(dependency in packageJson.dependencies, false, `${dependency} no puede entrar como dependencia`);
  }
});

test('el chat devuelve las gráficas calculadas en el servidor con el análisis real', () => {
  assert.match(chatRoute, /import \{ buildAssistantVisuals \} from '@\/lib\/ai\/visuals'/);
  assert.match(chatRoute, /const visual = buildAssistantVisuals\(businessContext\)/);
  assert.match(chatRoute, /visual,/, 'la respuesta de éxito incluye las gráficas');
  // El análisis y la rentabilidad nacen del dataset de 30 días de Reportes.
  assert.match(visuals, /analysis\.daily\.map/);
  assert.match(visuals, /analysis\.paymentMethods\.filter/);
  assert.match(visuals, /analysis\.topProducts\.reduce/);
});

test('la página del asistente dibuja las gráficas dentro de la burbuja y permite exportar Word', () => {
  assert.match(assistantPage, /import \{ AssistantVisuals \} from '@\/components\/assistant\/AssistantVisuals'/);
  assert.match(assistantPage, /import \{ formatMoney \} from '@\/lib\/currency'/);
  assert.match(assistantPage, /import type \{ AssistantVisual \} from '@\/lib\/ai\/visuals'/);
  assert.match(assistantPage, /visual\?: AssistantVisual \| null/);
  assert.match(assistantPage, /const money = \(value: number\) => formatMoney\(value, tenant\?\.currency, tenant\?\.locale\)/);
  assert.match(assistantPage, /visual: \(data\.visual as AssistantVisual \| null\) \|\| null/);
  assert.match(assistantPage, /message\.role === 'assistant' && message\.visual && <AssistantVisuals visual=\{message\.visual\} money=\{money\}/);
  assert.match(assistantPage, /⬇ Informe Word/);
  // El informe usa /api/reports (view) y se arma en el navegador: no gasta la
  // cuota de 3 exportaciones ni consultas de Gemini.
  assert.match(assistantPage, /fetch\('\/api\/reports\?days=30'/);
  assert.match(assistantPage, /type: 'application\/msword'/);
  assert.match(assistantPage, /xmlns:w="urn:schemas-microsoft-com:office:word"/);
  assert.match(assistantPage, /Resumen del período/);
  assert.match(assistantPage, /Detalle diario/);
  assert.match(assistantPage, /Top productos por ingreso/);
  assert.match(assistantPage, /Ingresos por método de pago/);
  assert.doesNotMatch(assistantPage, /reports\/export/, 'la descarga no puede consumir la cuota de exportaciones');
  assert.doesNotMatch(assistantPage, /consume_financial_report_export/);
  assert.doesNotMatch(assistantPage, /consume_ai_chat_quota/, 'la exportación no reserva cuota de IA');
});

test('los estilos de las gráficas existen y se adaptan a móvil hasta 720px', () => {
  for (const selector of ['.assistant-visuals', '.viz-block', '.viz-bars', '.viz-bar-row', '.viz-bar-track', '.viz-bar-fill', '.viz-bar-label', '.viz-bar-value', '.viz-pie', '.viz-pie-chart', '.viz-legend', '.viz-table']) {
    assert.ok(styles.includes(selector), `falta el estilo ${selector}`);
  }
  const mobile = styles.slice(styles.lastIndexOf('@media(max-width:720px)'));
  assert.match(mobile, /\.assistant-visuals\{/);
  assert.match(mobile, /\.viz-pie\{align-items:flex-start;flex-direction:column/);
  assert.match(mobile, /\.viz-pie-chart\{height:94px;width:94px\}/);
  // La cuota de IA sigue en 20/día y el corte móvil del asistente sigue en 720px.
  assert.match(packageJson.scripts.test, /tests\/assistant-visuals\.test\.ts/);
  assert.equal(packageJson.dependencies['@google/generative-ai'], '^0.24.1');
});
