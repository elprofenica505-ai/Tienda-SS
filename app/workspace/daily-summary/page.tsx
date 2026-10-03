'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/components/tenant/TenantProvider';
import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar';
import { formatMoney, normalizeCurrency } from '@/lib/currency';
import {
  buildDailySummaryMessage,
  formatPercentChange,
  type DailySummaryContent,
  type DailySummarySettings,
} from '@/lib/daily-summary';

type SummaryRow = {
  id: string;
  summary_date: string;
  partial: boolean;
  currency: string;
  sales_total: number;
  returns_total: number;
  net_sales: number;
  sales_count: number;
  average_ticket: number;
  gross_profit: number;
  estimated_net_profit: number;
  margin_percent: number;
  expenses_total: number;
  top_product: { name?: string; quantity?: number } | null;
  content: DailySummaryContent | null;
  message: string;
  whatsapp_status: string;
  whatsapp_phone: string | null;
  whatsapp_error: string | null;
  whatsapp_sent_at: string | null;
  generated_at: string;
};

type Payload = {
  tenant: { name: string; timezone: string; currency: string };
  settings: DailySummarySettings;
  configured: boolean;
  schedule: { due: boolean; summaryDate: string; partial: boolean; minutesSinceSendTime: number };
  whatsapp: { configured: boolean; provider: string | null };
  summaries: SummaryRow[];
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente de envío',
  sent: 'Enviado por WhatsApp',
  skipped: 'Sin enviar',
  failed: 'Falló el envío',
  disabled: 'WhatsApp apagado',
};

const timezoneOptions = [
  'America/Managua',
  'America/Costa_Rica',
  'America/Guatemala',
  'America/El_Salvador',
  'America/Tegucigalpa',
  'America/Panama',
  'America/Mexico_City',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/Madrid',
];

function money(value: number, currency: string) {
  return formatMoney(Number.isFinite(value) ? value : 0, normalizeCurrency(currency));
}

function whenLabel(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-NI');
}

function DailySummaryContentPage() {
  const router = useRouter();
  const { authUser, tenant, member, loading: tenantLoading } = useTenant();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [settings, setSettings] = useState<DailySummarySettings | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const canEdit = Boolean(member && ['owner', 'admin', 'gerente'].includes(member.role));

  const authHeaders = useCallback(async () => ({
    Authorization: `Bearer ${await authUser!.getIdToken()}`,
    'x-tenant-id': tenant!.id,
  }), [authUser, tenant]);

  const load = useCallback(async () => {
    if (!authUser || !tenant) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/daily-summaries', { headers: await authHeaders(), cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar el resumen diario.');
      setPayload(data);
      setSettings(data.settings);
      setSelectedId((current) => current || data.summaries?.[0]?.id || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo cargar el resumen diario.');
    } finally {
      setLoading(false);
    }
  }, [authUser, tenant, authHeaders]);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => {
    if (!payload) return null;
    return payload.summaries.find((row) => row.id === selectedId) || payload.summaries[0] || null;
  }, [payload, selectedId]);

  const currency = payload?.tenant.currency || tenant?.currency || 'NIO';
  const preview = useMemo(() => {
    if (!selected) return '';
    if (selected.message) return selected.message;
    if (!selected.content) return '';
    return buildDailySummaryMessage({ content: selected.content, tenantName: payload?.tenant.name });
  }, [selected, payload]);

  const scheduleText = useMemo(() => {
    if (!settings) return '';
    const time = settings.sendAt;
    const mode = settings.mode === 'opening'
      ? 'el resumen del día anterior completo'
      : 'el resumen del día en curso hasta esa hora';
    return `Todos los días a las ${time} (${settings.timezone}) se genera ${mode}.`;
  }, [settings]);

  async function saveSettings() {
    if (!authUser || !tenant || !settings) return;
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const response = await fetch('/api/daily-summaries/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(settings),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar la configuración.');
      setPayload((current) => current ? { ...current, settings: data.settings, configured: true, schedule: data.schedule, whatsapp: data.whatsapp } : current);
      setSettings(data.settings);
      setNotice('Configuración guardada. El resumen se generará automáticamente a la hora indicada.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  }

  async function generateNow() {
    if (!authUser || !tenant) return;
    setGenerating(true);
    setNotice('');
    setError('');
    try {
      const response = await fetch('/api/daily-summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'generate' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo generar el resumen.');
      setNotice(data.throttled ? 'El resumen se acaba de recalcular; espera unos segundos.' : 'Resumen recalculado con los datos más recientes.');
      await load();
      if (data.summary?.id) setSelectedId(data.summary.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo generar el resumen.');
    } finally {
      setGenerating(false);
    }
  }

  async function sendNow(row: SummaryRow | null) {
    if (!authUser || !tenant || !row) return;
    setSending(row.id);
    setNotice('');
    setError('');
    try {
      const response = await fetch('/api/daily-summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'send', summaryId: row.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo enviar el resumen por WhatsApp.');
      if (data.delivery?.status === 'sent') setNotice(`Resumen enviado por WhatsApp a ${data.delivery.phone}.`);
      else setNotice(`El envío quedó en estado "${data.delivery?.status}"${data.delivery?.error ? `: ${data.delivery.error}` : ''}.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo enviar el resumen por WhatsApp.');
    } finally {
      setSending('');
    }
  }

  if (tenantLoading || loading || !payload || !settings) {
    return <div className="workspace-loading">{error || 'Cargando resumen diario…'}</div>;
  }
  if (!authUser || !tenant || !member) {
    router.replace('/');
    return null;
  }

  const content = selected?.content || null;
  const whatsappReady = payload.whatsapp.configured && settings.whatsappEnabled && Boolean(settings.whatsappPhone);

  return (
    <main className="workspace-page">
      <WorkspaceSidebar />
      <section className="workspace-main daily-summary-main">
        <header className="daily-summary-header">
          <div>
            <button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button>
            <div className="eyebrow catalog-eyebrow">Tu espacio / Automatización</div>
            <h1>Resumen diario automático</h1>
            <p>
              Ventas, ganancia aproximada, tickets, producto más vendido, alertas y comparaciones de
              <strong> {payload.tenant.name}</strong>. {scheduleText}
            </p>
          </div>
          <div className="daily-summary-actions">
            <button className="button button-secondary" onClick={() => void load()} disabled={loading}>Actualizar</button>
            <button className="button" onClick={() => void generateNow()} disabled={generating}>
              {generating ? 'Calculando…' : 'Generar ahora'}
            </button>
          </div>
        </header>

        {notice && <div className="catalog-message" role="status">{notice}</div>}
        {error && <div className="catalog-message summary-error" role="alert">{error}</div>}

        {!payload.whatsapp.configured && (
          <div className="summary-hint">
            <strong>WhatsApp todavía no está conectado en el servidor.</strong> El resumen se calcula y se ve aquí,
            pero para enviarlo automáticamente falta configurar las credenciales del proveedor
            (`WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` de Meta, o las credenciales de Twilio).
          </div>
        )}

        <div className="summary-metrics">
          <div>
            <small>Ventas del día</small>
            <strong>{money(content?.sales.total ?? selected?.sales_total ?? 0, currency)}</strong>
            <span>{selected ? `${Math.trunc(content?.sales.count ?? selected.sales_count)} tickets` : 'sin datos'}</span>
          </div>
          <div>
            <small>Ticket promedio</small>
            <strong>{money(content?.sales.averageTicket ?? selected?.average_ticket ?? 0, currency)}</strong>
            <span>{selected?.partial ? 'día en curso' : 'día completo'}</span>
          </div>
          <div>
            <small>Ganancia aproximada</small>
            <strong>{money(content?.profit.estimatedNet ?? selected?.estimated_net_profit ?? 0, currency)}</strong>
            <span>margen bruto {(content?.profit.marginPercent ?? selected?.margin_percent ?? 0).toFixed(1)}%</span>
          </div>
          <div>
            <small>Producto más vendido</small>
            <strong>{content?.topProducts?.[0]?.name || selected?.top_product?.name || '—'}</strong>
            <span>
              {content?.topProducts?.[0]?.quantity
                ? `${content.topProducts[0].quantity} unidades`
                : 'sin ventas de productos'}
            </span>
          </div>
        </div>

        <div className="summary-grid">
          <div className="summary-panel">
            <div className="report-panel-head">
              <div>
                <div className="eyebrow">Comparación</div>
                <h2>¿Cómo vamos vs. el promedio?</h2>
              </div>
            </div>
            <div className="summary-comparison">
              <div>
                <small>Día anterior</small>
                <strong>{money(content?.comparison?.previousDay?.total || 0, currency)}</strong>
                <span>{formatPercentChange(content?.comparison?.previousDay?.differencePercent)}</span>
              </div>
              <div>
                <small>Promedio 7 días</small>
                <strong>{money(content?.comparison?.sevenDayAverage?.total || 0, currency)}</strong>
                <span>{formatPercentChange(content?.comparison?.sevenDayAverage?.differencePercent)}</span>
              </div>
              <div>
                <small>Mismo día (4 semanas)</small>
                <strong>{money(content?.comparison?.sameWeekdayAverage?.total || 0, currency)}</strong>
                <span>{formatPercentChange(content?.comparison?.sameWeekdayAverage?.differencePercent)}</span>
              </div>
            </div>
            <div className="summary-alerts">
              <div className="eyebrow">Alertas del día</div>
              {(content?.alerts || []).length === 0 ? (
                <p className="summary-empty">Sin alertas importantes: inventario y cartera bajo control.</p>
              ) : (
                <ul>
                  {(content?.alerts || []).map((alert) => (
                    <li key={`${alert.type}-${alert.title}`} className={`summary-alert ${alert.severity}`}>
                      <b>{alert.title}</b>
                      <span>
                        {alert.message}
                        {Array.isArray(alert.items) && alert.items.length > 0 ? ` (${alert.items.slice(0, 3).join(', ')})` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="summary-panel">
            <div className="report-panel-head">
              <div>
                <div className="eyebrow">WhatsApp del dueño</div>
                <h2>Mensaje listo para enviar</h2>
              </div>
              <span className={`summary-status ${selected ? `status-${selected.whatsapp_status}` : ''}`}>
                {selected ? STATUS_LABEL[selected.whatsapp_status] || selected.whatsapp_status : 'sin resumen'}
              </span>
            </div>
            <pre className="summary-message">{preview || 'Genera el resumen para ver el mensaje que se enviará por WhatsApp.'}</pre>
            <div className="summary-whatsapp-actions">
              <button className="button" onClick={() => void sendNow(selected)} disabled={!selected || sending === selected?.id || !whatsappReady}>
                {sending && sending === selected?.id ? 'Enviando…' : 'Enviar por WhatsApp ahora'}
              </button>
              <span>
                {settings.whatsappEnabled
                  ? (settings.whatsappPhone ? `Destino: ${settings.whatsappPhone}` : 'Falta el número de WhatsApp')
                  : 'El envío automático está apagado'}
                {selected?.whatsapp_sent_at ? ` · último envío ${whenLabel(selected.whatsapp_sent_at)}` : ''}
              </span>
            </div>
          </div>
        </div>

        <div className="summary-panel">
          <div className="report-panel-head">
            <div>
              <div className="eyebrow">Automatización</div>
              <h2>Hora y envío</h2>
            </div>
          </div>
          <div className="summary-settings">
            <label className="summary-field">
              <span>Activar resumen diario</span>
              <input
                type="checkbox"
                checked={settings.enabled}
                disabled={!canEdit}
                onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
              />
            </label>
            <label className="summary-field">
              <span>Tipo de resumen</span>
              <select
                value={settings.mode}
                disabled={!canEdit}
                onChange={(event) => setSettings({ ...settings, mode: event.target.value === 'opening' ? 'opening' : 'closing' })}
              >
                <option value="closing">Cierre del día en curso (8:00 pm)</option>
                <option value="opening">Día anterior completo (7:00 am)</option>
              </select>
            </label>
            <label className="summary-field">
              <span>Hora local de envío</span>
              <input
                type="time"
                value={settings.sendAt}
                disabled={!canEdit}
                onChange={(event) => setSettings({ ...settings, sendAt: event.target.value })}
              />
            </label>
            <label className="summary-field">
              <span>Zona horaria</span>
              <select
                value={settings.timezone}
                disabled={!canEdit}
                onChange={(event) => setSettings({ ...settings, timezone: event.target.value })}
              >
                {Array.from(new Set([...timezoneOptions, settings.timezone, payload.tenant.timezone])).map((zone) => (
                  <option value={zone} key={zone}>{zone}</option>
                ))}
              </select>
            </label>
            <label className="summary-field">
              <span>Enviar por WhatsApp</span>
              <input
                type="checkbox"
                checked={settings.whatsappEnabled}
                disabled={!canEdit}
                onChange={(event) => setSettings({ ...settings, whatsappEnabled: event.target.checked })}
              />
            </label>
            <label className="summary-field">
              <span>WhatsApp del dueño</span>
              <input
                type="tel"
                placeholder="+50588888888"
                value={settings.whatsappPhone}
                disabled={!canEdit}
                onChange={(event) => setSettings({ ...settings, whatsappPhone: event.target.value })}
              />
              <small>Con código de país. Ejemplo: +50588888888</small>
            </label>
            <label className="summary-field">
              <span>Incluir alertas</span>
              <input
                type="checkbox"
                checked={settings.includeAlerts}
                disabled={!canEdit}
                onChange={(event) => setSettings({ ...settings, includeAlerts: event.target.checked })}
              />
            </label>
          </div>
          {canEdit ? (
            <div className="summary-save-bar">
              <span>Próxima generación: {payload.schedule.summaryDate}{settings.mode === 'closing' ? ' (parcial hasta la hora de envío)' : ''}.</span>
              <button className="button" onClick={() => void saveSettings()} disabled={saving}>{saving ? 'Guardando…' : 'Guardar configuración'}</button>
            </div>
          ) : (
            <div className="summary-save-bar"><span>Solo el dueño, administradores y gerentes pueden cambiar esta configuración.</span></div>
          )}
        </div>

        <div className="summary-panel">
          <div className="report-panel-head">
            <div>
              <div className="eyebrow">Historial</div>
              <h2>Últimos resúmenes</h2>
            </div>
          </div>
          {payload.summaries.length === 0 ? (
            <p className="summary-empty">Todavía no hay resúmenes guardados. Pulsa «Generar ahora» para crear el primero.</p>
          ) : (
            <div className="summary-history">
              {payload.summaries.map((row) => (
                <div className={`summary-history-row ${row.id === selected?.id ? 'active' : ''}`} key={row.id}>
                  <button className="summary-history-main" onClick={() => setSelectedId(row.id)}>
                    <b>{row.summary_date}{row.partial ? ' · parcial' : ''}</b>
                    <span>{money(row.sales_total, row.currency)} · {Math.trunc(row.sales_count)} tickets · ganancia {money(row.estimated_net_profit, row.currency)}</span>
                  </button>
                  <span className={`summary-status status-${row.whatsapp_status}`}>{STATUS_LABEL[row.whatsapp_status] || row.whatsapp_status}</span>
                  <button className="button button-secondary button-small" onClick={() => void sendNow(row)} disabled={!canEdit || sending === row.id || row.whatsapp_status === 'sent'}>
                    {sending === row.id ? 'Enviando…' : row.whatsapp_status === 'sent' ? 'Enviado' : 'Enviar'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default function DailySummaryPage() {
  return <DailySummaryContentPage />;
}
