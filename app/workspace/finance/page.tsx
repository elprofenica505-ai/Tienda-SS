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

const PAYMENT_LABELS: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', credit: 'Crédito' };
const KIND_LABELS: Record<FinanceEntry['kind'], string> = { expense: 'Gasto', cash: 'Caja' };

function paymentLabel(method: string) { return PAYMENT_LABELS[method] || method || 'Efectivo'; }

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
  const payments = useMemo(() => Array.from(new Set(entries.map((item) => item.paymentMethod).filter(Boolean))).sort(), [entries]);

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

  const dayFormatter = useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }), [timezone]);
  const headingFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long' }), [locale, timezone]);
  const timeFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: '2-digit', minute: '2-digit' }), [locale, timezone]);
  const dayKey = useCallback((iso: string) => { if (!iso) return 'sin-fecha'; const date = new Date(iso); return Number.isNaN(date.getTime()) ? 'sin-fecha' : dayFormatter.format(date); }, [dayFormatter]);

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

  const chart = useMemo(() => {
    const days = groups.filter((group) => group.key !== 'sin-fecha').slice(0, 14).reverse();
    const peak = days.reduce((max, group) => Math.max(max, group.in, group.out), 0);
    return { days, peak };
  }, [groups]);

  const activeFilters = (category !== 'all' ? 1 : 0) + (direction !== 'all' ? 1 : 0) + (payment !== 'all' ? 1 : 0) + (search.trim() ? 1 : 0);
  function resetFilters() { setCategory('all'); setDirection('all'); setPayment('all'); setSearch(''); }

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

    <div className="finance-metrics finance-metrics-enhanced">
      <div><small>Ingresos registrados</small><strong>{money(summary.income)}</strong><span>ventas cobradas</span></div>
      <div><small>Gastos</small><strong>{money(summary.expenses)}</strong><span>{expenses.length} salida{expenses.length === 1 ? '' : 's'} operativa{expenses.length === 1 ? '' : 's'}</span></div>
      <div className={summary.adjustments < 0 ? 'metric-alert' : ''}><small>Ajustes de caja</small><strong>{summary.adjustments >= 0 ? '+' : '−'}{money(Math.abs(summary.adjustments))}</strong><span>{cashMovements.length} movimiento{cashMovements.length === 1 ? '' : 's'}</span></div>
      <div className={summary.net < 0 ? 'metric-alert' : ''}><small>Flujo neto</small><strong>{money(summary.net)}</strong><span>ingresos - gastos + ajustes</span></div>
    </div>

    <div className="finance-toolbar">
      <div className="finance-filter-group" role="group" aria-label="Filtrar por categoría">
        <button type="button" className={category === 'all' ? 'selected' : ''} onClick={() => setCategory('all')}>Todos</button>
        {categories.map((item) => <button type="button" key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}
      </div>
      <div className="finance-filter-inputs">
        <label className="finance-search"><span className="sr-only">Buscar movimiento</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por descripción, categoría o nota" /></label>
        <label className="finance-select">Dirección<select value={direction} onChange={(event) => setDirection(event.target.value as DirectionFilter)}><option value="all">Todas</option><option value="in">Entradas</option><option value="out">Salidas</option></select></label>
        <label className="finance-select">Pago<select value={payment} onChange={(event) => setPayment(event.target.value)}><option value="all">Todos</option>{payments.map((item) => <option key={item} value={item}>{paymentLabel(item)}</option>)}</select></label>
        {activeFilters > 0 && <button className="text-link finance-reset" type="button" onClick={resetFilters}>Limpiar filtros ({activeFilters})</button>}
      </div>
    </div>

    <div className="finance-filter-summary" role="status">
      <span>{filtered.length} de {entries.length} registro{entries.length === 1 ? '' : 's'}</span>
      <b className="finance-income">Entradas {money(filteredTotals.in)}</b>
      <b>Salidas {money(filteredTotals.out)}</b>
      <b className={filteredTotals.in - filteredTotals.out < 0 ? 'finance-negative' : 'finance-income'}>Neto {money(filteredTotals.in - filteredTotals.out)}</b>
    </div>

    {chart.days.length > 0 && <div className="finance-chart-card">
      <div className="finance-chart-heading"><div><div className="eyebrow">Tendencia</div><h2>Entradas y salidas por día</h2></div><div className="finance-chart-legend"><span><i className="is-in" />Entradas</span><span><i className="is-out" />Salidas</span></div></div>
      <div className="finance-minichart" role="img" aria-label={`Entradas y salidas de los últimos ${chart.days.length} días con actividad`}>
        {chart.days.map((group) => <div className="finance-minichart-day" key={group.key} title={`${group.label}: entradas ${money(group.in)}, salidas ${money(group.out)}`}>
          <div className="finance-minichart-bars">
            <i className="is-in" style={{ height: `${chart.peak ? Math.max(group.in ? 4 : 0, (group.in / chart.peak) * 100) : 0}%` }} />
            <i className="is-out" style={{ height: `${chart.peak ? Math.max(group.out ? 4 : 0, (group.out / chart.peak) * 100) : 0}%` }} />
          </div>
          <small>{group.key.slice(5).replace('-', '/')}</small>
        </div>)}
      </div>
    </div>}

    {groups.length === 0
      ? <div className="inventory-empty finance-empty">{entries.length === 0 ? 'Todavía no hay gastos ni movimientos registrados.' : 'Ningún registro coincide con los filtros seleccionados.'}</div>
      : <div className="finance-timeline">{groups.map((group) => <section className="finance-day-group" key={group.key}>
        <header className="finance-day-header"><h3>{group.label}</h3><div className="finance-day-totals">{group.in > 0 && <b className="finance-income">+{money(group.in)}</b>}{group.out > 0 && <b>−{money(group.out)}</b>}<span>{group.entries.length} registro{group.entries.length === 1 ? '' : 's'}</span></div></header>
        {group.entries.map((item) => <div className="finance-row finance-entry-row" key={item.id}>
          <span className={`finance-icon ${item.direction === 'in' ? 'income' : 'expense'}`}>{item.direction === 'in' ? '↑' : '↓'}</span>
          <div><b>{item.description}</b><small>{item.category} · {paymentLabel(item.paymentMethod)}{item.notes ? ` · ${item.notes}` : ''}</small></div>
          <div className="finance-entry-meta"><span className={`finance-tag is-${item.kind}`}>{KIND_LABELS[item.kind]}</span>{item.createdAt && <small>{timeFormatter.format(new Date(item.createdAt))}</small>}</div>
          <strong className={item.direction === 'in' ? 'finance-income' : ''}>{item.direction === 'in' ? '+' : '−'}{money(item.amount)}</strong>
        </div>)}
      </section>)}</div>}

    {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><div className="catalog-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setModal(null)}>×</button><div className="eyebrow">{modal === 'expense' ? 'Nuevo gasto' : 'Movimiento de caja'}</div><h2>{modal === 'expense' ? 'Registra una salida.' : 'Ajusta el flujo.'}</h2><form onSubmit={save}><label>Descripción<input required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={modal === 'expense' ? 'Ej. Renta del local' : 'Ej. Fondo inicial'} /></label><label>Monto<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0.00" /></label>{modal === 'expense' ? <label>Categoría<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>General</option><option>Operación</option><option>Personal</option><option>Servicios</option><option>Compras</option><option>Impuestos</option></select></label> : <label>Dirección<select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value })}><option value="in">Entrada</option><option value="out">Salida / retiro</option></select></label>}<label>Método de pago<select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option></select></label><label>Notas<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Opcional" /></label><button className="button auth-submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar registro ↗'}</button></form></div></div>}
  </section></main>;
}

export default function FinancePage() {
  return <FinanceContent />; }
