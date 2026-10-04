'use client';

import type { FinancialHourlyRow } from '@/lib/financial-reports';

type PaymentMethod = { method: string; total: number };

type Props = {
  hourly: FinancialHourlyRow[];
  paymentMethods: PaymentMethod[];
  currency: string;
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  credit: 'Crédito',
  other: 'Otro',
};
const PAYMENT_COLORS = ['#3f8c55', '#3978c5', '#d88839', '#9063c3', '#d16b62', '#4e9d9a'];

function currencyFormatter(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('es-NI', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

export function FinancialReportInsights({ hourly, paymentMethods, currency }: Props) {
  const money = (value: number) => currencyFormatter(value, currency);
  const maxHourly = Math.max(1, ...hourly.map((row) => Math.max(Math.abs(row.sales), Math.abs(row.expenses))));
  const visiblePayments = paymentMethods.filter((row) => Number.isFinite(row.total) && row.total > 0);
  const paymentTotal = visiblePayments.reduce((total, row) => total + row.total, 0);
  let cursor = 0;
  const pieStops = visiblePayments.map((row, index) => {
    const start = cursor;
    const end = index === visiblePayments.length - 1 ? 100 : cursor + (row.total / paymentTotal) * 100;
    cursor = end;
    return `${PAYMENT_COLORS[index % PAYMENT_COLORS.length]} ${start.toFixed(3)}% ${end.toFixed(3)}%`;
  });

  return (
    <section className="financial-insights-grid" aria-label="Gráficos de actividad y cobros">
      <article className="financial-insight-card" aria-labelledby="financial-hourly-title">
        <div className="financial-insight-heading">
          <div>
            <div className="eyebrow">Actividad · hora local</div>
            <h2 id="financial-hourly-title">Ventas y gastos por hora</h2>
            <p>Acumulado por hora durante el período y dentro del rango horario seleccionado.</p>
          </div>
          <div className="financial-insight-legend" aria-label="Series">
            <span><i className="financial-insight-sales-dot" />Ventas netas</span>
            <span><i className="financial-insight-expenses-dot" />Gastos</span>
          </div>
        </div>

        {hourly.length === 0 ? (
          <p className="financial-insight-empty">No hay horas dentro del filtro seleccionado.</p>
        ) : (
          <>
            <div className="financial-hourly-chart-scroll">
              <div className="financial-hourly-chart" role="img" aria-label="Gráfico de barras agrupadas de ventas netas y gastos por hora" style={{ minWidth: `${Math.max(620, hourly.length * 34)}px` }}>
                {hourly.map((row) => (
                  <div className="financial-hourly-column" key={row.hour} title={`${row.label} · ventas netas ${money(row.sales)} · gastos ${money(row.expenses)}`}>
                    <div className="financial-hourly-bars">
                      <i className={`financial-hourly-bar financial-hourly-sales${row.sales < 0 ? ' is-negative' : ''}`} style={{ height: `${row.sales ? Math.max(2, Math.abs(row.sales) / maxHourly * 132) : 0}px` }} />
                      <i className="financial-hourly-bar financial-hourly-expenses" style={{ height: `${row.expenses ? Math.max(2, Math.abs(row.expenses) / maxHourly * 132) : 0}px` }} />
                    </div>
                    <small>{row.hour % 2 === 0 || row.hour === hourly.at(-1)?.hour ? row.label.slice(0, 2) : ''}</small>
                  </div>
                ))}
              </div>
            </div>
            <div className="financial-insight-table-scroll">
              <table className="financial-hourly-table">
                <thead><tr><th>Hora</th><th>Ventas</th><th>Ventas netas</th><th>Gastos</th><th>Ganancia neta</th></tr></thead>
                <tbody>{hourly.map((row) => (
                  <tr key={row.hour}>
                    <td>{row.label}</td><td>{row.salesCount}</td><td>{money(row.sales)}</td><td>{money(row.expenses)}</td>
                    <td className={row.netProfit < 0 ? 'is-negative' : ''}>{money(row.netProfit)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}
      </article>

      <article className="financial-insight-card" aria-labelledby="financial-payment-pie-title">
        <div className="financial-insight-heading">
          <div>
            <div className="eyebrow">Cobros</div>
            <h2 id="financial-payment-pie-title">Métodos de pago</h2>
            <p>Distribución de los pagos registrados en el mismo período y horario.</p>
          </div>
        </div>

        {!visiblePayments.length ? (
          <p className="financial-insight-empty">No hay pagos dentro del filtro seleccionado.</p>
        ) : (
          <div className="financial-payment-pie-layout">
            <div className="financial-payment-pie" role="img" aria-label={`Gráfico circular de ${visiblePayments.length} métodos de pago`} style={{ background: `conic-gradient(${pieStops.join(', ')})` }}>
              <div className="financial-payment-pie-center"><strong>{money(paymentTotal)}</strong><small>Total pagado</small></div>
            </div>
            <div className="financial-payment-legend">
              {visiblePayments.map((row, index) => (
                <div className="financial-payment-legend-row" key={row.method}>
                  <i style={{ background: PAYMENT_COLORS[index % PAYMENT_COLORS.length] }} />
                  <span>{PAYMENT_LABELS[row.method] || row.method}</span>
                  <strong>{money(row.total)}</strong>
                  <small>{(row.total / paymentTotal * 100).toFixed(1)}%</small>
                </div>
              ))}
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
