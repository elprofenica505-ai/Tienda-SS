'use client';

import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/components/tenant/TenantProvider';

type Notice = {
  id: string;
  type: string;
  source: 'notification' | 'daily_alert';
  title: string;
  message: string;
  read: boolean;
  active: boolean;
  severity: string;
  createdAt?: string;
};

function NotificationsContent() {
  const router = useRouter();
  const { authUser, tenant, member, loading: tenantLoading } = useTenant();
  const [items, setItems] = useState<Notice[]>([]);
  const [activeAlertsCount, setActiveAlertsCount] = useState(0);
  const [loading, setLoading] = useState(true);
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

  if (tenantLoading || loading) return <div className="workspace-loading">Cargando alertas...</div>;
  if (!authUser || !tenant || !member) {
    router.replace('/');
    return null;
  }

  const unread = items.filter((item) => !item.read).length;
  const icon: Record<string, string> = {
    low_stock: '◇',
    overdue_receivables: '$',
    sales_comparison: '↗',
    no_movement: '◷',
    payment_failed: '!',
    renewal_upcoming: '◷',
    subscription_updated: '✓',
  };

  return (
    <main className="workspace-page">
      <WorkspaceSidebar />
      <section className="workspace-main notifications-main">
        <header className="notifications-header">
          <div>
            <button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button>
            <div className="eyebrow catalog-eyebrow">Tu espacio / Alertas</div>
            <h1>Alertas y notificaciones</h1>
            <p>Información guardada para <strong>{tenant.name}</strong>; las alertas operativas se actualizan una vez al día.</p>
            <p><strong>{activeAlertsCount}</strong> alertas operativas activas · <strong>{unread}</strong> sin leer</p>
          </div>
          <button className="button button-secondary" onClick={() => void load()} disabled={loading}>Actualizar</button>
        </header>

        {message && <div className="catalog-message" role="alert">{message}</div>}

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
                <small>
                  {item.source === 'daily_alert'
                    ? `Alerta operativa · ${item.severity === 'warning' ? 'Revisar' : 'Informativa'}`
                    : 'Notificación de la plataforma'}
                  {item.createdAt ? ` · ${new Date(item.createdAt).toLocaleString()}` : ''}
                </small>
              </div>
              {!item.read && <button onClick={() => void markRead(item)}>Marcar leída</button>}
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
