'use client';

import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/components/tenant/TenantProvider';

type Notice = {
  id: string;
  type: string;
  source: 'notification' | 'daily_alert' | 'live_alert';
  title: string;
  message: string;
  read: boolean;
  active: boolean;
  severity: string;
  createdAt?: string;
};

type LiveStockStatus = { ok: boolean; checkedAt: string | null; error: string | null };

const MANAGER_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);

const icon: Record<string, string> = {
  low_stock: '◇',
  out_of_stock: '⚠',
  overdue_receivables: '$',
  sales_comparison: '↗',
  no_movement: '◷',
  payment_failed: '!',
  renewal_upcoming: '◷',
  subscription_updated: '✓',
};

function severityLabel(severity: string) {
  if (severity === 'critical') return 'Crítico';
  if (severity === 'warning') return 'Revisar';
  return 'Informativa';
}

function noticeFootnote(item: Notice) {
  if (item.source === 'live_alert') {
    return `Alerta en vivo · ${severityLabel(item.severity)} · se quita sola al reponer el inventario`;
  }
  const origin = item.source === 'daily_alert'
    ? `Alerta operativa · ${severityLabel(item.severity)}`
    : 'Notificación de la plataforma';
  return `${origin}${item.createdAt ? ` · ${new Date(item.createdAt).toLocaleString()}` : ''}`;
}

function NotificationsContent() {
  const router = useRouter();
  const { authUser, tenant, member, loading: tenantLoading } = useTenant();
  const [items, setItems] = useState<Notice[]>([]);
  const [activeAlertsCount, setActiveAlertsCount] = useState(0);
  const [liveStock, setLiveStock] = useState<LiveStockStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!authUser || !tenant) return;
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/notifications', {
        headers: {
          Authorization: `Bearer ${await authUser.getIdToken()}`,
          'x-tenant-id': tenant.id,
        },
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las alertas.');
      setItems(data.notifications || []);
      setActiveAlertsCount(Number(data.activeAlertsCount || 0));
      setLiveStock(data.liveStock || null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error cargando alertas.');
    } finally {
      setLoading(false);
    }
  }, [authUser, tenant]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(item: Notice) {
    if (!authUser || !tenant) return;
    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await authUser.getIdToken()}`,
          'x-tenant-id': tenant.id,
        },
        body: JSON.stringify({ id: item.id, source: item.source }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo marcar la alerta.');
      setItems((current) => current.map((notice) => notice.id === item.id && notice.source === item.source
        ? { ...notice, read: true }
        : notice));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo marcar la alerta.');
    }
  }

  // Pide recalcular todas las alertas operativas (créditos vencidos, ventas, sin movimiento…) y
  // vuelve a leer la bandeja. Las alertas de stock ya se calculan en vivo en cada lectura.
  async function refreshAlerts() {
    if (!authUser || !tenant || !member) return;
    setRefreshing(true);
    let notice = '';
    try {
      if (MANAGER_ROLES.has(member.role)) {
        const response = await fetch('/api/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await authUser.getIdToken()}`,
            'x-tenant-id': tenant.id,
          },
          body: JSON.stringify({ action: 'refresh' }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) notice = data.error || 'No se pudieron recalcular las alertas.';
        else if (data.throttled) notice = 'Las alertas ya se actualizaron hace un momento. Mostramos lo más reciente.';
        else notice = 'Alertas actualizadas.';
      }
    } catch {
      notice = 'No se pudieron recalcular las alertas. Mostramos lo último guardado.';
    }
    await load();
    setMessage(notice);
    setRefreshing(false);
  }

  if (tenantLoading || loading) return <div className="workspace-loading">Cargando alertas...</div>;
  if (!authUser || !tenant || !member) {
    router.replace('/');
    return null;
  }

  // Las alertas en vivo no se guardan: no se pueden marcar como leídas, se quitan solas al reponer.
  const unread = items.filter((item) => !item.read && item.source !== 'live_alert').length;
  const checkedAt = liveStock?.ok && liveStock.checkedAt ? new Date(liveStock.checkedAt).toLocaleTimeString() : '';

  return (
    <main className="workspace-page">
      <WorkspaceSidebar />
      <section className="workspace-main notifications-main">
        <header className="notifications-header">
          <div>
            <button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button>
            <div className="eyebrow catalog-eyebrow">Tu espacio / Alertas</div>
            <h1>Alertas y notificaciones</h1>
            <p>Información guardada para <strong>{tenant.name}</strong>. Las alertas de stock se actualizan al instante; las demás alertas operativas se actualizan una vez al día o cuando pulsas «Actualizar alertas».</p>
            <p><strong>{activeAlertsCount}</strong> alertas operativas activas · <strong>{unread}</strong> sin leer{checkedAt ? ` · stock revisado a las ${checkedAt}` : ''}</p>
          </div>
          <button className="button button-secondary" onClick={() => void refreshAlerts()} disabled={loading || refreshing}>
            {refreshing ? 'Actualizando…' : 'Actualizar alertas'}
          </button>
        </header>

        {message && <div className="catalog-message" role="alert">{message}</div>}
        {liveStock && !liveStock.ok && (
          <div className="catalog-message" role="status">
            No pudimos revisar el stock en vivo en este momento; mostramos las alertas guardadas.
            {liveStock.error ? <small> Detalle: {liveStock.error}</small> : null}
          </div>
        )}

        <div className="notifications-panel">
          {items.length === 0 ? (
            <div className="catalog-empty">
              <div className="empty-spark">♢</div>
              <h2>Todo está tranquilo</h2>
              <p>Aquí aparecerán alertas de inventario, créditos vencidos, comparación de ventas y productos sin movimiento.</p>
            </div>
          ) : items.map((item) => (
            <article className={`notice-card ${item.read ? 'read' : ''}`} key={`${item.source}-${item.id}`}>
              <span className={`notice-icon ${item.type}`} aria-hidden="true">{icon[item.type] || 'i'}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.message}</p>
                <small>{noticeFootnote(item)}</small>
              </div>
              {!item.read && item.source !== 'live_alert' && <button onClick={() => void markRead(item)}>Marcar leída</button>}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default function NotificationsPage() {
  return <NotificationsContent />;
}
