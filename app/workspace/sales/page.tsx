'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TenantProvider, useTenant } from '@/components/tenant/TenantProvider';

type Product = { id: string; name: string; sku?: string; itemType: string; stock: number; price: number; categoryId?: string };
type Customer = { id: string; name: string; email?: string; phone?: string; active: boolean };
type CartLine = Product & { quantity: number };
type Sale = { id: string; saleNumber?: string; total: number; paymentMethod: string; customerName?: string; customerId?: string; createdAt?: unknown };

function SalesContent() {
  const router = useRouter();
  const { authUser, tenant, member, loading: tenantLoading } = useTenant();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [customerId, setCustomerId] = useState('');
  const [discount, setDiscount] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    if (!authUser || !tenant) return;
    setLoading(true);
    try {
      const token = await authUser.getIdToken();
      const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': tenant.id };
      const [catalogResponse, salesResponse, customersResponse] = await Promise.all([
        fetch('/api/catalog', { headers, cache: 'no-store' }),
        fetch('/api/sales', { headers, cache: 'no-store' }),
        fetch('/api/contacts?type=customer', { headers, cache: 'no-store' })
      ]);
      const catalog = await catalogResponse.json(); const salesData = await salesResponse.json(); const customersData = await customersResponse.json();
      if (!catalogResponse.ok) throw new Error(catalog.error || 'No se pudo cargar el catálogo.');
      if (!salesResponse.ok) throw new Error(salesData.error || 'No se pudo cargar ventas.');
      if (!customersResponse.ok) throw new Error(customersData.error || 'No se pudieron cargar clientes.');
      setProducts(catalog.products || []); setSales(salesData.sales || []); setCustomers(customersData.contacts || []);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo cargar el punto de venta.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [authUser, tenant]);

  const filtered = products.filter((item) => `${item.name} ${item.sku || ''}`.toLowerCase().includes(query.toLowerCase()));
  const filteredCustomers = customers.filter((item) => `${item.name} ${item.email || ''} ${item.phone || ''}`.toLowerCase().includes(customerQuery.toLowerCase()));
  const selectedCustomer = customers.find((item) => item.id === customerId);
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0), [cart]);
  const total = Math.max(0, subtotal - Math.max(0, Number(discount || 0)));
  function add(product: Product) { setCart((current) => { const found = current.find((item) => item.id === product.id); if (found) return current.map((item) => item.id === product.id ? { ...item, quantity: Math.min(item.quantity + 1, product.itemType === 'service' ? 999 : product.stock) } : item); return [...current, { ...product, quantity: 1 }]; }); }
  function changeQuantity(id: string, delta: number) { setCart((current) => current.flatMap((item) => { if (item.id !== id) return [item]; const max = item.itemType === 'service' ? 999 : item.stock; const quantity = Math.min(max, item.quantity + delta); return quantity > 0 ? [{ ...item, quantity }] : []; })); }
  async function checkout() { if (!authUser || !tenant || !cart.length) return; setSaving(true); setMessage(''); try { const response = await fetch('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, body: JSON.stringify({ items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })), paymentMethod, customerId: customerId || null, discount: Number(discount || 0) }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo completar la venta.'); setMessage(`Venta ${data.saleId} registrada por $${Number(data.total).toFixed(2)}.`); setCart([]); setCustomerId(''); setCustomerQuery(''); setDiscount(''); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo completar la venta.'); } finally { setSaving(false); } }

  if (tenantLoading || loading) return <div className="workspace-loading">Cargando punto de venta...</div>;
  if (!authUser || !tenant || !member) { router.replace('/'); return null; }
  return <main className="workspace-page"><aside className="workspace-sidebar"><div className="onboarding-brand"><span className="brand-mark-icon">N</span><b>Nexo<span>Flow</span></b></div><div className="workspace-company"><span>{tenant.name.slice(0, 1).toUpperCase()}</span><div><b>{tenant.name}</b><small>Plan {tenant.plan || 'Starter'}</small></div></div><nav><a onClick={() => router.push('/workspace')}>▦ <span>Resumen</span></a><a onClick={() => router.push('/workspace/catalog')}>◇ <span>Catálogo</span></a><a onClick={() => router.push('/workspace/inventory')}>▤ <span>Inventario</span></a><a className="active">◈ <span>Ventas / POS</span></a><a onClick={() => router.push('/workspace/contacts')}>○ <span>Contactos</span></a></nav></aside><section className="workspace-main sales-main"><header className="sales-header"><div><button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button><div className="eyebrow catalog-eyebrow">Tu espacio / Ventas</div><h1>Punto de venta</h1><p>Registra ventas y descuenta el inventario de <strong>{tenant.name}</strong>.</p></div><span className="catalog-isolation">● Venta transaccional</span></header>{message && <div className="catalog-message">{message}</div>}<div className="sales-layout"><div className="sales-products"><div className="sales-toolbar"><div><div className="eyebrow">Catálogo disponible</div><h2>Selecciona productos</h2></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre o SKU" /></div><div className="sales-product-grid">{filtered.length === 0 ? <div className="catalog-empty"><div className="empty-spark">◇</div><h2>No hay productos disponibles</h2><p>Agrega productos en el catálogo antes de registrar una venta.</p><button className="button" onClick={() => router.push('/workspace/catalog')}>Ir al catálogo ↗</button></div> : filtered.map((product) => <button className="sales-product" key={product.id} onClick={() => add(product)} disabled={product.itemType !== 'service' && product.stock <= 0}><span className="sales-product-icon">◇</span><b>{product.name}</b><small>{product.sku || 'Sin SKU'} · {product.itemType === 'service' ? 'Servicio' : `${product.stock} disponibles`}</small><strong>${Number(product.price || 0).toFixed(2)}</strong></button>)}</div></div><aside className="sale-ticket"><div className="ticket-head"><div><div className="eyebrow">Nueva venta</div><h2>Ticket</h2></div><span>{cart.length} ítems</span></div><div className="ticket-lines">{cart.length === 0 ? <div className="ticket-empty"><span>+</span><p>Selecciona productos<br />para iniciar la venta</p></div> : cart.map((item) => <div className="ticket-line" key={item.id}><div><b>{item.name}</b><small>${Number(item.price).toFixed(2)} c/u</small></div><div className="quantity-control"><button onClick={() => changeQuantity(item.id, -1)}>−</button><span>{item.quantity}</span><button onClick={() => changeQuantity(item.id, 1)}>+</button></div><strong>${(Number(item.price) * item.quantity).toFixed(2)}</strong></div>)}</div><div className="ticket-form"><label>Cliente guardado {paymentMethod === 'credit' && <small className="required-note">(obligatorio para crédito)</small>}<select required={paymentMethod === 'credit'} value={customerId} onChange={(event) => { setCustomerId(event.target.value); setCustomerQuery(''); }}><option value="">{paymentMethod === 'credit' ? 'Selecciona un cliente' : 'Venta mostrador'}</option>{filteredCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}</select></label><input className="customer-search" value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="Filtrar clientes guardados" />{selectedCustomer && <div className="selected-customer">Cliente seleccionado: <strong>{selectedCustomer.name}</strong></div>}<div className="payment-label">Método de pago</div><div className="payment-options">{[['cash','Efectivo'],['card','Tarjeta'],['transfer','Transferencia'],['credit','Crédito']].map(([value, label]) => <button key={value} className={paymentMethod === value ? 'selected' : ''} onClick={() => setPaymentMethod(value)}>{label}</button>)}</div><label>Descuento<input type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} placeholder="0.00" /></label></div><div className="ticket-total"><div><span>Subtotal</span><strong>${subtotal.toFixed(2)}</strong></div><div><span>Descuento</span><strong>-${Math.max(0, Number(discount || 0)).toFixed(2)}</strong></div><div className="total-line"><span>Total</span><strong>${total.toFixed(2)}</strong></div></div><button className="button button-large checkout-button" onClick={checkout} disabled={saving || !cart.length || (paymentMethod === 'credit' && !customerId)}>{saving ? 'Procesando...' : 'Cobrar venta ↗'}</button></aside></div><div className="recent-sales"><div className="inventory-panel-header"><div><div className="eyebrow">Historial</div><h2>Ventas recientes</h2></div></div>{sales.length === 0 ? <div className="inventory-empty">Las ventas registradas aparecerán aquí.</div> : sales.slice(0, 6).map((sale) => <div className="recent-sale" key={sale.id}><span className="sale-status">✓</span><div><b>{sale.saleNumber || sale.id}</b><small>{sale.customerName || 'Venta mostrador'} · {sale.paymentMethod}</small></div><strong>${Number(sale.total || 0).toFixed(2)}</strong></div>)}</div></section></main>;
}

export default function SalesPage() { return <TenantProvider><SalesContent /></TenantProvider>; }
