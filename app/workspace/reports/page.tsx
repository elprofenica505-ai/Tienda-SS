'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar';
import { useTenant } from '@/components/tenant/TenantProvider';
import { formatMoney } from '@/lib/currency';
import { FinancialWorkbookExportError, prepareMasterWorkbookHandle, updateMasterWorkbook } from '@/lib/financial-workbook-storage';

type Daily = { date: string; netSales: number; profit: number; expenses: number; credits: number };
type Report = {
  summary: {
    income: number;
    expenses: number;
    cashAdjustments: number;
    net: number;
    netSales: number;
    profit: number;
    credits: number;
    sales: number;
    averageSale: number;
    openCredit: number;
    collectedCredit: number;
  };
  daily: Daily[];
  paymentMethods: { method: string; total: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  recentExpenses: { id: string; description: string; amount: number; category?: string }[];
};

const PAYMENT_METHOD_NAMES: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  credit: 'Crédito',
  other: 'Otro',
};

function ReportsContent() {
  const router = useRouter();
  const { authUser, tenant, member, loading: tenantLoading } = useTenant();
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [exportingWorkbook, setExportingWorkbook] = useState(false);
  const [workbookReady, setWorkbookReady] = useState(false);

  const money = useCallback((value: number) => formatMoney(value, tenant?.currency || 'NIO', tenant?.locale || 'es-NI'), [tenant?.currency, tenant?.locale]);

  const load = useCallback(async () => {
    if (!authUser || !tenant) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`/api/reports?days=${days}`, {
        headers: { Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id },
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los reportes.');
      setReport(data as Report);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error cargando reportes.');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [authUser, tenant, days]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!tenant?.id) return;
    let active = true;
    setWorkbookReady(false);
    void prepareMasterWorkbookHandle(tenant.id).finally(() => {
      if (active) setWorkbookReady(true);
    });
    return () => { active = false; };
  }, [tenant?.id]);

  async function updateExcel() {
    if (!authUser || !tenant) return;
    setExportingWorkbook(true);
    setMessage('Preparando el Excel maestro de la empresa…');
    try {
      const result = await updateMasterWorkbook({ tenantId: tenant.id, tenantName: tenant.name, token: () => authUser.getIdToken() });
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof FinancialWorkbookExportError ? error.message : error instanceof Error ? error.message : 'No se pudo actualizar el Excel maestro.');
    } finally {
      setExportingWorkbook(false);
    }
  }

  if (tenantLoading) return <div className="workspace-loading">Cargando reportes financieros…</div>;
  if (!authUser || !tenant || !member) {
    router.replace('/');
    return null;
  }
  if (loading || !report) return <div className="workspace-loading" role="status">{message || 'Generando análisis financiero…'}</div>;

  const maxChart = Math.max(1, ...report.daily.flatMap((item) => [item.netSales, item.profit, item.expenses, item.credits].map((value) => Math.abs(value))));
  const maxProduct = Math.max(1, ...report.topProducts.map((item) => item.revenue));
  const chartHeight = 145;

  return (
    <main className="workspace-page">
      <WorkspaceSidebar />
      <section className="workspace-main reports-main">
        <header className="reports-header">
          <div>
            <button className="text-link" type="button" onClick={() => router.push('/workspace')}>← Resumen</button>
            <div className="eyebrow catalog-eyebrow">Tu espacio / Analítica</div>
            <h1>Reportes financieros</h1>
            <p>Decisiones basadas en datos de <strong>{tenant.name}</strong>.</p>
          </div>
          <div className="reports-header-actions no-print">
            <label className="sr-only" htmlFor="report-period">Período del reporte</label>
            <select id="report-period" className="period-select" value={days} onChange={(event) => setDays(Number(event.target.value))}>
              <option value="7">Últimos 7 días</option>
              <option value="30">Últimos 30 días</option>
              <option value="90">Últimos 90 días</option>
              <option value="365">Último año</option>
            </select>
            <button className="button button-secondary" type="button" onClick={() => void updateExcel()} disabled={exportingWorkbook || !workbookReady}>
              {exportingWorkbook ? 'Actualizando…' : workbookReady ? 'Actualizar Excel maestro' : 'Preparando…'}
            </button>
          </div>
        </header>

        {message && <div className="catalog-message" role="status">{message}</div>}

        <div className="reports-metrics">
          <div><small>Ingresos cobrados</small><strong>{money(report.summary.income)}</strong><span>{report.summary.sales} ventas</span></div>
          <div><small>Ventas netas</small><strong>{money(report.summary.netSales)}</strong><span>después de devoluciones</span></div>
          <div><small>Ganancia bruta estimada</small><strong>{money(report.summary.profit)}</strong><span>antes de gastos</span></div>
          <div><small>Gastos</small><strong>{money(report.summary.expenses)}</strong><span>egresos registrados</span></div>
          <div><small>Créditos generados</small><strong>{money(report.summary.credits)}</strong><span>ventas a crédito</span></div>
          <div><small>Ticket promedio</small><strong>{money(report.summary.averageSale)}</strong><span>por venta registrada</span></div>
        </div>

        <div className="report-chart-panel">
          <div className="report-panel-head">
            <div><div className="eyebrow">Tendencia · últimos {days} días</div><h2>Resumen diario de actividad</h2></div>
            <div className="chart-legend" aria-label="Leyenda de series">
              <span className="legend-net-sales">Ventas netas</span>
              <span className="legend-profit">Ganancia</span>
              <span className="legend-expense">Gastos</span>
              <span className="legend-credit">Créditos</span>
            </div>
          </div>
          <div className="report-chart-scroll" role="img" aria-label="Gráfico diario de ventas netas, ganancias, gastos y créditos">
            <div className="bar-chart">
              {report.daily.map((item) => {
                const height = (value: number) => `${Math.max(2, Math.abs(value) / maxChart * chartHeight)}px`;
                const label = `${item.date}: ventas netas ${money(item.netSales)}, ganancia ${money(item.profit)}, gastos ${money(item.expenses)}, créditos ${money(item.credits)}`;
                return (
                  <div className="chart-day" key={item.date} title={label}>
                    <div className="bars">
                      <i className={`bar-net-sales ${item.netSales < 0 ? 'bar-negative' : ''}`} style={{ height: height(item.netSales) }} />
                      <i className={`bar-profit ${item.profit < 0 ? 'bar-negative' : ''}`} style={{ height: height(item.profit) }} />
                      <i className={`bar-expense ${item.expenses < 0 ? 'bar-negative' : ''}`} style={{ height: height(item.expenses) }} />
                      <i className={`bar-credit ${item.credits < 0 ? 'bar-negative' : ''}`} style={{ height: height(item.credits) }} />
                    </div>
                    <small>{item.date.slice(8)}</small>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="reports-grid">
          <div className="report-panel">
            <div className="report-panel-head"><div><div className="eyebrow">Rendimiento</div><h2>Productos más vendidos</h2></div></div>
            {report.topProducts.length === 0 ? <div className="inventory-empty">Aún no hay ventas con productos.</div> : report.topProducts.map((item, index) => (
              <div className="ranking-row" key={`${item.name}-${index}`}>
                <span>{index + 1}</span>
                <div><b>{item.name}</b><small>{item.quantity} unidades</small><div className="ranking-bar"><i style={{ width: `${item.revenue / maxProduct * 100}%` }} /></div></div>
                <strong>{money(item.revenue)}</strong>
              </div>
            ))}
          </div>

          <div className="report-panel">
            <div className="report-panel-head"><div><div className="eyebrow">Cobros</div><h2>Métodos de pago</h2></div></div>
            {report.paymentMethods.length === 0 ? <div className="inventory-empty">Aún no hay pagos registrados.</div> : report.paymentMethods.map((item) => (
              <div className="payment-report-row" key={item.method}>
                <span>{PAYMENT_METHOD_NAMES[item.method] || item.method}</span>
                <div><i style={{ width: `${Math.min(100, item.total / Math.max(report.summary.income, 1) * 100)}%` }} /></div>
                <strong>{money(item.total)}</strong>
              </div>
            ))}
            <div className="credit-summary"><span>Saldo de crédito pendiente</span><strong>{money(report.summary.openCredit)}</strong></div>
            <div className="credit-summary"><span>Crédito cobrado en período</span><strong>{money(report.summary.collectedCredit)}</strong></div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function ReportsPage() {
  return <ReportsContent />;
}
