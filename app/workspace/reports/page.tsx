'use client';

import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar';
import { FinancialReportChart } from '@/components/workspace/FinancialReportChart';
import { useTenant } from '@/components/tenant/TenantProvider';
import type { FinancialDailyRow, FinancialReportDataset, FinancialSaleDetail, FinancialCreditIssueInput, FinancialCreditCollectionInput, FinancialExpenseInput, FinancialReturnDetail } from '@/lib/financial-reports';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type ReportResponse = {
  ok: boolean;
  period: { days: number; from: string; to: string; timeZone: string };
  currency: string;
  branchId: string | null;
  summary: FinancialReportDataset['summary'];
  daily: FinancialDailyRow[];
  paymentMethods: FinancialReportDataset['paymentMethods'];
  topProducts: FinancialReportDataset['topProducts'];
};

type DayResponse = {
  ok: boolean;
  date: string;
  currency: string;
  day: FinancialDailyRow;
  details: {
    sales: FinancialSaleDetail[];
    returns: FinancialReturnDetail[];
    expenses: FinancialExpenseInput[];
    credit: {
      issued: FinancialCreditIssueInput[];
      collections: FinancialCreditCollectionInput[];
      currentOpenBalanceForDay: number;
      currentOpenBalance: number;
    };
  };
};

const PERIODS = [7, 30, 90, 365] as const;
const MANAGER_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);
const PAYMENT_LABELS: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', credit: 'Crédito', other: 'Otro' };

function currencyFormatter(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('es-NI', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function visibleDate(value: string, options?: Intl.DateTimeFormatOptions) {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat('es-NI', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC', ...options }).format(date);
}

function dateTimeLabel(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-NI', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone }).format(date);
}

function ReportsContent() {
  const router = useRouter();
  const { authUser, tenant, member, organization, loading: tenantLoading } = useTenant();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [branchFilter, setBranchFilter] = useState('');
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [detail, setDetail] = useState<DayResponse['details'] | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exporting, setExporting] = useState('');
  const [message, setMessage] = useState('');

  const headersFor = useCallback(async () => {
    if (!authUser || !tenant) throw new Error('Inicia sesión para consultar los reportes.');
    const headers: Record<string, string> = { Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id };
    if (branchFilter) headers['x-branch-id'] = branchFilter;
    return headers;
  }, [authUser, tenant, branchFilter]);

  useEffect(() => {
    if (!authUser || !tenant) return;
    let active = true;
    setLoading(true);
    setMessage('');
    setReport(null);
    setDetail(null);
    setSelectedDate('');
    void (async () => {
      try {
        const headers = await headersFor();
        const response = await fetch(`/api/reports?days=${days}`, { headers, cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los reportes.');
        if (!active) return;
        setReport(data as ReportResponse);
        setSelectedDate((current) => data.daily?.some((row: FinancialDailyRow) => row.date === current) ? current : data.daily?.at(-1)?.date || '');
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : 'Error cargando reportes.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [authUser, tenant, days, branchFilter, headersFor]);

  useEffect(() => {
    if (!authUser || !tenant || !selectedDate) return;
    let active = true;
    setDetail(null);
    setDetailLoading(true);
    void (async () => {
      try {
        const headers = await headersFor();
        const response = await fetch(`/api/reports?date=${encodeURIComponent(selectedDate)}`, { headers, cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo cargar el desglose del día.');
        if (active) setDetail((data as DayResponse).details);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : 'No se pudo cargar el desglose del día.');
      } finally {
        if (active) setDetailLoading(false);
      }
    })();
    return () => { active = false; };
  }, [authUser, tenant, selectedDate, branchFilter, headersFor]);

  const formatMoney = useCallback((value: number) => currencyFormatter(value, report?.currency || tenant?.currency || 'NIO'), [report?.currency, tenant?.currency]);
  const isManager = Boolean(member && MANAGER_ROLES.has(member.role));
  const branchLabel = useMemo(() => {
    if (branchFilter) return organization?.branches.find((branch) => branch.id === branchFilter)?.name || 'Sucursal seleccionada';
    return isManager ? 'Todas las sucursales' : 'Todas mis sucursales autorizadas';
  }, [branchFilter, organization, isManager]);
  const selectedDay = report?.daily.find((row) => row.date === selectedDate) || null;

  async function download(format: 'csv' | 'xlsx') {
    if (!authUser || !tenant) return;
    setExporting(format);
    setMessage('');
    try {
      const headers = await headersFor();
      const response = await fetch(`/api/reports/export?format=${format}&days=${days}`, { headers, cache: 'no-store' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo generar la descarga.');
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `reporte-financiero-${report?.period.from || ''}-a-${report?.period.to || ''}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo generar la descarga.');
    } finally {
      setExporting('');
    }
  }

  if (tenantLoading) return <div className="workspace-loading">Cargando Reportes Financieros...</div>;
  if (!authUser || !tenant || !member || !organization) {
    router.replace('/');
    return null;
  }

  return (
    <main className="workspace-page">
      <WorkspaceSidebar />
      <section className="workspace-main finance-reports-main">
        <header className="finance-reports-header">
          <div>
            <button className="text-link no-print" onClick={() => router.push('/workspace')}>← Resumen</button>
            <div className="eyebrow catalog-eyebrow">Tu espacio / Analítica financiera</div>
            <h1>Reportes Financieros</h1>
            <p>Ventas, utilidad y cartera de <strong>{tenant.name}</strong> · {branchLabel}.</p>
          </div>
          <div className="finance-report-actions no-print">
            <button className="report-action-button" disabled={Boolean(exporting) || loading || !report} onClick={() => void download('csv')}>{exporting === 'csv' ? 'Preparando CSV…' : '↓ CSV'}</button>
            <button className="report-action-button report-action-primary" disabled={Boolean(exporting) || loading || !report} onClick={() => void download('xlsx')}>{exporting === 'xlsx' ? 'Preparando Excel…' : '▦ Excel'}</button>
            <button className="report-action-button" onClick={() => window.print()}>⎙ Imprimir</button>
          </div>
        </header>

        {message && <div className="catalog-message" role="status">{message}</div>}

        <section className="finance-report-controlbar no-print" aria-label="Filtros del reporte">
          <div className="finance-period-control" role="group" aria-label="Período del reporte">
            {PERIODS.map((period) => (
              <button key={period} className={days === period ? 'selected' : ''} aria-pressed={days === period} onClick={() => setDays(period)}>
                {`${period} días`}
              </button>
            ))}
          </div>
          <label className="finance-branch-control">
            <span>Sucursal</span>
            <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} aria-label="Filtrar por sucursal">
              <option value="">{isManager ? 'Todas las sucursales de la empresa' : 'Todas mis sucursales autorizadas'}</option>
              {organization.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.code ? ` · ${branch.code}` : ''}</option>)}
            </select>
          </label>
          {report && <span className="finance-period-caption">{visibleDate(report.period.from)} — {visibleDate(report.period.to)} · {report.period.timeZone}</span>}
        </section>

        {loading || !report ? (
          <div className="financial-report-loading" role="status">{loading ? 'Calculando movimientos y costos históricos…' : 'No se pudieron cargar los reportes.'}</div>
        ) : (
          <>
            <section className="financial-report-metrics" aria-label="Resumen del período">
              <article className="financial-report-metric">
                <span>Ventas netas</span><strong>{formatMoney(report.summary.sales)}</strong>
                <small>{formatMoney(report.summary.grossSales)} brutas · {formatMoney(report.summary.returns)} en devoluciones</small>
              </article>
              <article className="financial-report-metric">
                <span>Ganancia bruta</span><strong>{formatMoney(report.summary.grossProfit)}</strong>
                <small>Después del costo histórico del inventario</small>
              </article>
              <article className="financial-report-metric">
                <span>Gastos</span><strong>{formatMoney(report.summary.expenses)}</strong>
                <small>Registrados en el período</small>
              </article>
              <article className={`financial-report-metric ${report.summary.netProfit < 0 ? 'is-negative' : 'is-highlight'}`}>
                <span>Ganancia neta</span><strong>{formatMoney(report.summary.netProfit)}</strong>
                <small>Ganancia bruta menos gastos</small>
              </article>
              <article className="financial-report-metric financial-credit-metric">
                <span>Crédito otorgado</span><strong>{formatMoney(report.summary.creditIssued)}</strong>
                <small>{formatMoney(report.summary.creditCollected)} en abonos aplicados</small>
              </article>
              <article className="financial-report-metric financial-credit-metric">
                <span>Cartera abierta actual</span><strong>{formatMoney(report.summary.openCredit)}</strong>
                <small>Saldo de la cartera de ConexiaX</small>
              </article>
            </section>

            <FinancialReportChart data={report.daily} selectedDate={selectedDate} currency={report.currency} onSelectDate={setSelectedDate} />

            {report.summary.uncostedLines > 0 && (
              <div className="financial-cost-warning" role="status">
                <strong>Cobertura de costos históricos: {report.summary.costCoverage?.toFixed(1) ?? '0'}%.</strong>
                {' '}{report.summary.uncostedLines} línea(s) no tienen un movimiento histórico de salida asociado. No se sustituyeron por el costo actual del catálogo; la ganancia se muestra con los costos históricos disponibles.
              </div>
            )}

            <section className="financial-day-panel" aria-labelledby="financial-day-title">
              <div className="financial-day-heading">
                <div>
                  <div className="eyebrow">Desglose seleccionado</div>
                  <h2 id="financial-day-title">{selectedDate ? visibleDate(selectedDate) : 'Selecciona un día'}</h2>
                </div>
                {selectedDay && <div className="financial-day-quick-summary"><span>{selectedDay.salesCount} venta(s)</span><span>Ganancia neta <b>{formatMoney(selectedDay.netProfit)}</b></span></div>}
              </div>

              {detailLoading || !detail ? (
                <div className="financial-detail-loading" role="status">{detailLoading ? 'Cargando el detalle del día…' : 'Selecciona un día del gráfico.'}</div>
              ) : (
                <>
                  <div className="financial-day-metrics">
                    <div><span>Ventas netas</span><strong>{formatMoney(selectedDay?.sales || 0)}</strong><small>{formatMoney(selectedDay?.grossSales || 0)} brutas − {formatMoney(selectedDay?.returns || 0)} devoluciones</small></div>
                    <div><span>Costo histórico</span><strong>{formatMoney(selectedDay?.costOfGoodsSold || 0)}</strong><small>De inventory_movements</small></div>
                    <div><span>Ganancia bruta</span><strong>{formatMoney(selectedDay?.grossProfit || 0)}</strong><small>Ventas netas − costo de ventas</small></div>
                    <div><span>Gastos</span><strong>{formatMoney(selectedDay?.expenses || 0)}</strong><small>Comprobantes del día</small></div>
                    <div className={(selectedDay?.netProfit || 0) < 0 ? 'is-negative' : ''}><span>Ganancia neta</span><strong>{formatMoney(selectedDay?.netProfit || 0)}</strong><small>Ganancia bruta − gastos</small></div>
                    <div className="financial-day-credit"><span>Crédito otorgado</span><strong>{formatMoney(selectedDay?.creditIssued || 0)}</strong><small>{formatMoney(selectedDay?.creditCollected || 0)} recibidos · {formatMoney(detail.credit.currentOpenBalanceForDay)} saldo actual de esos créditos</small></div>
                  </div>

                  <div className="financial-detail-grid">
                    <section className="financial-detail-card">
                      <div className="financial-detail-card-heading"><div><span className="eyebrow">Actividad comercial</span><h3>Ventas y ganancias</h3></div><b>{detail.sales.length}</b></div>
                      {detail.sales.length === 0 ? <p className="financial-empty-note">No hay ventas registradas este día.</p> : (
                        <div className="financial-table-scroll"><table className="financial-detail-table"><thead><tr><th>Factura</th><th>Hora</th><th>Venta</th><th>Costo histórico</th><th>Ganancia bruta</th></tr></thead><tbody>
                          {detail.sales.map((sale) => <tr key={sale.id}><td><b>{sale.invoiceNumber}</b><small>{sale.status === 'returned' ? 'Devuelta' : 'Completada'}</small></td><td>{dateTimeLabel(sale.createdAt, report.period.timeZone)}</td><td>{formatMoney(sale.total)}</td><td>{formatMoney(sale.historicalCost)}{sale.missingCostLines > 0 && <small className="financial-table-warning">Costo parcial</small>}</td><td>{formatMoney(sale.grossProfit)}</td></tr>)}
                        </tbody></table></div>
                      )}
                      {detail.returns.length > 0 && <div className="financial-inline-list"><b>Devoluciones del día</b>{detail.returns.map((item) => <span key={item.id}>{item.invoiceNumber} · {formatMoney(item.amount)} reembolsado · {formatMoney(item.historicalCostRecovered)} de costo histórico recuperado</span>)}</div>}
                    </section>

                    <section className="financial-detail-card">
                      <div className="financial-detail-card-heading"><div><span className="eyebrow">Egresos</span><h3>Gastos del día</h3></div><b>{detail.expenses.length}</b></div>
                      {detail.expenses.length === 0 ? <p className="financial-empty-note">No hay gastos registrados este día.</p> : (
                        <div className="financial-table-scroll"><table className="financial-detail-table"><thead><tr><th>Descripción</th><th>Categoría</th><th>Método</th><th>Importe</th></tr></thead><tbody>
                          {detail.expenses.map((expense) => <tr key={expense.id}><td>{expense.description}</td><td>{expense.category}</td><td>{PAYMENT_LABELS[expense.paymentMethod] || expense.paymentMethod}</td><td>{formatMoney(expense.amount)}</td></tr>)}
                        </tbody></table></div>
                      )}
                    </section>

                    <section className="financial-detail-card financial-credit-detail-card">
                      <div className="financial-detail-card-heading"><div><span className="eyebrow">Cartera ConexiaX</span><h3>Créditos y abonos aplicados</h3></div><b>{detail.credit.issued.length + detail.credit.collections.length}</b></div>
                      <div className="financial-credit-summary-row"><span>Crédito otorgado este día</span><strong>{formatMoney(selectedDay?.creditIssued || 0)}</strong></div>
                      <div className="financial-credit-summary-row"><span>Abonos aplicados este día</span><strong>{formatMoney(selectedDay?.creditCollected || 0)}</strong></div>
                      <div className="financial-credit-summary-row"><span>Saldo actual de créditos otorgados este día</span><strong>{formatMoney(detail.credit.currentOpenBalanceForDay)}</strong></div>
                      {detail.credit.issued.length > 0 && <div className="financial-credit-events"><b>Créditos otorgados</b>{detail.credit.issued.map((credit) => <span key={credit.id}>{credit.saleNumber} · {credit.customerName} · {formatMoney(credit.originalAmount)} · saldo {formatMoney(credit.outstandingAmount)}</span>)}</div>}
                      {detail.credit.collections.length > 0 && <div className="financial-credit-events"><b>Abonos recibidos</b>{detail.credit.collections.map((payment) => <span key={payment.id}>{payment.receiptNumber} · {payment.saleNumber} · {payment.customerName} · {PAYMENT_LABELS[payment.paymentMethod] || payment.paymentMethod} · {formatMoney(payment.amount)}</span>)}</div>}
                      {!detail.credit.issued.length && !detail.credit.collections.length && <p className="financial-empty-note">No hubo nuevos créditos ni abonos aplicados este día.</p>}
                    </section>
                  </div>
                </>
              )}
            </section>

            <section className="financial-support-grid">
              <div className="financial-detail-card">
                <div className="financial-detail-card-heading"><div><span className="eyebrow">Inventario</span><h3>Productos con más ventas</h3></div></div>
                {report.topProducts.length === 0 ? <p className="financial-empty-note">Aún no hay ventas con productos.</p> : report.topProducts.map((product, index) => <div className="financial-ranking-row" key={`${product.name}-${index}`}><span>{index + 1}</span><b>{product.name}</b><small>{product.quantity} u.</small><strong>{formatMoney(product.revenue)}</strong></div>)}
              </div>
              <div className="financial-detail-card">
                <div className="financial-detail-card-heading"><div><span className="eyebrow">Cobros</span><h3>Métodos de pago</h3></div></div>
                {report.paymentMethods.length === 0 ? <p className="financial-empty-note">No hay cobros registrados en el período.</p> : report.paymentMethods.map((payment) => <div className="financial-payment-row" key={payment.method}><span>{PAYMENT_LABELS[payment.method] || payment.method}</span><strong>{formatMoney(payment.total)}</strong></div>)}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

export default function ReportsPage() {
  return <ReportsContent />;
}
