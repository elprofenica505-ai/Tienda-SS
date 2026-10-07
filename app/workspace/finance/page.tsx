'use client';

import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/components/tenant/TenantProvider';
import { formatMoney } from '@/lib/currency';
import { describeRequestError } from '@/lib/connectivity';

type Expense = { id: string; description: string; amount: number; category?: string; paymentMethod?: string; notes?: string; createdAt?: string };
type CashMovement = { id: string; description: string; amount: number; direction: string; paymentMethod?: string; notes?: string; createdAt?: string };
type FinanceEntry = { id: string; kind: 'expense' | 'cash'; description: string; amount: number; direction: 'in' | 'out'; category: string; paymentMethod: string; notes: string; createdAt: string };
type DirectionFilter = 'all' | 'in' | 'out';

const CANONICAL_METHODS = ['cash', 'card', 'transfer', 'credit'] as const;
const PAYMENT_LABELS: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', credit: 'Crédito' };
const KIND_LABELS: Record<FinanceEntry['kind'], string> = { expense: 'Gasto', cash: 'Caja' };
const DIRECTION_FILTERS: Array<{ id: DirectionFilter; label: string }> = [{ id: 'all', label: 'Todas' }, { id: 'in', label: 'Entradas' }, { id: 'out', label: 'Salidas' }];
const CHART_DAYS = 7;
const DAY_MS = 86_400_000;

function paymentLabel(method: string) { return PAYMENT_LABELS[method] || method || 'Efectivo'; }
function dayStamp(date: Date, timezone: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function trendPercent(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function FinanceContent() {
  const router = useRouter();
  const { authUser, tenant, member, activeBranchId, loading: tenantLoading } = useTenant();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [summary, setSummary] = useState({ income: 0, expenses: 0, adjustments: 0, net: 0 });
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');
  const [modal, setModal] = useState<'expense' | 'cash' | null>(null);
  const [form, setForm] = useState({ description: '', amount: '', category: 'General', paymentMethod: 'cash', direction: 'out', notes: '' });
  const [category, setCategory] = useState('all'); const [direction, setDirection] = useState<DirectionFilter>('all'); const [payment, setPayment] = useState('all'); const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(''); const [chartFocus, setChartFocus] = useState('');

  const currency = tenant?.currency; const locale = tenant?.locale || 'es-NI'; const timezone = tenant?.timezone || 'America/Managua';
  const money = useCallback((value: number) => formatMoney(value, currency, locale), [currency, locale]);

  const load = useCallback(async () => {
    if (!authUser || !tenant || !activeBranchId) return;
    setLoading(true);
    try {
      const token = await authUser.getIdToken();
      const response = await fetch('/api/finance', { headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenant.id, 'x-branch-id': activeBranchId }, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar las finanzas.');
      setExpenses(data.expenses || []); setCashMovements(data.cashMovements || []); setSummary(data.summary || { income: 0, expenses: 0, adjustments: 0, net: 0 });
      setMessage('');
    } catch (error) { setMessage(describeRequestError(error, 'Error cargando finanzas.')); }
    finally { setLoading(false); }
  }, [authUser, tenant, activeBranchId]);
  useEffect(() => { void load(); }, [load]);

  const entries = useMemo<FinanceEntry[]>(() => {
    const fromExpenses = expenses.map<FinanceEntry>((item) => ({ id: `expense-${item.id}`, kind: 'expense', description: item.description, amount: Math.abs(Number(item.amount) || 0), direction: 'out', category: item.category || 'General', paymentMethod: item.paymentMethod || 'cash', notes: item.notes || '', createdAt: item.createdAt || '' }));
    const fromCash = cashMovements.map<FinanceEntry>((item) => ({ id: `cash-${item.id}`, kind: 'cash', description: item.description, amount: Math.abs(Number(item.amount) || 0), direction: item.direction === 'in' ? 'in' : 'out', category: 'Movimiento de caja', paymentMethod: item.paymentMethod || 'cash', notes: item.notes || '', createdAt: item.createdAt || '' }));
    return [...fromExpenses, ...fromCash].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [expenses, cashMovements]);

  const categories = useMemo(() => Array.from(new Set(entries.map((item) => item.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, locale)), [entries, locale]);
  /** Los métodos canónicos siempre se ofrecen (incluida Transferencia), aunque todavía no haya registros con ese método. */
  const paymentOptions = useMemo(() => {
    const extras = Array.from(new Set(entries.map((item) => item.paymentMethod).filter((method) => method && !CANONICAL_METHODS.includes(method as typeof CANONICAL_METHODS[number]))));
    return [...CANONICAL_METHODS.map((id) => ({ id, label: PAYMENT_LABELS[id] })), ...extras.map((id) => ({ id, label: paymentLabel(id) }))];
  }, [entries]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (direction !== 'all' && item.direction !== direction) return false;
      if (payment !== 'all' && item.paymentMethod !== payment) return false;
      if (!needle) return true;
      return [item.description, item.category, item.notes, paymentLabel(item.paymentMethod), KIND_LABELS[item.kind]].join(' ').toLowerCase().includes(needle);
    });
  }, [entries, category, direction, payment, search]);

  const filteredTotals = useMemo(() => filtered.reduce((totals, item) => {
    if (item.direction === 'in') totals.in += item.amount; else totals.out += item.amount;
    return totals;
  }, { in: 0, out: 0 }), [filtered]);

  const headingFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long' }), [locale, timezone]);
  const timeFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: '2-digit', minute: '2-digit' }), [locale, timezone]);
  const fullFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' }), [locale, timezone]);
  const dayKey = useCallback((iso: string) => { if (!iso) return 'sin-fecha'; const date = new Date(iso); return Number.isNaN(date.getTime()) ? 'sin-fecha' : dayStamp(date, timezone); }, [timezone]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; entries: FinanceEntry[]; in: number; out: number }>();
    for (const item of filtered) {
      const key = dayKey(item.createdAt);
      const date = item.createdAt ? new Date(item.createdAt) : null;
      const label = key === 'sin-fecha' || !date || Number.isNaN(date.getTime()) ? 'Sin fecha registrada' : headingFormatter.format(date);
      const group = map.get(key) || { key, label, entries: [], in: 0, out: 0 };
      group.entries.push(item);
      if (item.direction === 'in') group.in += item.amount; else group.out += item.amount;
      map.set(key, group);
    }
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [filtered, dayKey, headingFormatter]);

  /** Siete días consecutivos (incluidos los vacíos) anclados al día con actividad más reciente. */
  const chart = useMemo(() => {
    const perDay = new Map<string, { in: number; out: number }>();
    for (const item of entries) {
      const key = dayKey(item.createdAt);
      if (key === 'sin-fecha') continue;
      const slot = perDay.get(key) || { in: 0, out: 0 };
      if (item.direction === 'in') slot.in += item.amount; else slot.out += item.amount;
      perDay.set(key, slot);
    }
    const today = dayStamp(new Date(), timezone);
    const latest = Array.from(perDay.keys()).sort().pop();
    const anchorKey = latest && latest > today ? latest : (latest && latest < today ? (perDay.has(today) ? today : latest) : today);
    const anchor = new Date(`${anchorKey}T12:00:00Z`);
    const days = Array.from({ length: CHART_DAYS }, (_, index) => {
      const date = new Date(anchor.getTime() - (CHART_DAYS - 1 - index) * DAY_MS);
      const key = dayStamp(date, timezone);
      const slot = perDay.get(key) || { in: 0, out: 0 };
      return { key, date, in: slot.in, out: slot.out, label: headingFormatter.format(date) };
    });
    const peak = days.reduce((max, day) => Math.max(max, day.in, day.out), 0);
    const totals = days.reduce((acc, day) => ({ in: acc.in + day.in, out: acc.out + day.out }), { in: 0, out: 0 });
    return { days, peak, totals, hasData: peak > 0 };
  }, [entries, dayKey, timezone, headingFormatter]);

  /** Tendencia de gastos: últimos 7 días frente a los 7 anteriores (solo con fechas reales). */
  const expenseTrend = useMemo(() => {
    const now = Date.now();
    let current = 0; let previous = 0;
    for (const item of entries) {
      if (item.direction !== 'out' || !item.createdAt) continue;
      const time = new Date(item.createdAt).getTime();
      if (Number.isNaN(time)) continue;
      const age = now - time;
      if (age < 0) continue;
      if (age <= CHART_DAYS * DAY_MS) current += item.amount;
      else if (age <= 2 * CHART_DAYS * DAY_MS) previous += item.amount;
    }
    return { current, previous, percent: trendPercent(current, previous) };
  }, [entries]);

  const activeFilters = (category !== 'all' ? 1 : 0) + (direction !== 'all' ? 1 : 0) + (payment !== 'all' ? 1 : 0) + (search.trim() ? 1 : 0);
  function resetFilters() { setCategory('all'); setDirection('all'); setPayment('all'); setSearch(''); }
  const selected = filtered.find((item) => item.id === selectedId) || null;
  const focusDay = chart.days.find((day) => day.key === chartFocus) || null;

  function open(type: 'expense' | 'cash') { setForm({ description: '', amount: '', category: 'General', paymentMethod: 'cash', direction: type === 'cash' ? 'in' : 'out', notes: '' }); setModal(type); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!authUser || !tenant || !activeBranchId || !modal) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id, 'x-branch-id': activeBranchId }, body: JSON.stringify({ ...form, type: modal, amount: Number(form.amount) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo registrar.');
      setMessage(modal === 'expense' ? 'Gasto registrado.' : 'Movimiento de caja registrado.'); setModal(null); await load();
    } catch (error) { setMessage(describeRequestError(error, 'No se pudo registrar.')); }
    finally { setSaving(false); }
  }

  if (tenantLoading || loading) return <div className="workspace-loading">Cargando flujo de caja...</div>;
  if (!authUser || !tenant || !member) { router.replace('/'); return null; }
  if (!activeBranchId) return <div className="workspace-loading">Selecciona una sucursal para consultar finanzas.</div>;

  return <main className="workspace-page"><WorkspaceSidebar /><section className="workspace-main finance-main">
    <header className="finance-header"><div><button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button><div className="eyebrow catalog-eyebrow">Tu espacio / Finanzas</div><h1>Flujo de caja</h1><p>Controla ingresos, gastos y movimientos de <strong>{tenant.name}</strong>.</p></div><div className="finance-actions"><button className="button button-secondary" onClick={() => open('cash')}>+ Movimiento de caja</button><button className="button" onClick={() => open('expense')}>+ Registrar gasto</button></div></header>
    {message && <div className="catalog-message">{message}</div>}

    <div className="finance-metrics-grid">
      <article className="finance-metric is-income"><header><span className="finance-metric-icon" aria-hidden="true">↑</span><small>Ingresos registrados</small></header><strong>{money(summary.income)}</strong><span>ventas cobradas en la sucursal</span></article>
      <article className="finance-metric is-expense"><header><span className="finance-metric-icon" aria-hidden="true">↓</span><small>Gastos</small></header><strong>{money(summary.expenses)}</strong><span>{expenses.length} salida{expenses.length === 1 ? '' : 's'} operativa{expenses.length === 1 ? '' : 's'}</span>{expenseTrend.percent === null ? <em className="finance-trend is-flat">Sin periodo previo para comparar</em> : <em className={`finance-trend ${expenseTrend.percent > 0 ? 'is-up' : 'is-down'}`}>{expenseTrend.percent > 0 ? '▲' : '▼'} {Math.abs(expenseTrend.percent).toFixed(1)}% vs. 7 días previos</em>}</article>
      <article className="finance-metric is-adjust"><header><span className="finance-metric-icon" aria-hidden="true">⇅</span><small>Ajustes de caja</small></header><strong>{summary.adjustments >= 0 ? '+' : '−'}{money(Math.abs(summary.adjustments))}</strong><span>{cashMovements.length} movimiento{cashMovements.length === 1 ? '' : 's'} de caja</span></article>
      <article className={`finance-metric ${summary.net < 0 ? 'is-negative' : 'is-net'}`}><header><span className="finance-metric-icon" aria-hidden="true">∑</span><small>Flujo neto</small></header><strong>{money(summary.net)}</strong><span>ingresos − gastos + ajustes</span></article>
    </div>

    <div className="finance-toolbar">
      <div className="finance-filter-group" role="group" aria-label="Filtrar por categoría">
        <button type="button" className={category === 'all' ? 'selected' : ''} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>Todos</button>
        {categories.map((item) => <button type="button" key={item} className={category === item ? 'selected' : ''} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
      </div>
      <div className="finance-filter-group is-secondary" role="group" aria-label="Filtrar por método de pago">
        <button type="button" className={payment === 'all' ? 'selected' : ''} aria-pressed={payment === 'all'} onClick={() => setPayment('all')}>Todos</button>
        {paymentOptions.map((item) => <button type="button" key={item.id} className={payment === item.id ? 'selected' : ''} aria-pressed={payment === item.id} onClick={() => setPayment(item.id)}>{item.label}</button>)}
      </div>
      <div className="finance-filter-inputs">
        <label className="finance-search"><span className="sr-only">Buscar movimiento</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por descripción, categoría o nota" /></label>
        <label className="finance-select">Dirección<select value={direction} onChange={(event) => setDirection(event.target.value as DirectionFilter)}>{DIRECTION_FILTERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        {activeFilters > 0 && <button className="text-link finance-reset" type="button" onClick={resetFilters}>Limpiar filtros ({activeFilters})</button>}
      </div>
    </div>

    <div className="finance-filter-summary" role="status">
      <span>{filtered.length} de {entries.length} registro{entries.length === 1 ? '' : 's'}</span>
      <b className="finance-income">Entradas {money(filteredTotals.in)}</b>
      <b>Salidas {money(filteredTotals.out)}</b>
      <b className={filteredTotals.in - filteredTotals.out < 0 ? 'finance-negative' : 'finance-income'}>Neto {money(filteredTotals.in - filteredTotals.out)}</b>
    </div>

    <div className="finance-chart-card">
      <div className="finance-chart-heading">
        <div><div className="eyebrow">Tendencia</div><h2>Ingresos y egresos por día</h2><p>Entradas y salidas de caja de los últimos {CHART_DAYS} días con actividad.</p></div>
        <div className="finance-chart-legend"><span><i className="is-in" />Entradas</span><span><i className="is-out" />Salidas</span></div>
      </div>
      {chart.hasData ? <>
        <div className="finance-chart" role="group" aria-label={`Entradas y salidas de los últimos ${CHART_DAYS} días`}>
          {chart.days.map((day) => <button type="button" className={`finance-chart-day ${chartFocus === day.key ? 'is-focused' : ''}`} key={day.key} onMouseEnter={() => setChartFocus(day.key)} onMouseLeave={() => setChartFocus('')} onFocus={() => setChartFocus(day.key)} onBlur={() => setChartFocus('')} aria-label={`${day.label}: entradas ${money(day.in)}, salidas ${money(day.out)}`}>
            <span className="finance-chart-bars">
              <i className="is-in" style={{ height: `${chart.peak ? Math.max(day.in > 0 ? 3 : 0, (day.in / chart.peak) * 100) : 0}%` }} />
              <i className="is-out" style={{ height: `${chart.peak ? Math.max(day.out > 0 ? 3 : 0, (day.out / chart.peak) * 100) : 0}%` }} />
            </span>
            <small>{day.key.slice(5).replace('-', '/')}</small>
          </button>)}
        </div>
        <div className="finance-chart-focus">{focusDay
          ? <><strong>{focusDay.label}</strong><span>Entradas <b className="finance-income">{money(focusDay.in)}</b></span><span>Salidas <b>{money(focusDay.out)}</b></span><span>Neto <b className={focusDay.in - focusDay.out < 0 ? 'finance-negative' : 'finance-income'}>{money(focusDay.in - focusDay.out)}</b></span></>
          : <><strong>Total del periodo</strong><span>Entradas <b className="finance-income">{money(chart.totals.in)}</b></span><span>Salidas <b>{money(chart.totals.out)}</b></span><span className="finance-chart-hint">Pasa el cursor por un día para ver su detalle</span></>}</div>
      </> : <div className="inventory-empty">Todavía no hay movimientos con fecha para graficar.</div>}
    </div>

    {groups.length === 0
      ? <div className="inventory-empty finance-empty">{entries.length === 0 ? 'Todavía no hay gastos ni movimientos registrados.' : 'Ningún registro coincide con los filtros seleccionados.'}</div>
      : <div className="finance-timeline">{groups.map((group) => <section className="finance-day-group" key={group.key}>
        <header className="finance-day-header"><h3>{group.label}</h3><div className="finance-day-totals">{group.in > 0 && <b className="finance-income">+{money(group.in)}</b>}{group.out > 0 && <b>−{money(group.out)}</b>}<span>{group.entries.length} registro{group.entries.length === 1 ? '' : 's'}</span></div></header>
        {group.entries.map((item) => <button type="button" className={`finance-entry-row ${selectedId === item.id ? 'selected' : ''}`} key={item.id} aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)}>
          <span className={`finance-entry-icon ${item.direction === 'in' ? 'is-in' : 'is-out'}`} aria-hidden="true">{item.direction === 'in' ? '↑' : '↓'}</span>
          <span className="finance-entry-copy"><b>{item.description}</b><small>{item.category}{item.notes ? ` · ${item.notes}` : ''}</small><span className="finance-badges"><i className={`finance-method-badge is-${item.paymentMethod}`}>{paymentLabel(item.paymentMethod)}</i><i className={`finance-kind-badge is-${item.kind}`}>{KIND_LABELS[item.kind]}</i></span></span>
          <span className="finance-entry-amount"><strong className={item.direction === 'in' ? 'finance-income' : ''}>{item.direction === 'in' ? '+' : '−'}{money(item.amount)}</strong>{item.createdAt && <small>{timeFormatter.format(new Date(item.createdAt))}</small>}</span>
        </button>)}
      </section>)}</div>}

    {selected && <>
      <div className="finance-detail-backdrop is-open" onClick={() => setSelectedId('')} aria-hidden="true" />
      <aside className="finance-detail-panel is-open" aria-label="Detalle del registro">
        <header className="finance-detail-header">
          <div className="finance-detail-identity"><span className={`finance-detail-icon ${selected.direction === 'in' ? 'is-in' : 'is-out'}`} aria-hidden="true">{selected.direction === 'in' ? '↑' : '↓'}</span><div><div className="eyebrow">Detalle del registro</div><h3>{selected.description}</h3></div></div>
          <button className="finance-detail-close" type="button" aria-label="Cerrar detalle" onClick={() => setSelectedId('')}>×</button>
        </header>
        <div className="finance-detail-amount"><small>Monto</small><strong className={selected.direction === 'in' ? 'finance-income' : 'finance-negative'}>{selected.direction === 'in' ? '+' : '−'}{money(selected.amount)}</strong></div>
        <div className="finance-detail-facts">
          <div><small>Tipo</small><b>{KIND_LABELS[selected.kind]}</b></div>
          <div><small>Categoría</small><b>{selected.category}</b></div>
          <div><small>Método de pago</small><b>{paymentLabel(selected.paymentMethod)}</b></div>
          <div><small>Dirección</small><b>{selected.direction === 'in' ? 'Entrada' : 'Salida'}</b></div>
          <div className="is-wide"><small>Fecha y hora</small><b>{selected.createdAt ? fullFormatter.format(new Date(selected.createdAt)) : 'Sin fecha registrada'}</b></div>
          {selected.notes && <div className="is-wide"><small>Notas</small><b>{selected.notes}</b></div>}
        </div>
        <div className="finance-detail-actions">
          <button className="button button-secondary" type="button" disabled title="La API de finanzas todavía no expone edición ni borrado.">Editar</button>
          <button className="button button-secondary" type="button" disabled title="La API de finanzas todavía no expone edición ni borrado.">Eliminar</button>
        </div>
        <p className="finance-detail-note">Editar y eliminar quedan a la espera de que <code>/api/finance</code> exponga esas operaciones; hoy solo admite consulta y alta.</p>
      </aside>
    </>}

    {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><div className="catalog-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setModal(null)}>×</button><div className="eyebrow">{modal === 'expense' ? 'Nuevo gasto' : 'Movimiento de caja'}</div><h2>{modal === 'expense' ? 'Registra una salida.' : 'Ajusta el flujo.'}</h2><form onSubmit={save}><label>Descripción<input required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={modal === 'expense' ? 'Ej. Renta del local' : 'Ej. Fondo inicial'} /></label><label>Monto<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0.00" /></label>{modal === 'expense' ? <label>Categoría<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>General</option><option>Operación</option><option>Personal</option><option>Servicios</option><option>Compras</option><option>Impuestos</option></select></label> : <label>Dirección<select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value })}><option value="in">Entrada</option><option value="out">Salida / retiro</option></select></label>}<label>Método de pago<select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="credit">Crédito</option></select></label><label>Notas<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Opcional" /></label><button className="button auth-submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar registro ↗'}</button></form></div></div>}
  </section></main>;
}

export default function FinancePage() {
  return <FinanceContent />; }
