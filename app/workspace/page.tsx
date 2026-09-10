'use client';

import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar';
import { Reveal } from '@/components/workspace/Reveal';
import { RevenueChart } from '@/components/workspace/RevenueChart';
import { WorkspaceSkeleton } from '@/components/workspace/WorkspaceSkeleton';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TenantProvider, useTenant } from '@/components/tenant/TenantProvider';
import { formatMoney } from '@/lib/currency';

type Daily = { date: string; income: number; expenses: number; net: number };
type Report = {
  summary: { income: number; expenses: number; net: number; sales: number; averageSale: number; openCredit: number };
  daily: Daily[];
  topProducts: { name: string; quantity: number; revenue: number }[];
};
type Product = { id: string; name: string; stock?: number; minStock?: number; itemType?: string; active?: boolean };
type DailyStats = { salesCount: number; salesTotal: number; updatedAt?: unknown };

type DashboardData = {
  report: Report;
  dailyStats: DailyStats;
  products: Product[];
  customers: { id: string; name: string; creditBalance?: number }[];
  pendingPresales: { id: string; ticketCode: string; total: number; status: string }[];
};

function WorkspaceContent() {
  const router = useRouter();
  const { authUser, tenant, member, loading: tenantLoading, error: tenantError } = useTenant();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadDashboard = useCallback(async () => {
    if (!authUser || !tenant) return;
    setLoading(true);
    setMessage('');
    try {
      const token = await authUser.getIdToken();
      const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': tenant.id };
      const [reportResponse, statsResponse, catalogResponse, contactsResponse, presalesResponse] = await Promise.all([
        fetch('/api/reports?days=30', { headers, cache: 'no-store' }),
        fetch('/api/stats/daily', { headers, cache: 'no-store' }),
        fetch('/api/catalog', { headers, cache: 'no-store' }),
        fetch('/api/contacts?type=customer', { headers, cache: 'no-store' }),
        fetch('/api/presales', { headers, cache: 'no-store' }),
      ]);
      const [report, dailyStatsResponse, catalog, contacts, presales] = await Promise.all([
        reportResponse.json(),
        statsResponse.json(),
        catalogResponse.json(),
        contactsResponse.json(),
        presalesResponse.json(),
      ]);
      if (!reportResponse.ok) throw new Error(report.error || 'No se pudo cargar el resumen.');
      if (!statsResponse.ok) throw new Error(dailyStatsResponse.error || 'No se pudieron cargar las estadísticas diarias.');
      if (!catalogResponse.ok) throw new Error(catalog.error || 'No se pudo cargar el catálogo.');
      if (!contactsResponse.ok) throw new Error(contacts.error || 'No se pudieron cargar los clientes.');
      if (!presalesResponse.ok) setMessage('No se pudieron cargar las preventas pendientes. El resto del dashboard está disponible.');
      setData({ report, dailyStats: dailyStatsResponse.stats || { salesCount: 0, salesTotal: 0 }, products: catalog.products || [], customers: contacts.contacts || [], pendingPresales: (presales.presales || []).filter((item: { status: string }) => item.status === 'sent_to_cashier') });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar el centro de mando.');
    } finally {
      setLoading(false);
    }
  }, [authUser, tenant]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const lowStock = useMemo(() => (data?.products || []).filter((product) => product.active !== false && product.itemType !== 'service' && Number(product.stock || 0) <= Number(product.minStock || 0)), [data]);
  const openCredit = useMemo(() => (data?.customers || []).reduce((sum, customer) => sum + Number(customer.creditBalance || 0), 0), [data]);
  const maxDaily = Math.max(...(data?.report.daily || []).map((item) => Math.max(item.income, item.expenses)), 1);

  if (tenantLoading || loading) return <WorkspaceSkeleton />;
  if (!authUser || tenantError || !tenant || !member) {
    if (typeof window !== 'undefined') router.replace('/');
    return null;
  }
  if (!data) return <div className="workspace-loading">{message || 'No se pudo cargar el resumen.'}</div>;

  const { report } = data;
  const firstName = (member.name || authUser.displayName || 'propietario').split(' ')[0];
  const money = (value: number) => formatMoney(value, tenant.currency, tenant.locale);

  return <main className="workspace-page"><WorkspaceSidebar /><section className="workspace-main command-center"><Reveal className="dashboard-reveal"><header className="workspace-header command-header"><div><small>Centro de mando · actualizado ahora</small><h1>Buenos días, {firstName} <span>✦</span></h1><p className="workspace-subtitle">Una lectura clara de la operación de <strong>{tenant.name}</strong>.</p></div><div className="workspace-user"><span>♧</span><b>{(member.name || authUser.email || 'U').slice(0, 2).toUpperCase()}</b></div></header>{message && <div className="catalog-message">{message}</div>}<div className="quick-actions"><button className="button" onClick={() => router.push('/workspace/sales')}>＋ Registrar venta</button><button className="quick-action" onClick={() => router.push('/workspace/catalog')}>＋ Nuevo producto</button><button className="quick-action" onClick={() => router.push('/workspace/contacts')}>＋ Nuevo cliente</button><button className="quick-action" onClick={() => router.push('/workspace/reports')}>Ver análisis ↗</button></div></Reveal><Reveal className="dashboard-reveal" delay={140}><div className="command-metrics"><div className="command-metric metric-primary"><small>Ingresos cobrados · 30 días</small><strong>{money(report.summary.income)}</strong><span>{data.dailyStats.salesCount} ventas hoy · {money(data.dailyStats.salesTotal)}</span></div><div className="command-metric"><small>Ventas de hoy</small><strong>{data.dailyStats.salesCount}</strong><span>{money(data.dailyStats.salesTotal)} acumulados</span></div><div className="command-metric"><small>Utilidad neta</small><strong className={report.summary.net < 0 ? 'metric-negative' : ''}>{money(report.summary.net)}</strong><span>{report.summary.net >= 0 ? 'Operación positiva' : 'Revisa tus egresos'}</span></div><div className="command-metric"><small>Ticket promedio</small><strong>{money(report.summary.averageSale)}</strong><span>por venta cobrada</span></div><div className={lowStock.length ? 'command-metric metric-warning' : 'command-metric'}><small>Alertas de inventario</small><strong>{lowStock.length}</strong><span>{lowStock.length ? 'productos requieren atención' : 'Todo está bajo control'}</span></div></div></Reveal><Reveal className="dashboard-reveal" delay={200}><section className="command-panel command-alerts" aria-label="Operación pendiente"><div className="command-panel-head"><div><div className="eyebrow">Operación</div><h2>Seguimiento</h2></div></div><button className="priority-row" onClick={() => router.push('/workspace/cashier')}><span className="priority-icon">↗</span><span><b>Tickets en caja</b><small>{data.pendingPresales.length} preventas listas para cobrar</small></span><strong>{data.pendingPresales.length}</strong></button><button className="priority-row" onClick={() => router.push('/workspace/receivables')}><span className="priority-icon credit">$</span><span><b>Por cobrar</b><small>Saldo agregado de clientes</small></span><strong>{money(openCredit)}</strong></button></section><div className="command-grid"><section className="command-panel command-chart"><div className="command-panel-head"><div><div className="eyebrow">Rendimiento financiero</div><h2>Ingresos vs. gastos</h2><p>Últimos 30 días · {money(report.summary.income)} cobrados</p></div><button className="panel-link" onClick={() => router.push('/workspace/reports')}>Ver reporte ↗</button></div><RevenueChart daily={report.daily} maxValue={maxDaily} money={money} /></section><section className="command-panel command-alerts"><div className="command-panel-head"><div><div className="eyebrow">Atención</div><h2>Prioridades de hoy</h2></div><span className="live-pill">● En vivo</span></div>{lowStock.length ? lowStock.slice(0, 4).map((product) => <button className="priority-row" key={product.id} onClick={() => router.push('/workspace/inventory')}><span className="priority-icon">!</span><span><b>{product.name}</b><small>Stock {product.stock || 0} · mínimo {product.minStock || 0}</small></span><strong>Reponer ↗</strong></button>) : <div className="priority-empty"><span>✓</span><b>Operación al día</b><small>No hay productos bajo el mínimo configurado.</small></div>}{report.summary.openCredit > 0 && <button className="priority-row" onClick={() => router.push('/workspace/receivables')}><span className="priority-icon credit">$</span><span><b>Cuentas por cobrar</b><small>Saldo pendiente de clientes</small></span><strong>{money(report.summary.openCredit)}</strong></button>}</section></div></Reveal><Reveal className="dashboard-reveal" delay={260}><div className="command-lower-grid"><section className="command-panel top-products"><div className="command-panel-head"><div><div className="eyebrow">Ventas</div><h2>Lo que más se mueve</h2></div><button className="panel-link" onClick={() => router.push('/workspace/reports')}>Detalle ↗</button></div>{report.topProducts.length ? report.topProducts.slice(0, 5).map((product, index) => <div className="top-product-row" key={`${product.name}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><b>{product.name}</b><small>{product.quantity} unidades vendidas</small></div><strong>{money(product.revenue)}</strong></div>) : <div className="priority-empty"><span>＋</span><b>Tu ranking aparecerá aquí</b><small>Registra tu primera venta para empezar a descubrir tus productos estrella.</small></div>}</section><section className="command-panel getting-started"><div className="command-panel-head"><div><div className="eyebrow">Siguiente paso</div><h2>Haz crecer tu operación</h2></div></div><div className="setup-progress"><span><i style={{ width: `${Math.min(100, (Number(data.products.length > 0) + Number(data.customers.length > 0) + Number(report.summary.sales > 0)) / 3 * 100)}%` }} /></span><b>{[data.products.length > 0, data.customers.length > 0, report.summary.sales > 0].filter(Boolean).length}/3</b></div><div className="setup-list"><button className={data.products.length ? 'done' : ''} onClick={() => router.push('/workspace/catalog')}><span>{data.products.length ? '✓' : '1'}</span><div><b>Configura tu catálogo</b><small>{data.products.length ? `${data.products.length} productos activos` : 'Añade productos y categorías'}</small></div></button><button className={data.customers.length ? 'done' : ''} onClick={() => router.push('/workspace/contacts')}><span>{data.customers.length ? '✓' : '2'}</span><div><b>Agrega tus clientes</b><small>{data.customers.length ? `${data.customers.length} clientes registrados` : 'Crea tu cartera comercial'}</small></div></button><button className={report.summary.sales > 0 ? 'done' : ''} onClick={() => router.push('/workspace/sales')}><span>{report.summary.sales > 0 ? '✓' : '3'}</span><div><b>Registra tu primera venta</b><small>{report.summary.sales > 0 ? 'Tu operación ya está activa' : 'Convierte datos en decisiones'}</small></div></button></div></section></div></Reveal></section></main>;
}

export default function WorkspacePage() {
  return <TenantProvider><WorkspaceContent /></TenantProvider>;
}
