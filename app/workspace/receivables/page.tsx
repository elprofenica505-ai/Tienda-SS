'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TenantProvider, useTenant } from '@/components/tenant/TenantProvider';

type CustomerBalance = { customerId: string; customerName: string; sales: number; total: number; paid: number; balance: number };
type CreditSale = { id: string; saleNumber?: string; customerId?: string; customerName?: string; total: number; paidAmount: number; balanceDue: number; paymentStatus: string; paymentMethod: string };

type PaymentForm = { saleId: string; amount: string; paymentMethod: string; notes: string };

function ReceivablesContent() {
  const router = useRouter();
  const { authUser, tenant, member, loading: tenantLoading } = useTenant();
  const [customers, setCustomers] = useState<CustomerBalance[]>([]);
  const [sales, setSales] = useState<CreditSale[]>([]);
  const [summary, setSummary] = useState({ receivables: 0, balance: 0, collected: 0 });
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [form, setForm] = useState<PaymentForm>({ saleId: '', amount: '', paymentMethod: 'cash', notes: '' });

  async function load() {
    if (!authUser || !tenant) return;
    setLoading(true);
    try { const response = await fetch('/api/receivables', { headers: { Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las cuentas.'); setCustomers(data.customers || []); setSales(data.sales || []); setSummary(data.summary || { receivables: 0, balance: 0, collected: 0 }); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Error cargando cuentas por cobrar.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [authUser, tenant]);
  async function pay(event: FormEvent) { event.preventDefault(); if (!authUser || !tenant) return; setSaving(true); setMessage(''); try { const response = await fetch('/api/receivables', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, body: JSON.stringify({ ...form, amount: Number(form.amount) }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo registrar el pago.'); setMessage(`Pago registrado. Saldo restante: $${Number(data.balanceDue).toFixed(2)}.`); setShowPayment(false); setForm({ saleId: '', amount: '', paymentMethod: 'cash', notes: '' }); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo registrar el pago.'); } finally { setSaving(false); } }
  if (tenantLoading || loading) return <div className="workspace-loading">Cargando cuentas por cobrar...</div>;
  if (!authUser || !tenant || !member) { router.replace('/'); return null; }
  const filteredCustomers = customers.filter((item) => item.customerName.toLowerCase().includes(query.toLowerCase()));
  const pendingSales = sales.filter((item) => item.balanceDue > 0);
  return <main className="workspace-page"><aside className="workspace-sidebar"><div className="onboarding-brand"><span className="brand-mark-icon">N</span><b>Nexo<span>Flow</span></b></div><div className="workspace-company"><span>{tenant.name.slice(0, 1).toUpperCase()}</span><div><b>{tenant.name}</b><small>Plan {tenant.plan || 'Starter'}</small></div></div><nav><a onClick={() => router.push('/workspace')}>▦ <span>Resumen</span></a><a onClick={() => router.push('/workspace/sales')}>◈ <span>Ventas / POS</span></a><a className="active">$ <span>Cuentas por cobrar</span></a><a onClick={() => router.push('/workspace/contacts')}>○ <span>Contactos</span></a></nav></aside><section className="workspace-main receivables-main"><header className="receivables-header"><div><button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button><div className="eyebrow catalog-eyebrow">Tu espacio / Finanzas</div><h1>Cuentas por cobrar</h1><p>Controla los saldos pendientes de <strong>{tenant.name}</strong>.</p></div><button className="button" onClick={() => setShowPayment(true)} disabled={!pendingSales.length}>+ Registrar pago</button></header>{message && <div className="catalog-message">{message}</div>}<div className="receivables-metrics"><div><small>Saldo pendiente</small><strong>${summary.balance.toFixed(2)}</strong><span>por cobrar</span></div><div><small>Ventas a crédito</small><strong>{summary.receivables}</strong><span>con saldo pendiente</span></div><div><small>Total cobrado</small><strong>${summary.collected.toFixed(2)}</strong><span>pagos recibidos</span></div></div><div className="receivables-layout"><div className="receivables-panel"><div className="inventory-panel-header"><div><div className="eyebrow">Cartera</div><h2>Saldos por cliente</h2></div><input className="inventory-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente" /></div>{filteredCustomers.length === 0 ? <div className="inventory-empty">No hay cuentas por cobrar.</div> : filteredCustomers.map((item) => <div className="balance-row" key={item.customerId}><div className="contact-avatar">{item.customerName.slice(0, 1).toUpperCase()}</div><div><b>{item.customerName}</b><small>{item.sales} venta(s) · Total ${item.total.toFixed(2)} · Pagado ${item.paid.toFixed(2)}</small></div><strong>${item.balance.toFixed(2)}</strong></div>)}</div><aside className="receivables-panel receivables-alert"><div className="eyebrow">Pendientes</div><h2>Ventas por cobrar</h2>{pendingSales.length === 0 ? <div className="inventory-empty">No hay pagos pendientes.</div> : pendingSales.map((sale) => <div className="due-sale" key={sale.id}><div><b>{sale.customerName || 'Cliente'}</b><small>{sale.saleNumber || sale.id} · Total ${sale.total.toFixed(2)}</small></div><strong>${sale.balanceDue.toFixed(2)}</strong><button onClick={() => { setForm({ saleId: sale.id, amount: String(sale.balanceDue), paymentMethod: 'cash', notes: '' }); setShowPayment(true); }}>Cobrar</button></div>)}</aside></div>{showPayment && <div className="modal-backdrop" onClick={() => setShowPayment(false)}><div className="catalog-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowPayment(false)}>×</button><div className="eyebrow">Registrar pago</div><h2>Abona a una cuenta.</h2><form onSubmit={pay}><label>Venta pendiente<select required value={form.saleId} onChange={(event) => setForm({ ...form, saleId: event.target.value })}><option value="">Selecciona una venta</option>{pendingSales.map((sale) => <option key={sale.id} value={sale.id}>{sale.customerName || 'Cliente'} · saldo ${sale.balanceDue.toFixed(2)}</option>)}</select></label><label>Monto recibido<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label><label>Método de pago<select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option></select></label><label>Notas<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Opcional" /></label><button className="button auth-submit" disabled={saving}>{saving ? 'Guardando...' : 'Registrar pago ↗'}</button></form></div></div>}</section></main>;
}

export default function ReceivablesPage() { return <TenantProvider><ReceivablesContent /></TenantProvider>; }
