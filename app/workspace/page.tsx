'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cerrarSesion } from '@/lib/auth';
import { TenantProvider, useTenant } from '@/components/tenant/TenantProvider';

type Daily = { date: string; income: number; expenses: number; net: number };
type Report = {
  summary: { income: number; expenses: number; net: number; sales: number; averageSale: number; openCredit: number };
  daily: Daily[];
  topProducts: { name: string; quantity: number; revenue: number }[];
};
type Product = { id: string; name: string; stock?: number; minStock?: number; itemType?: string; active?: boolean };

type DashboardData = {
  report: Report;
  products: Product[];
  customers: { id: string; name: string }[];
};

const money = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
      const [reportResponse, catalogResponse, contactsResponse] = await Promise.all([
        fetch('/api/reports?days=30', { headers, cache: 'no-store' }),
        fetch('/api/catalog', { headers, cache: 'no-store' }),
        fetch('/api/contacts?type=customer', { headers, cache: 'no-store' }),
      ]);
      const [report, catalog, contacts] = await Promise.all([
        reportResponse.json(),
        catalogResponse.json(),
        contactsResponse.json(),
      ]);
      if (!reportResponse.ok) throw new Error(report.error || 'No se pudo cargar el resumen.');
      if (!catalogResponse.ok) throw new Error(catalog.error || 'No se pudo cargar el catálogo.');
      if (!contactsResponse.ok) throw new Error(contacts.error || 'No se pudieron cargar los clientes.');
      setData({ report, products: catalog.products || [], customers: contacts.contacts || [] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar el centro de mando.');
    } finally {
      setLoading(false);
    }
  }, [authUser, tenant]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const lowStock = useMemo(() => (data?.products || []).filter((product) => product.active !== false && product.itemType !== 'service' && Number(product.stock || 0) <= Number(product.minStock || 0)), [data]);
  const maxDaily = Math.max(...(data?.report.daily || []).map((item) => Math.max(item.income, item.expenses)), 1);
  const chartPoints = (data?.report.daily || []).map((item, index, items) => {
    const x = items.length <= 1 ? 0 : (index / (items.length - 1)) * 100;
    const y = 96 - (item.income / maxDaily) * 82;
    return `${x},${Math.max(5, y)}`;
  }).join(' ');

  if (tenantLoading || loading) return <div className="workspace-loading">Preparando tu centro de mando...</div>;
  if (!authUser || tenantError || !tenant || !member) {
    if (typeof window !== 'undefined') router.replace('/');
    return null;
  }
  if (!data) return <div className="workspace-loading">{message || 'No se pudo cargar el resumen.'}</div>;

  const { report } = data;
  const firstName = (member.name || authUser.displayName || 'propietario').split(' ')[0];

  return <main className="workspace-page"><aside className="workspace-sidebar"><div className="onboarding-brand"><span className="brand-mark-icon">N</span><b>ConexiaX</b></div><div className="workspace-company"><span>{tenant.name.slice(0, 1).toUpperCase()}</span><div><b>{tenant.name}</b><small>Plan {tenant.plan || 'Starter'}</small></div><i>⌄</i></div><nav><a className="active" onClick={() => router.push('/workspace')}>▦ <span>Resumen</span></a><a onClick={() => router.push('/workspace/sales')}>◈ <span>Ventas / POS</span></a><a onClick={() => router.push('/workspace/catalog')}>▤ <span>Catálogo</span></a><a onClick={() => router.push('/workspace/inventory')}>◇ <span>Inventario</span></a><a onClick={() => router.push('/workspace/contacts')}>○ <span>Clientes</span></a><a onClick={() => router.push('/workspace/finance')}>$ <span>Finanzas</span></a><a onClick={() => router.push('/workspace/reports')}>≡ <span>Reportes</span></a><a onClick={() => router.push('/workspace/members')}>♙ <span>Usuarios y roles</span></a></nav><div className="workspace-sidebar-bottom"><a onClick={() => router.push('/workspace/billing')}>◈ <span>Plan y facturación</span></a><a onClick={() => router.push('/workspace/notifications')}>♢ <span>Notificaciones</span></a><button onClick={() => cerrarSesion()}>↪ <span>Cerrar sesión</span></button></div></aside><section className="workspace-main command-center"><header className="workspace-header command-header"><div><small>Centro de mando · actualizado ahora</small><h1>Buenos días, {firstName} <span>✦</span></h1><p className="workspace-subtitle">Una lectura clara de la operación de <strong>{tenant.name}</strong>.</p></div><div className="workspace-user"><span>♧</span><b>{(member.name || authUser.email || 'U').slice(0, 2).toUpperCase()}</b></div></header>{message && <div className="catalog-message">{message}</div>}<div className="quick-actions"><button className="button" onClick={() => router.push('/workspace/sales')}>＋ Registrar venta</button><button className="quick-action" onClick={() => router.push('/workspace/catalog')}>＋ Nuevo producto</button><button className="quick-action" onClick={() => router.push('/workspace/contacts')}>＋ Nuevo cliente</button><button className="quick-action" onClick={() => router.push('/workspace/reports')}>Ver análisis ↗</button></div><div className="command-metrics"><div className="command-metric metric-primary"><small>Ingresos cobrados · 30 días</small><strong>{money(report.summary.income)}</strong><span>{report.summary.sales} ventas registradas</span></div><div className="command-metric"><small>Utilidad neta</small><strong className={report.summary.net < 0 ? 'metric-negative' : ''}>{money(report.summary.net)}</strong><span>{report.summary.net >= 0 ? 'Operación positiva' : 'Revisa tus egresos'}</span></div><div className="command-metric"><small>Ticket promedio</small><strong>{money(report.summary.averageSale)}</strong><span>por venta cobrada</span></div><div className={lowStock.length ? 'command-metric metric-warning' : 'command-metric'}><small>Alertas de inventario</small><strong>{lowStock.length}</strong><span>{lowStock.length ? 'productos requieren atención' : 'Todo está bajo control'}</span></div></div><div className="command-grid"><section className="command-panel command-chart"><div className="command-panel-head"><div><div className="eyebrow">Rendimiento financiero</div><h2>Ingresos vs. gastos</h2><p>Últimos 30 días · {money(report.summary.income)} cobrados</p></div><button className="panel-link" onClick={() => router.push('/workspace/reports')}>Ver reporte ↗</button></div><div className="command-chart-wrap"><div className="chart-y-labels"><span>{money(maxDaily)}</span><span>{money(maxDaily / 2)}</span><span>$0</span></div><div className="command-line-chart"><div className="chart-grid-lines"><i /><i /><i /></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Tendencia de ingresos"><polyline points={chartPoints} fill="none" stroke="var(--cx-accent-strong)" strokeWidth="2.4" vectorEffect="non-scaling-stroke" /></svg><div className="chart-x-labels"><span>Hace 30 días</span><span>Hace 15 días</span><span>Hoy</span></div></div></div></section><section className="command-panel command-alerts"><div className="command-panel-head"><div><div className="eyebrow">Atención</div><h2>Prioridades de hoy</h2></div><span className="live-pill">● En vivo</span></div>{lowStock.length ? lowStock.slice(0, 4).map((product) => <button className="priority-row" key={product.id} onClick={() => router.push('/workspace/inventory')}><span className="priority-icon">!</span><span><b>{product.name}</b><small>Stock {product.stock || 0} · mínimo {product.minStock || 0}</small></span><strong>Reponer ↗</strong></button>) : <div className="priority-empty"><span>✓</span><b>Operación al día</b><small>No hay productos bajo el mínimo configurado.</small></div>}{report.summary.openCredit > 0 && <button className="priority-row" onClick={() => router.push('/workspace/receivables')}><span className="priority-icon credit">$</span><span><b>Cuentas por cobrar</b><small>Saldo pendiente de clientes</small></span><strong>{money(report.summary.openCredit)}</strong></button>}</section></div><div className="command-lower-grid"><section className="command-panel top-products"><div className="command-panel-head"><div><div className="eyebrow">Ventas</div><h2>Lo que más se mueve</h2></div><button className="panel-link" onClick={() => router.push('/workspace/reports')}>Detalle ↗</button></div>{report.topProducts.length ? report.topProducts.slice(0, 5).map((product, index) => <div className="top-product-row" key={`${product.name}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><b>{product.name}</b><small>{product.quantity} unidades vendidas</small></div><strong>{money(product.revenue)}</strong></div>) : <div className="priority-empty"><span>＋</span><b>Tu ranking aparecerá aquí</b><small>Registra tu primera venta para empezar a descubrir tus productos estrella.</small></div>}</section><section className="command-panel getting-started"><div className="command-panel-head"><div><div className="eyebrow">Siguiente paso</div><h2>Haz crecer tu operación</h2></div></div><div className="setup-progress"><span><i style={{ width: `${Math.min(100, (Number(data.products.length > 0) + Number(data.customers.length > 0) + Number(report.summary.sales > 0)) / 3 * 100)}%` }} /></span><b>{[data.products.length > 0, data.customers.length > 0, report.summary.sales > 0].filter(Boolean).length}/3</b></div><div className="setup-list"><button className={data.products.length ? 'done' : ''} onClick={() => router.push('/workspace/catalog')}><span>{data.products.length ? '✓' : '1'}</span><div><b>Configura tu catálogo</b><small>{data.products.length ? `${data.products.length} productos activos` : 'Añade productos y categorías'}</small></div></button><button className={data.customers.length ? 'done' : ''} onClick={() => router.push('/workspace/contacts')}><span>{data.customers.length ? '✓' : '2'}</span><div><b>Agrega tus clientes</b><small>{data.customers.length ? `${data.customers.length} clientes registrados` : 'Crea tu cartera comercial'}</small></div></button><button className={report.summary.sales > 0 ? 'done' : ''} onClick={() => router.push('/workspace/sales')}><span>{report.summary.sales > 0 ? '✓' : '3'}</span><div><b>Registra tu primera venta</b><small>{report.summary.sales > 0 ? 'Tu operación ya está activa' : 'Convierte datos en decisiones'}</small></div></button></div></section></div></section></main>;
}

export default function WorkspacePage() {
  return <TenantProvider><WorkspaceContent /></TenantProvider>;
}
