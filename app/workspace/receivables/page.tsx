'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar';
import { useTenant } from '@/components/tenant/TenantProvider';
import { formatMoney } from '@/lib/currency';
import type { ReceivablesReminderSettings } from '@/lib/receivables-reminders';

type DueStatus = 'current' | 'upcoming' | 'overdue' | 'paid';
type CustomerBalance = { customerId: string; customerName: string; sales: number; total: number; paid: number; balance: number };
type CreditSale = {
  id: string;
  saleId?: string;
  receivableId: string;
  customerId: string;
  customerName: string;
  total: number;
  paidAmount: number;
  balanceDue: number;
  paymentStatus: string;
  dueAt: string | null;
  dueStatus: DueStatus;
  dueStatusLabel: string;
  daysUntilDue: number | null;
  branchId?: string;
  invoiceNumber?: string;
  createdAt?: string;
};
type PaymentForm = { saleId: string; customerId: string; amount: string; paymentMethod: string; notes: string };
type ReceivablesSummary = { receivables: number; balance: number; overdue: number; dueSoon: number; collected: number };
type ReceivablesPageData = { sales?: CreditSale[]; customers?: CustomerBalance[]; summary?: ReceivablesSummary; pagination?: { page: number; pageSize: number; total: number; hasMoreSales: boolean } };
type ReminderHistory = {
  id: string;
  customer_name: string;
  receivable_id: string;
  event_type: 'customer_reminder' | 'owner_overdue' | 'owner_no_response';
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  message: string;
  provider: string | null;
  error: string | null;
  sent_at: string | null;
  response_at: string | null;
  created_at: string;
};
type WhatsAppStatus = { configured: boolean; templateConfigured: boolean; inboundConfigured: boolean; provider: string | null };
type PageFilter = 'all' | DueStatus;

const MANAGER_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);
const FILTERS: Array<{ key: PageFilter; label: string }> = [
  { key: 'all', label: 'Todas' },
  { key: 'current', label: 'Al día' },
  { key: 'upcoming', label: 'Por vencer' },
  { key: 'overdue', label: 'Vencidas' },
  { key: 'paid', label: 'Pagadas' },
];
const EVENT_LABELS: Record<ReminderHistory['event_type'], string> = {
  customer_reminder: 'Recordatorio al cliente',
  owner_overdue: 'Alerta de deuda vencida',
  owner_no_response: 'Alerta sin respuesta',
};
const DELIVERY_LABELS: Record<ReminderHistory['status'], string> = {
  pending: 'Procesando',
  sent: 'Enviado',
  failed: 'Falló',
  skipped: 'Omitido',
};
const DEFAULT_PAYMENT_FORM: PaymentForm = { saleId: '', customerId: '', amount: '', paymentMethod: 'transfer', notes: '' };
const EMPTY_SUMMARY: ReceivablesSummary = { receivables: 0, balance: 0, overdue: 0, dueSoon: 0, collected: 0 };

function mergeCustomerBalances(current: CustomerBalance[], incoming: CustomerBalance[]) {
  const merged = new Map(current.map((customer) => [customer.customerId, { ...customer }]));
  for (const customer of incoming) {
    const previous = merged.get(customer.customerId);
    if (previous) {
      previous.sales += customer.sales;
      previous.total += customer.total;
      previous.paid += customer.paid;
      previous.balance += customer.balance;
    } else {
      merged.set(customer.customerId, { ...customer });
    }
  }
  return Array.from(merged.values()).sort((a, b) => b.balance - a.balance);
}

function formatDate(value: string | null | undefined, locale = 'es-NI') {
  if (!value) return 'Sin fecha';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00.000Z`) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Pendiente';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : date.toLocaleString('es-NI');
}

function ReceivablesContent() {
  const router = useRouter();
  const { authUser, tenant, member, activeBranchId, loading: tenantLoading } = useTenant();
  const canManageSettings = Boolean(member && MANAGER_ROLES.has(member.role));
  const canRegisterPayment = Boolean(member && !['bodega', 'compras', 'chofer', 'solo_lectura'].includes(member.role));
  const [customers, setCustomers] = useState<CustomerBalance[]>([]);
  const [sales, setSales] = useState<CreditSale[]>([]);
  const [history, setHistory] = useState<ReminderHistory[]>([]);
  const [summary, setSummary] = useState<ReceivablesSummary>(EMPTY_SUMMARY);
  const [settings, setSettings] = useState<ReceivablesReminderSettings | null>(null);
  const [whatsapp, setWhatsapp] = useState<WhatsAppStatus>({ configured: false, templateConfigured: false, inboundConfigured: false, provider: null });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PageFilter>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [form, setForm] = useState<PaymentForm>(DEFAULT_PAYMENT_FORM);
  const [hasMoreSales, setHasMoreSales] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [totalSales, setTotalSales] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const authHeaders = useCallback(async () => ({
    Authorization: `Bearer ${await authUser!.getIdToken()}`,
    'x-tenant-id': tenant!.id,
    ...(activeBranchId ? { 'x-branch-id': activeBranchId } : {}),
  }), [authUser, tenant, activeBranchId]);

  const load = useCallback(async () => {
    if (!authUser || !tenant) return;
    setLoading(true);
    setError('');
    try {
      const headers = await authHeaders();
      const [accountsResponse, historyResponse] = await Promise.all([
        fetch('/api/receivables?page=1', { headers, cache: 'no-store' }),
        fetch('/api/receivables/reminders', { headers, cache: 'no-store' }),
      ]);
      const [accountsPayload, historyData] = await Promise.all([accountsResponse.json(), historyResponse.json()]);
      const accountsData = accountsPayload as ReceivablesPageData & { error?: string };
      if (!accountsResponse.ok) throw new Error(accountsData.error || 'No se pudieron cargar las cuentas por cobrar.');
      if (!historyResponse.ok) throw new Error(historyData.error || 'No se pudo cargar el historial de cobranza.');
      setCustomers(accountsData.customers || []);
      setSales(accountsData.sales || []);
      setSummary(accountsData.summary || EMPTY_SUMMARY);
      setPageNumber(accountsData.pagination?.page || 1);
      setTotalSales(accountsData.pagination?.total || (accountsData.sales || []).length);
      setHasMoreSales(Boolean(accountsData.pagination?.hasMoreSales));
      setHistory(historyData.history || []);

      if (canManageSettings) {
        const settingsResponse = await fetch('/api/receivables/reminders/settings', { headers, cache: 'no-store' });
        const settingsData = await settingsResponse.json();
        if (!settingsResponse.ok) throw new Error(settingsData.error || 'No se pudo cargar la configuración de cobranza.');
        setSettings(settingsData.settings);
        setWhatsapp(settingsData.whatsapp || { configured: false, templateConfigured: false, inboundConfigured: false, provider: null });
      } else {
        setSettings(null);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error cargando cuentas por cobrar.');
    } finally {
      setLoading(false);
    }
  }, [authUser, tenant, authHeaders, canManageSettings]);

  async function loadMoreSales() {
    if (!authUser || !tenant || !hasMoreSales || loadingMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const response = await fetch(`/api/receivables?page=${pageNumber + 1}`, { headers: await authHeaders(), cache: 'no-store' });
      const payload = await response.json() as ReceivablesPageData & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'No se pudieron cargar más cuentas.');
      setSales((current) => [...current, ...(payload.sales || [])]);
      setCustomers((current) => mergeCustomerBalances(current, payload.customers || []));
      setSummary((current) => ({
        receivables: current.receivables + (payload.summary?.receivables || 0),
        balance: current.balance + (payload.summary?.balance || 0),
        overdue: current.overdue + (payload.summary?.overdue || 0),
        dueSoon: current.dueSoon + (payload.summary?.dueSoon || 0),
        collected: current.collected + (payload.summary?.collected || 0),
      }));
      setPageNumber(payload.pagination?.page || pageNumber + 1);
      setTotalSales(payload.pagination?.total || totalSales);
      setHasMoreSales(Boolean(payload.pagination?.hasMoreSales));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudieron cargar más cuentas.');
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => { void load(); }, [load]);

  const money = useCallback((value: number) => formatMoney(value, tenant?.currency || 'NIO', tenant?.locale), [tenant]);
  const filteredSales = useMemo(() => {
    const search = query.trim().toLowerCase();
    return sales.filter((sale) => {
      const matchesFilter = filter === 'all' || sale.dueStatus === filter;
      const matchesSearch = !search || `${sale.customerName} ${sale.invoiceNumber || ''} ${sale.saleId || ''}`.toLowerCase().includes(search);
      return matchesFilter && matchesSearch;
    });
  }, [sales, query, filter]);
  const pendingSales = useMemo(() => sales.filter((sale) => sale.balanceDue > 0), [sales]);

  function openPayment(sale?: CreditSale, settleFullBalance = false) {
    setMessage('');
    setError('');
    setForm(sale ? {
      saleId: sale.saleId || sale.id,
      customerId: '',
      amount: settleFullBalance ? String(sale.balanceDue.toFixed(2)) : '',
      paymentMethod: 'transfer',
      notes: settleFullBalance ? 'Liquidación del saldo pendiente' : '',
    } : DEFAULT_PAYMENT_FORM);
    setShowPayment(true);
  }

  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authUser || !tenant) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const idempotencyKey = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `receivable-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const response = await fetch('/api/receivables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey, ...(await authHeaders()) },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo registrar el pago.');
      setMessage(`Pago registrado correctamente. Saldo restante: ${money(Number(data.balanceDue || 0))}.`);
      setShowPayment(false);
      setForm(DEFAULT_PAYMENT_FORM);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo registrar el pago.');
    } finally {
      setSaving(false);
    }
  }

  function changeSetting<K extends keyof ReceivablesReminderSettings>(key: K, value: ReceivablesReminderSettings[K]) {
    setSettings((current) => current ? { ...current, [key]: value } : current);
  }

  async function saveSettings() {
    if (!authUser || !tenant || !settings) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/receivables/reminders/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(settings),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar la configuración.');
      setSettings(data.settings);
      setWhatsapp(data.whatsapp || whatsapp);
      setMessage('Configuración guardada. La siguiente revisión automática se ejecutará según el cron del sistema.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  }

  if (tenantLoading || loading) return <div className="workspace-loading">{error || 'Cargando cuentas por cobrar...'}</div>;
  if (!authUser || !tenant || !member) {
    router.replace('/');
    return null;
  }

  return (
    <main className="workspace-page">
      <WorkspaceSidebar />
      <section className="workspace-main receivables-main">
        <header className="receivables-header">
          <div>
            <button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button>
            <div className="eyebrow catalog-eyebrow">Tu espacio / Finanzas</div>
            <h1>Agente de cobranza automática</h1>
            <p>Seguimiento de ventas a crédito, recordatorios y pagos pendientes de <strong>{tenant.name}</strong>.</p>
          </div>
          <div className="receivables-header-actions">
            <button className="button button-secondary" onClick={() => void load()} disabled={loading}>Actualizar</button>
            {canRegisterPayment && <button className="button" onClick={() => openPayment()} disabled={!pendingSales.length}>+ Registrar pago</button>}
          </div>
        </header>

        {message && <div className="catalog-message" role="status">{message}</div>}
        {error && <div className="catalog-message receivable-error" role="alert">{error}</div>}

        <div className="receivables-metrics">
          <div><small>Saldo pendiente</small><strong>{money(summary.balance)}</strong><span>{summary.receivables} abierta(s) · {sales.length}/{totalSales} cuentas cargadas</span></div>
          <div className="receivable-metric-warning"><small>Vencida</small><strong>{money(summary.overdue)}</strong><span>requiere seguimiento en lo cargado</span></div>
          <div className="receivable-metric-soon"><small>Por vencer</small><strong>{money(summary.dueSoon)}</strong><span>próximos 7 días · lo cargado</span></div>
          <div><small>Total cobrado</small><strong>{money(summary.collected)}</strong><span>pagos aplicados a las cuentas cargadas</span></div>
        </div>

        {canManageSettings && settings && (
          <section className="collection-agent-panel">
            <div className="collection-agent-heading">
              <div>
                <div className="eyebrow">Automatización · WhatsApp</div>
                <h2>Configura los recordatorios</h2>
                <p>El agente revisa a diario la cartera activa y deja una bitácora de cada envío o alerta.</p>
              </div>
              <span className={`collection-agent-badge ${settings.enabled ? 'is-enabled' : ''}`}>{settings.enabled ? 'Agente activo' : 'Agente apagado'}</span>
            </div>

            <div className="collection-agent-grid">
              <label className="collection-agent-field collection-agent-toggle">
                <span>Activar agente de cobranza</span>
                <input type="checkbox" checked={settings.enabled} onChange={(event) => changeSetting('enabled', event.target.checked)} />
              </label>
              <label className="collection-agent-field">
                <span>Primer recordatorio (días antes)</span>
                <input type="number" min="0" max="60" value={settings.firstReminderDays} onChange={(event) => changeSetting('firstReminderDays', Number(event.target.value))} />
                <small>0 significa que se envía el día del vencimiento.</small>
              </label>
              <label className="collection-agent-field">
                <span>Frecuencia entre recordatorios</span>
                <input type="number" min="1" max="60" value={settings.frequencyDays} onChange={(event) => changeSetting('frequencyDays', Number(event.target.value))} />
                <small>Se cuenta desde el último envío exitoso.</small>
              </label>
              <label className="collection-agent-field collection-agent-wide">
                <span>Mensaje personalizable</span>
                <textarea rows={4} maxLength={900} value={settings.messageTemplate} onChange={(event) => changeSetting('messageTemplate', event.target.value)} />
                <small>Variables: {'{nombre}'}, {'{monto}'}, {'{empresa}'}, {'{factura}'}, {'{vencimiento}'}, {'{dias_vencidos}'} · máximo 900 caracteres.</small>
              </label>
              <label className="collection-agent-field collection-agent-toggle">
                <span>Notificar al dueño si vence o no responden</span>
                <input type="checkbox" checked={settings.ownerAlertsEnabled} onChange={(event) => changeSetting('ownerAlertsEnabled', event.target.checked)} />
              </label>
              <label className="collection-agent-field">
                <span>WhatsApp del dueño</span>
                <input type="tel" placeholder="+50588888888" value={settings.ownerWhatsappPhone} onChange={(event) => changeSetting('ownerWhatsappPhone', event.target.value)} />
                <small>Si queda vacío, se usa el número configurado en Resumen diario automático.</small>
              </label>
            </div>

            <div className="collection-agent-connection" role="status">
              <div><b>Proveedor de WhatsApp</b><span>{whatsapp.configured ? `${whatsapp.provider === 'meta' ? 'Meta Cloud API' : 'Twilio'} conectado` : 'Falta configurar las credenciales del servidor'}</span></div>
              <div><b>Plantilla proactiva</b><span>{whatsapp.templateConfigured ? 'Configurada' : 'Falta una plantilla aprobada para cobranza'}</span></div>
              <div><b>Respuestas del cliente</b><span>{whatsapp.inboundConfigured ? 'Webhook listo' : 'Falta configurar el webhook para detectar respuestas'}</span></div>
            </div>
            {(!whatsapp.configured || !whatsapp.templateConfigured || !whatsapp.inboundConfigured) && (
              <div className="collection-agent-hint">
                Los envíos automáticos proactivos requieren credenciales y una plantilla aprobada. Para avisar si el cliente responde, configure el webhook entrante siguiendo <code>docs/agente-cobranza-automatica.md</code>.
              </div>
            )}
            <div className="collection-agent-save">
              <span>Los recordatorios solo se envían a clientes con teléfono y autorización de WhatsApp en su ficha.</span>
              <button className="button" onClick={() => void saveSettings()} disabled={saving}>{saving ? 'Guardando...' : 'Guardar configuración'}</button>
            </div>
          </section>
        )}

        {!canManageSettings && (
          <div className="collection-agent-readonly-hint">La configuración del agente de cobranza solo está disponible para el dueño, administradores y gerentes.</div>
        )}

        <section className="receivables-panel collection-accounts-panel">
          <div className="collection-accounts-heading">
            <div>
              <div className="eyebrow">Cartera</div>
              <h2>Cuentas por cobrar</h2>
              <p>Al día · Por vencer · Vencida. Una cuenta se considera por vencer dentro de los próximos 7 días.</p>
            </div>
            <input className="inventory-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente o factura" aria-label="Buscar cliente o factura" />
          </div>
          <div className="receivable-filters" role="group" aria-label="Filtrar cuentas por estado">
            {FILTERS.map((item) => (
              <button type="button" key={item.key} className={filter === item.key ? 'selected' : ''} aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
          {filteredSales.length === 0 ? (
            <div className="inventory-empty">{sales.length ? 'No hay cuentas con este filtro.' : 'Todavía no hay ventas a crédito pendientes.'}</div>
          ) : (
            <div className="receivable-table-wrap">
              <table className="receivable-table">
                <thead><tr><th>Cliente / factura</th><th>Vencimiento</th><th>Estado</th><th>Total</th><th>Saldo</th><th>Acción</th></tr></thead>
                <tbody>
                  {filteredSales.map((sale) => (
                    <tr key={sale.receivableId}>
                      <td data-label="Cliente / factura"><div className="receivable-customer"><span className="contact-avatar">{sale.customerName.slice(0, 1).toUpperCase()}</span><div><b>{sale.customerName}</b><small>{sale.invoiceNumber || sale.saleId || 'Venta a crédito'}</small></div></div></td>
                      <td data-label="Vencimiento">{formatDate(sale.dueAt, tenant.locale)}{sale.dueStatus === 'overdue' && <small className="receivable-late-days">{Math.abs(sale.daysUntilDue || 0)} día(s) de atraso</small>}</td>
                      <td data-label="Estado"><span className={`receivable-status status-${sale.dueStatus}`}>{sale.dueStatusLabel}</span></td>
                      <td data-label="Total">{money(sale.total)}</td>
                      <td data-label="Saldo"><strong className={sale.balanceDue > 0 ? 'receivable-balance-pending' : 'receivable-balance-paid'}>{money(sale.balanceDue)}</strong></td>
                      <td data-label="Acción">{sale.balanceDue > 0 && canRegisterPayment ? <button className="button button-secondary button-small" onClick={() => openPayment(sale, true)}>Liquidar saldo</button> : sale.balanceDue <= 0 ? <span className="receivable-settled-label">Sin saldo</span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(totalSales > 0 || hasMoreSales) && <div className="receivables-pagination-note"><span>Mostrando {sales.length} de {totalSales} cuentas.</span>{hasMoreSales && <button type="button" className="button button-secondary button-small" onClick={() => void loadMoreSales()} disabled={loadingMore}>{loadingMore ? 'Cargando...' : 'Cargar más cuentas'}</button>}</div>}
        </section>

        <section className="receivables-panel collection-summary-panel">
          <div className="collection-accounts-heading">
            <div><div className="eyebrow">Clientes</div><h2>Resumen por cliente</h2></div>
            <span>{customers.length} clientes con cuentas en el listado</span>
          </div>
          {customers.length === 0 ? <div className="inventory-empty">No hay saldos por cliente.</div> : (
            <div className="collection-customer-list">
              {customers.map((customer) => (
                <div className="balance-row" key={customer.customerId}>
                  <div className="contact-avatar">{customer.customerName.slice(0, 1).toUpperCase()}</div>
                  <div><b>{customer.customerName}</b><small>{customer.sales} venta(s) · Total {money(customer.total)} · Pagado {money(customer.paid)}</small></div>
                  <strong>{money(customer.balance)}</strong>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="receivables-panel collection-history-panel">
          <div className="collection-accounts-heading">
            <div><div className="eyebrow">Bitácora</div><h2>Historial de recordatorios</h2><p>Incluye envíos al cliente, alertas al dueño y respuestas detectadas.</p></div>
          </div>
          {history.length === 0 ? <div className="inventory-empty">Aún no hay recordatorios. El agente registrará aquí cada intento automático.</div> : (
            <div className="collection-history-list">
              {history.map((item) => (
                <article className="collection-history-row" key={item.id}>
                  <div className="collection-history-icon" aria-hidden="true">{item.status === 'sent' ? '✓' : item.status === 'failed' ? '!' : '◷'}</div>
                  <div className="collection-history-main">
                    <div><b>{EVENT_LABELS[item.event_type] || item.event_type}</b><span className={`collection-delivery-status delivery-${item.status}`}>{DELIVERY_LABELS[item.status] || item.status}</span></div>
                    <small>{item.customer_name || 'Cliente'} · {formatDateTime(item.sent_at || item.created_at)}</small>
                    <p>{item.message}</p>
                    {item.response_at && <small className="collection-response-note">Respuesta detectada {formatDateTime(item.response_at)}</small>}
                    {item.error && <small className="collection-error-note">{item.error}</small>}
                  </div>
                  {item.provider && <span className="collection-provider">{item.provider}</span>}
                </article>
              ))}
            </div>
          )}
        </section>

        {showPayment && (
          <div className="modal-backdrop" onClick={() => setShowPayment(false)}>
            <div className="catalog-modal" onClick={(event) => event.stopPropagation()}>
              <button className="modal-close" type="button" onClick={() => setShowPayment(false)}>×</button>
              <div className="eyebrow">Registrar pago</div>
              <h2>Aplica un pago a la cuenta.</h2>
              <p className="collection-payment-note">Al aplicar el saldo completo, la cuenta quedará marcada como pagada mediante la transacción normal de CxC.</p>
              <form onSubmit={pay}>
                <label>Cliente para abono FIFO
                  <select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value, saleId: '', amount: '' })}>
                    <option value="">Seleccionar venta específica</option>
                    {customers.filter((customer) => customer.balance > 0).map((customer) => <option key={customer.customerId} value={customer.customerId}>{customer.customerName} · saldo {money(customer.balance)}</option>)}
                  </select>
                  <small>Si eliges un cliente, el servidor aplica el pago FIFO a sus facturas.</small>
                </label>
                <label>Venta pendiente
                  <select required={!form.customerId} value={form.saleId} onChange={(event) => {
                    const selectedSale = pendingSales.find((sale) => sale.saleId === event.target.value || sale.id === event.target.value);
                    setForm({ ...form, saleId: event.target.value, customerId: '', amount: selectedSale ? String(selectedSale.balanceDue.toFixed(2)) : '' });
                  }}>
                    <option value="">Selecciona una venta</option>
                    {pendingSales.map((sale) => <option key={sale.receivableId} value={sale.saleId || sale.id}>{sale.customerName} · {sale.invoiceNumber || sale.saleId || sale.id} · saldo {money(sale.balanceDue)}</option>)}
                  </select>
                </label>
                <label>Monto recibido<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
                <label>Método de pago
                  <select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}>
                    <option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option>
                  </select>
                </label>
                <label>Notas<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Opcional" /></label>
                <button className="button auth-submit" disabled={saving || !form.amount || (!form.saleId && !form.customerId)}>{saving ? 'Guardando...' : 'Registrar pago ↗'}</button>
              </form>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export default function ReceivablesPage() {
  return <ReceivablesContent />;
}
