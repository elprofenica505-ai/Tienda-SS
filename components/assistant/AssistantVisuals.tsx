'use client';

import type { AssistantVisual, VisualBar, VisualPie } from '@/lib/ai/visuals';

export type AssistantVisualsProps = {
  visual: AssistantVisual;
  /** Formatea un monto con la moneda y el idioma del negocio. */
  money: (value: number) => string;
};

/** Paleta del asistente; se repite cuando hay más series que colores. */
const SERIES_COLORS = ['#4b8c3f', '#7fb356', '#2f6d4f', '#d9c05a', '#d9a441', '#c96f43', '#5f7fbd', '#8b6bb1'];

/** Mismos nombres que usa Reportes para los métodos de pago. */
const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  credit: 'Crédito',
  other: 'Otro',
};

function paymentLabel(method: string): string {
  return PAYMENT_LABELS[method] || method;
}

/** Sólo las columnas de dinero se formatean con la moneda del negocio. */
const MONEY_COLUMN = /ingreso|ventas|utilidad|hoy|ayer|total|margen|gasto/i;

function color(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

function formatCell(value: string | number, column: string, money: (value: number) => string) {
  if (typeof value !== 'number') return value;
  return MONEY_COLUMN.test(column) ? money(value) : value.toLocaleString('es-NI');
}

function barWidth(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  // 2% mínimo para que una barra con valor real siempre sea visible.
  return Math.max(2, Math.round((value / max) * 100));
}

function conicGradient(items: VisualPie[]): string {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  if (!(total > 0)) return 'conic-gradient(#e6ede4 0% 100%)';
  let cursor = 0;
  const stops = items.map((item, index) => {
    const start = cursor;
    cursor += (Math.max(0, item.value) / total) * 100;
    return `${color(index)} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

function BarsBlock({ title, items, money }: { title: string; items: VisualBar[]; money: (value: number) => string }) {
  const max = items.reduce((highest, item) => (item.value > highest ? item.value : highest), 0);
  return (
    <section className="viz-block">
      <h4 className="viz-title">{title}</h4>
      <div className="viz-bars">
        {items.map((item, index) => (
          <div className="viz-bar-row" key={`${item.label}-${index}`}>
            <span className="viz-bar-label">{item.label}</span>
            <span className="viz-bar-track" aria-hidden="true">
              <span className="viz-bar-fill" style={{ width: `${barWidth(item.value, max)}%` }} />
            </span>
            <span className="viz-bar-value">{money(item.value)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PieBlock({ title, items, money }: { title: string; items: VisualPie[]; money: (value: number) => string }) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  return (
    <section className="viz-block">
      <h4 className="viz-title">{title}</h4>
      <div className="viz-pie">
        <div
          className="viz-pie-chart"
          style={{ background: conicGradient(items) }}
          role="img"
          aria-label={items.map((item) => `${paymentLabel(item.label)}: ${money(item.value)}`).join(', ')}
        />
        <ul className="viz-legend">
          {items.map((item, index) => (
            <li className="viz-legend-item" key={`${item.label}-${index}`}>
              <span className="viz-legend-dot" style={{ background: color(index) }} aria-hidden="true" />
              <span className="viz-legend-label">{paymentLabel(item.label)}</span>
              <span className="viz-legend-value">{money(item.value)}{total > 0 ? ` · ${Math.round((Math.max(0, item.value) / total) * 100)}%` : ''}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function TableBlock({
  title,
  columns,
  rows,
  money,
}: {
  title: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  money: (value: number) => string;
}) {
  return (
    <section className="viz-block">
      <h4 className="viz-title">{title}</h4>
      <div className="viz-table-scroll">
        <table className="viz-table">
          <thead>
            <tr>{columns.map((column, index) => <th scope="col" key={`${column}-${index}`}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className={typeof cell === 'number' && MONEY_COLUMN.test(columns[cellIndex] || '') ? 'viz-cell-money' : undefined}>
                    {formatCell(cell, columns[cellIndex] || '', money)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Gráficas del asistente construidas con el dataset financiero real. Se pintan
 * con divs, conic-gradient y una tabla: sin SVG ni dependencias nuevas, y sin
 * inventar series (si el contexto no trae análisis, el componente no muestra nada).
 */
export function AssistantVisuals({ visual, money }: AssistantVisualsProps) {
  if (!visual) return null;
  if (!visual.bars && !visual.pie && !visual.table) return null;
  return (
    <div className="assistant-visuals" aria-label="Gráficas y cuadros comparativos de Conexia">
      {visual.bars && <BarsBlock title={visual.bars.title} items={visual.bars.items} money={money} />}
      {visual.pie && <PieBlock title={visual.pie.title} items={visual.pie.items} money={money} />}
      {visual.table && <TableBlock title={visual.table.title} columns={visual.table.columns} rows={visual.table.rows} money={money} />}
    </div>
  );
}

export default AssistantVisuals;
