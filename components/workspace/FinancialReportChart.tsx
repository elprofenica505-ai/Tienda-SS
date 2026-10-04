'use client';

import { useMemo, useState } from 'react';
import type { FinancialDailyRow } from '@/lib/financial-reports';

type Props = {
  data: FinancialDailyRow[];
  selectedDate: string;
  currency: string;
  onSelectDate: (date: string) => void;
};

type SeriesKey = 'sales' | 'netProfit' | 'expenses' | 'creditIssued';
type Series = { key: SeriesKey; label: string; color: string; fill: string };

const SERIES: Series[] = [
  { key: 'sales', label: 'Ventas netas', color: '#3f8c55', fill: 'rgba(63,140,85,.13)' },
  { key: 'netProfit', label: 'Ganancia neta', color: '#3978c5', fill: 'rgba(57,120,197,.11)' },
  { key: 'expenses', label: 'Gastos', color: '#d88839', fill: 'rgba(216,136,57,.13)' },
  { key: 'creditIssued', label: 'Crédito otorgado', color: '#9063c3', fill: 'rgba(144,99,195,.12)' },
];

function compactMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('es-NI', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString('es-NI')}`;
  }
}

function dateLabel(date: string, count: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat('es-NI', { day: '2-digit', month: count > 90 ? 'short' : undefined, timeZone: 'UTC' }).format(parsed);
}

function seriesValue(row: FinancialDailyRow, key: SeriesKey) {
  return row[key];
}

function makePath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
}

export function FinancialReportChart({ data, selectedDate, currency, onSelectDate }: Props) {
  const [hoveredDate, setHoveredDate] = useState('');
  const chart = useMemo(() => {
    const width = Math.max(1_100, 330 + data.length * 3.4);
    const height = 360;
    const left = 82;
    const top = 28;
    const bottom = 278;
    const depthX = 34;
    const depthY = 24;
    const maxSeriesDepth = (SERIES.length - 1) * 9;
    const right = width - 96 - maxSeriesDepth;
    const step = data.length > 1 ? (right - left) / (data.length - 1) : 0;
    const values = data.flatMap((row) => SERIES.map((series) => seriesValue(row, series.key)));
    const min = Math.min(0, ...values);
    const max = Math.max(1, ...values);
    const padding = Math.max(1, (max - min) * 0.08);
    const minValue = min < 0 ? min - padding : 0;
    const maxValue = max + padding;
    const yFor = (value: number, depth: number) => bottom - ((value - minValue) / (maxValue - minValue)) * (bottom - top) - depth * 7;
    const xFor = (index: number, depth: number) => left + (data.length > 1 ? index * step : (right - left) / 2) + depth * 9;
    const baselineFor = (depth: number) => yFor(0, depth);
    const ticks = Array.from({ length: 5 }, (_, index) => minValue + ((maxValue - minValue) * index) / 4);
    const targetCount = data.length <= 7 ? data.length : data.length <= 30 ? 7 : data.length <= 90 ? 7 : 12;
    const tickIndexes = Array.from({ length: targetCount }, (_, index) => Math.round((index * (data.length - 1)) / Math.max(1, targetCount - 1)));
    return { width, height, left, top, bottom, right, depthX, depthY, step, minValue, maxValue, yFor, xFor, baselineFor, ticks, tickIndexes };
  }, [data]);

  const visibleHover = data.find((row) => row.date === hoveredDate) || data.find((row) => row.date === selectedDate);
  const fmt = (value: number) => compactMoney(value, currency);

  return (
    <section className="financial-chart-card" aria-labelledby="financial-chart-title">
      <div className="financial-chart-heading">
        <div>
          <div className="eyebrow">Tendencia interactiva</div>
          <h2 id="financial-chart-title">Resultado financiero por día</h2>
          <p>Selecciona una fecha para abrir el detalle de ventas, ganancias, gastos y créditos.</p>
        </div>
        <span className="financial-chart-depth-badge">Vista 3D · fecha × monto × serie</span>
      </div>
      <div className="financial-chart-legend" aria-label="Series del gráfico">
        {SERIES.map((series) => <span key={series.key}><i style={{ background: series.color }} />{series.label}</span>)}
      </div>
      <div className="financial-chart-scroll">
        <svg
          className="financial-chart-svg"
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          width={chart.width}
          height={chart.height}
          role="img"
          aria-label="Gráfico financiero tridimensional e interactivo; el eje horizontal muestra las fechas."
        >
          <defs>
            <linearGradient id="financial-floor" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#f8fbf7" />
              <stop offset="1" stopColor="#e8f0e7" />
            </linearGradient>
            {SERIES.map((series) => (
              <linearGradient key={series.key} id={`gradient-${series.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={series.color} stopOpacity=".23" />
                <stop offset="1" stopColor={series.color} stopOpacity=".015" />
              </linearGradient>
            ))}
          </defs>

          {/* Perspectiva: el plano del suelo y la pared lateral hacen visible el eje de profundidad. */}
          <polygon
            points={`${chart.left},${chart.bottom} ${chart.right},${chart.bottom} ${chart.right + chart.depthX},${chart.bottom - chart.depthY} ${chart.left + chart.depthX},${chart.bottom - chart.depthY}`}
            fill="url(#financial-floor)"
            stroke="#d7e3d6"
          />
          <polygon
            points={`${chart.right},${chart.top} ${chart.right + chart.depthX},${chart.top - chart.depthY} ${chart.right + chart.depthX},${chart.bottom - chart.depthY} ${chart.right},${chart.bottom}`}
            fill="#e7eee6"
            stroke="#d7e3d6"
          />

          {chart.ticks.map((tick, index) => {
            const y = chart.yFor(tick, 0);
            const depthY = chart.yFor(tick, 1) - y;
            return (
              <g key={`grid-${index}`} aria-hidden="true">
                <line x1={chart.left} y1={y} x2={chart.right} y2={y} stroke={Math.abs(tick) < 0.0001 ? '#aab9aa' : '#d9e3d8'} strokeDasharray={Math.abs(tick) < 0.0001 ? undefined : '3 5'} />
                <line x1={chart.right} y1={y} x2={chart.right + chart.depthX} y2={y + depthY} stroke="#d4ded3" />
                <text x={chart.left - 12} y={y + 4} textAnchor="end" className="financial-axis-label">{fmt(tick)}</text>
              </g>
            );
          })}

          {data.map((row, index) => {
            const x = chart.xFor(index, 0);
            const hitWidth = Math.max(4, chart.step || 30);
            const xStart = data.length === 1 ? x - hitWidth / 2 : Math.max(chart.left - hitWidth / 2, x - hitWidth / 2);
            const isSelected = row.date === selectedDate;
            const label = `${row.date}. Ventas netas ${fmt(row.sales)}; ganancia neta ${fmt(row.netProfit)}; gastos ${fmt(row.expenses)}; crédito otorgado ${fmt(row.creditIssued)}.`;
            return (
              <g key={`date-hit-${row.date}`}>
                <rect
                  x={xStart}
                  y={chart.top - 5}
                  width={hitWidth}
                  height={chart.bottom - chart.top + chart.depthY + 30}
                  fill={isSelected ? 'rgba(63,140,85,.075)' : 'transparent'}
                  stroke={isSelected ? '#85ad6f' : 'transparent'}
                  strokeWidth="1"
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  aria-pressed={isSelected}
                  onClick={() => onSelectDate(row.date)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectDate(row.date); } }}
                  onMouseEnter={() => setHoveredDate(row.date)}
                  onMouseLeave={() => setHoveredDate('')}
                  onFocus={() => setHoveredDate(row.date)}
                  onBlur={() => setHoveredDate('')}
                  className="financial-date-hit"
                >
                  <title>{label}</title>
                </rect>
              </g>
            );
          })}

          {SERIES.map((series, seriesIndex) => {
            const depth = seriesIndex;
            const points = data.map((row, index) => ({
              x: chart.xFor(index, depth),
              y: chart.yFor(seriesValue(row, series.key), depth),
            }));
            const path = makePath(points);
            const baseline = chart.baselineFor(depth);
            const first = points[0];
            const last = points[points.length - 1];
            const area = first && last ? `${path} L${last.x.toFixed(1)},${baseline.toFixed(1)} L${first.x.toFixed(1)},${baseline.toFixed(1)} Z` : '';
            const selectedIndex = data.findIndex((row) => row.date === selectedDate);
            const selectedPoint = selectedIndex >= 0 ? points[selectedIndex] : null;
            return (
              <g key={series.key} aria-hidden="true" pointerEvents="none">
                {area && <path d={area} fill={`url(#gradient-${series.key})`} stroke="none" />}
                <path d={path} fill="none" stroke={series.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {selectedPoint && <circle cx={selectedPoint.x} cy={selectedPoint.y} r="4.6" fill={series.color} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
              </g>
            );
          })}

          <polyline points={`${chart.left},${chart.bottom} ${chart.right},${chart.bottom} ${chart.right + chart.depthX},${chart.bottom - chart.depthY}`} fill="none" stroke="#8ea28f" strokeWidth="1.3" />
          {chart.tickIndexes.map((index) => {
            const row = data[index];
            if (!row) return null;
            const x = chart.xFor(index, 0);
            return <g key={`tick-${row.date}`} aria-hidden="true"><line x1={x} y1={chart.bottom} x2={x} y2={chart.bottom + 5} stroke="#7b8e7e" /><text x={x} y={chart.bottom + 23} textAnchor="middle" className="financial-axis-label">{dateLabel(row.date, data.length)}</text></g>;
          })}
          <text x={(chart.left + chart.right) / 2} y={chart.height - 10} textAnchor="middle" className="financial-axis-title">Fecha</text>
          <text x={chart.right + chart.depthX - 5} y={chart.top - 7} textAnchor="end" className="financial-axis-title">Series</text>
        </svg>
      </div>
      {visibleHover && (
        <div className="financial-chart-focus" aria-live="polite">
          <strong>{visibleHover.date === selectedDate ? 'Día seleccionado' : 'Vista previa'} · {dateLabel(visibleHover.date, data.length)}</strong>
          <span>Ventas <b>{fmt(visibleHover.sales)}</b></span>
          <span>Ganancia neta <b>{fmt(visibleHover.netProfit)}</b></span>
          <span>Gastos <b>{fmt(visibleHover.expenses)}</b></span>
          <span>Crédito <b>{fmt(visibleHover.creditIssued)}</b></span>
        </div>
      )}
    </section>
  );
}
