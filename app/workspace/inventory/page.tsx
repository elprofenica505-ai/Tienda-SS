'use client';

import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar';

import { useCallback, FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TenantProvider, useTenant } from '@/components/tenant/TenantProvider';

type Product = { id: string; name: string; sku?: string; itemType: string; stock: number; minStock: number; price: number };
type Movement = { id: string; productId: string; type: string; quantity: number; delta: number; reason: string; createdAt?: { _seconds?: number } };

type MovementForm = { productId: string; movementType: 'receive' | 'remove' | 'set'; quantity: string; reason: string };

function InventoryContent() {
  const router = useRouter();
  const { authUser, tenant, member, loading: tenantLoading } = useTenant();
  const [products, setProducts] = useState<Product[]>([]);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [summary, setSummary] = useState({ products: 0, totalUnits: 0, lowStock: 0 });
  const [loading, setLoading] = useState(true);
  const [productsOpen, setProductsOpen] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showMovement, setShowMovement] = useState(false);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<MovementForm>({ productId: '', movementType: 'receive', quantity: '', reason: '' });

  const loadInventory = useCallback(async (includeProducts = false, cursor?: string) => {
    if (!authUser || !tenant) return;
    if (includeProducts && cursor) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (includeProducts) params.set('products', 'true');
      if (cursor) params.set('cursor', cursor);
      const query = params.toString();
      const response = await fetch(`/api/inventory${query ? `?${query}` : ''}`, { headers: { Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar el inventario.');
      if (includeProducts && cursor) setProducts((current) => [...current, ...(data.products || [])]);
      else if (includeProducts) setProducts(data.products || []);
      if (includeProducts) {
        setLowStock((current) => cursor ? [...current, ...(data.lowStock || [])] : (data.lowStock || []));
        setSummary(data.summary || { products: 0, totalUnits: 0, lowStock: 0 });
        setNextCursor(data.productsPage?.nextCursor || null);
      }
      setMovements(data.movements || []);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Error cargando inventario.'); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [authUser, tenant]);

  async function openProducts() {
    setProductsOpen(true);
    if (!productsOpen && products.length === 0) await loadInventory(true);
  }

  async function loadMoreProducts() {
    if (nextCursor) await loadInventory(true, nextCursor);
  }

  useEffect(() => { void loadInventory(false); }, [loadInventory]);

  async function submitMovement(event: FormEvent) {
    event.preventDefault();
    if (!authUser || !tenant) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, body: JSON.stringify({ ...form, quantity: Number(form.quantity) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo registrar el movimiento.');
      setMessage(`Inventario actualizado: ${data.next} unidades.`); setShowMovement(false); setForm({ productId: '', movementType: 'receive', quantity: '', reason: '' }); await loadInventory(productsOpen);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Error registrando movimiento.'); }
    finally { setSaving(false); }
  }

  if (tenantLoading || loading) return <div className="workspace-loading">Cargando movimientos recientes de {tenant?.name || 'tu empresa'}...</div>;
  if (!authUser || !tenant || !member) { router.replace('/'); return null; }
  const filtered = products.filter((item) => `${item.name} ${item.sku || ''}`.toLowerCase().includes(query.toLowerCase()));

  return <main className="workspace-page"><WorkspaceSidebar /><section className="workspace-main inventory-main"><header className="inventory-header"><div><button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button><div className="eyebrow catalog-eyebrow">Tu espacio / Inventario</div><h1>Control de stock</h1><p>Movimientos y existencias de <strong>{tenant.name}</strong>.</p></div><button className="button" onClick={() => { void openProducts(); setShowMovement(true); }}>+ Registrar movimiento</button></header>{message && <div className="catalog-message">{message}</div>}<div className="inventory-metrics"><div><small>Productos activos</small><strong>{summary.products}</strong><span>en tu catálogo</span></div><div><small>Unidades en stock</small><strong>{summary.totalUnits}</strong><span>unidades físicas</span></div><div className={summary.lowStock ? 'metric-alert' : ''}><small>Stock bajo</small><strong>{summary.lowStock}</strong><span>{summary.lowStock ? 'requieren atención' : 'todo en orden'}</span></div></div><section className={`inventory-products-disclosure ${productsOpen ? 'is-open' : ''}`}><button className="inventory-products-toggle" onClick={() => { if (productsOpen) setProductsOpen(false); else void openProducts(); }}><span><b>Productos y stock</b><small>{productsOpen ? 'Lectura activa · página de 25 productos' : 'Abrir solo cuando necesites consultar existencias'}</small></span><strong>{productsOpen ? '⌃' : '⌄'}</strong></button>{productsOpen && <div className="inventory-layout"><div className="inventory-panel"><div className="inventory-panel-header"><div><div className="eyebrow">Existencias</div><h2>Productos</h2></div><input className="inventory-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto o SKU" /></div><div className="inventory-table"><div className="inventory-row inventory-row-head"><span>Producto</span><span>SKU</span><span>Stock actual</span><span>Mínimo</span><span>Estado</span></div>{filtered.length === 0 ? <div className="inventory-empty">No hay productos para mostrar.</div> : filtered.map((item) => { const low = item.itemType !== 'service' && Number(item.stock) <= Number(item.minStock); return <div className="inventory-row" key={item.id}><span><b>{item.name}</b><small>{item.itemType === 'service' ? 'Servicio' : 'Producto físico'}</small></span><span>{item.sku || '—'}</span><strong>{item.itemType === 'service' ? '—' : item.stock}</strong><span>{item.itemType === 'service' ? '—' : item.minStock}</span><em className={low ? 'status-low' : 'status-ok'}>{item.itemType === 'service' ? 'No aplica' : low ? 'Stock bajo' : 'Saludable'}</em></div>; })}</div>{nextCursor && <button className="load-more-button" onClick={() => void loadMoreProducts()} disabled={loadingMore}>{loadingMore ? 'Cargando...' : 'Cargar 25 productos más'}</button>}</div><aside className="inventory-alerts"><div className="inventory-panel-header"><div><div className="eyebrow">Atención</div><h2>Stock bajo</h2></div><span className="alert-count">{lowStock.length}</span></div>{lowStock.length === 0 ? <div className="alert-empty">No hay productos por debajo del mínimo.</div> : lowStock.map((item) => <div className="alert-item" key={item.id}><span>!</span><div><b>{item.name}</b><small>{item.stock} disponibles · mínimo {item.minStock}</small></div><button onClick={() => { setForm({ productId: item.id, movementType: 'receive', quantity: '', reason: 'Reposición de stock' }); setShowMovement(true); }}>Reponer</button></div>)}</aside></div>}</section><div className="inventory-panel movements-panel"><div className="inventory-panel-header"><div><div className="eyebrow">Historial</div><h2>Últimos movimientos</h2></div></div>{movements.length === 0 ? <div className="inventory-empty">Los movimientos de inventario aparecerán aquí.</div> : movements.slice(0, 8).map((movement) => <div className="movement-row" key={movement.id}><span className={`movement-icon ${movement.delta >= 0 ? 'in' : 'out'}`}>{movement.delta >= 0 ? '↑' : '↓'}</span><div><b>{products.find((product) => product.id === movement.productId)?.name || 'Producto'}</b><small>{movement.reason} · {movement.type}</small></div><strong className={movement.delta >= 0 ? 'movement-in' : 'movement-out'}>{movement.delta >= 0 ? '+' : ''}{movement.delta}</strong></div>)}</div>{showMovement && <div className="modal-backdrop" onClick={() => setShowMovement(false)}><div className="catalog-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowMovement(false)}>×</button><div className="eyebrow">Movimiento de inventario</div><h2>Actualiza existencias.</h2><form onSubmit={submitMovement}><label>Producto<select required value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })}><option value="">Selecciona un producto</option>{products.filter((item) => item.itemType !== 'service').map((item) => <option key={item.id} value={item.id}>{item.name} · {item.stock} disponibles</option>)}</select></label><label>Tipo de movimiento<select value={form.movementType} onChange={(event) => setForm({ ...form, movementType: event.target.value as MovementForm['movementType'] })}><option value="receive">Entrada / recepción</option><option value="remove">Salida / ajuste</option><option value="set">Establecer cantidad exacta</option></select></label><label>Cantidad<input type="number" min="0.01" step="1" required value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></label><label>Motivo<input required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Ej. Compra a proveedor" /></label><button className="button auth-submit" disabled={saving}>{saving ? 'Guardando...' : 'Registrar movimiento ↗'}</button></form></div></div>}</section></main>;
}

export default function InventoryPage() { return <TenantProvider><InventoryContent /></TenantProvider>; }
