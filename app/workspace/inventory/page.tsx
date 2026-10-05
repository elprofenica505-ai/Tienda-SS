'use client';

import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar';
import { EmptyState } from '@/components/workspace/EmptyState';

import { useCallback, FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/components/tenant/TenantProvider';
import { getClientCached, invalidateClientCache } from '@/lib/client-query-cache';
import { printElement } from '@/lib/print';

type Product = { id: string; name: string; sku?: string; imageUrl?: string | null; itemType: string; stock: number; reserved: number; available: number; minStock: number; price: number; categoryId?: string; categoryName?: string };
type Category = { id: string; name: string; active: boolean };
type Movement = { id: string; productId: string; productName: string; productSku?: string; type: string; quantity: number; delta: number; reason: string; performedByName: string; performedByEmail?: string; createdAt?: string };

type MovementForm = { productId: string; movementType: 'receive' | 'remove' | 'set'; quantity: string; reason: string };
type InventoryResponse = { products?: Product[]; lowStock?: Product[]; movements?: Movement[]; summary?: { products: number; totalUnits: number; lowStock: number }; productsPage?: { nextCursor?: string | null } };
type CatalogResponse = { categories?: Category[] };

function InventoryContent() {
  const router = useRouter();
  const { authUser, tenant, member, activeBranchId, loading: tenantLoading } = useTenant();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [summary, setSummary] = useState({ products: 0, totalUnits: 0, lowStock: 0 });
  const [loading, setLoading] = useState(true);
  const [productsOpen, setProductsOpen] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showMovement, setShowMovement] = useState(false);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [productPage, setProductPage] = useState(0);
  const [fichaIndex, setFichaIndex] = useState(0);
  const [showFicha, setShowFicha] = useState(false);
  const [form, setForm] = useState<MovementForm>({ productId: '', movementType: 'receive', quantity: '', reason: '' });

  const pageSize = 25;

  const loadInventory = useCallback(async (includeProducts = true, cursor?: string) => {
    if (!authUser || !tenant) return;
    if (cursor) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (includeProducts) params.set('products', 'true');
      if (cursor) params.set('cursor', cursor);
      const queryStr = params.toString();
      const cachePrefix = `inventory:${authUser.id}:${tenant.id}:${activeBranchId || 'all'}:`;
      const cacheKey = `${cachePrefix}${includeProducts ? 'products' : 'summary'}:${cursor || 'first'}`;
      const data = await getClientCached<InventoryResponse>(cacheKey, async () => {
        const response = await fetch(`/api/inventory${queryStr ? `?${queryStr}` : ''}`, { headers: { Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id, ...(activeBranchId ? { 'x-branch-id': activeBranchId } : {}) }, cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'No se pudo cargar el inventario.');
        return payload as InventoryResponse;
      }, includeProducts ? 15_000 : 10_000);
      if (cursor) setProducts((current) => [...current, ...(data.products || [])]);
      else setProducts(data.products || []);
      setLowStock((current) => cursor ? [...current, ...(data.lowStock || [])] : (data.lowStock || []));
      setSummary(data.summary || { products: 0, totalUnits: 0, lowStock: 0 });
      setNextCursor(data.productsPage?.nextCursor || null);
      setMovements(data.movements || []);

      // Cargar categorías para filtros Todos / categoría
      const catCacheKey = `catalog:${authUser.id}:${tenant.id}:categories`;
      const catalog = await getClientCached<CatalogResponse>(catCacheKey, async () => {
        const response = await fetch('/api/catalog?pageSize=100', { headers: { Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id, ...(activeBranchId ? { 'x-branch-id': activeBranchId } : {}) }, cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'No se pudo cargar categorías.');
        return payload as CatalogResponse;
      }, 60_000);
      setCategories((catalog.categories || []).filter((c) => c.active !== false));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Error cargando inventario.'); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [authUser, tenant, activeBranchId]);

  async function openProducts() {
    setProductsOpen(true);
    if (products.length === 0) await loadInventory(true);
  }

  async function loadMoreProducts() {
    if (nextCursor) await loadInventory(true, nextCursor);
  }

  useEffect(() => { void loadInventory(true); }, [loadInventory]);

  useEffect(() => { setProductPage(0); setFichaIndex(0); }, [query, categoryFilter]);

  const filtered = useMemo(() => {
    return products.filter((item) => {
      const matchesQuery = `${item.name} ${item.sku || ''}`.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = !categoryFilter || item.categoryId === categoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [products, query, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = productPage * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, productPage]);

  const currentFicha = filtered[fichaIndex] || null;

  function nextFicha() {
    setFichaIndex((idx) => Math.min(filtered.length - 1, idx + 1));
  }
  function prevFicha() {
    setFichaIndex((idx) => Math.max(0, idx - 1));
  }

  async function submitMovement(event: FormEvent) {
    event.preventDefault();
    if (!authUser || !tenant) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id, ...(activeBranchId ? { 'x-branch-id': activeBranchId } : {}) }, body: JSON.stringify({ ...form, quantity: Number(form.quantity) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo registrar el movimiento.');
      invalidateClientCache(`inventory:${authUser.id}:${tenant.id}:${activeBranchId || 'all'}:`);
      invalidateClientCache(`catalog:${authUser.id}:${tenant.id}:`);
      setMessage(`Inventario actualizado: ${data.next} unidades.`); setShowMovement(false); setForm({ productId: '', movementType: 'receive', quantity: '', reason: '' }); await loadInventory(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Error registrando movimiento.'); }
    finally { setSaving(false); }
  }

  if (tenantLoading || loading) return <div className="workspace-loading">Cargando movimientos recientes de {tenant?.name || 'tu empresa'}...</div>;
  if (!authUser || !tenant || !member) { router.replace('/'); return null; }

  return (
    <main className="workspace-page">
      <WorkspaceSidebar />
      <section className="workspace-main inventory-main">
        <header className="inventory-header">
          <div><button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button><div className="eyebrow catalog-eyebrow">Tu espacio / Inventario</div><h1>Control de stock</h1><p>Movimientos y existencias de <strong>{tenant.name}</strong> · Fichas visuales con navegación anterior/siguiente · Hasta 25 productos por página.</p></div>
          <button className="button" onClick={() => { void openProducts(); setShowMovement(true); }}>+ Registrar movimiento</button>
        </header>
        {message && <div className="catalog-message">{message}</div>}
        <div className="inventory-metrics"><div><small>Productos activos</small><strong>{summary.products}</strong><span>en tu catálogo</span></div><div><small>Unidades en stock</small><strong>{summary.totalUnits}</strong><span>unidades físicas</span></div><div className={summary.lowStock ? 'metric-alert' : ''}><small>Stock bajo</small><strong>{summary.lowStock}</strong><span>{summary.lowStock ? 'requieren atención' : 'todo en orden'}</span></div></div>
        <section className="inventory-chart-panel"><div className="inventory-panel-header"><div><div className="eyebrow">Lectura rápida</div><h2>Salud del inventario</h2></div></div><div className="inventory-chart"><div><span>Unidades disponibles</span><strong>{summary.totalUnits}</strong><i style={{ width: `${Math.min(100, Math.max(4, summary.totalUnits ? 100 : 4))}%` }} /></div><div><span>Productos con stock bajo</span><strong>{summary.lowStock}</strong><i className="chart-alert" style={{ width: `${Math.min(100, summary.products ? (summary.lowStock / summary.products) * 100 : 0)}%` }} /></div></div></section>

        {summary.products === 0 ? <EmptyState icon="▦" title="Tu inventario está listo para comenzar" description="Agrega tu primer producto para controlar existencias, mínimos y movimientos de tu empresa." actionLabel="Abrir catálogo" onAction={() => router.push('/workspace/catalog')} /> : (
          <section className={`inventory-products-disclosure ${productsOpen ? 'is-open' : ''}`}>
            <button className="inventory-products-toggle" onClick={() => setProductsOpen((open) => !open)}><span><b>Productos y stock</b><small>{productsOpen ? `Lectura activa · página de ${pageSize} productos · Filtros Todos y categoría` : 'Abrir productos'}</small></span><strong>{productsOpen ? '⌃' : '⌄'}</strong></button>
            {productsOpen && (
              <div className="inventory-layout">
                <div className="inventory-panel">
                  <div className="inventory-panel-header">
                    <div><div className="eyebrow">Existencias</div><h2>Productos</h2><p>Fichas visuales con navegación anterior/siguiente · Hasta 25 por página</p></div>
                    <div className="inventory-controls">
                      <input className="inventory-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto o SKU" />
                      <div className="catalog-filter-row">
                        <button className={`catalog-filter ${!categoryFilter ? 'selected' : ''}`} type="button" onClick={() => setCategoryFilter('')}>Todos</button>
                        {categories.map((cat) => <button key={cat.id} className={`catalog-filter ${categoryFilter === cat.id ? 'selected' : ''}`} type="button" onClick={() => setCategoryFilter(cat.id)}>{cat.name}</button>)}
                      </div>
                    </div>
                  </div>

                  {/* Ficha visual destacada */}
                  {filtered.length > 0 && (
                    <div className="product-visual-card">
                      <div className="product-visual-header">
                        <div><div className="eyebrow">Ficha visual</div><h3>{currentFicha?.name || 'Selecciona un producto'}</h3><small>{currentFicha ? `${currentFicha.sku || 'Sin SKU'} · ${categories.find((c) => c.id === currentFicha.categoryId)?.name || 'Sin categoría'}` : ''}</small></div>
                        <div className="product-visual-nav">
                          <button className="button button-secondary" type="button" onClick={prevFicha} disabled={fichaIndex === 0}>← Anterior</button>
                          <span>{filtered.length ? `${fichaIndex + 1} / ${filtered.length}` : '0 / 0'}</span>
                          <button className="button button-secondary" type="button" onClick={nextFicha} disabled={fichaIndex >= filtered.length - 1}>Siguiente →</button>
                        </div>
                      </div>
                      {currentFicha && (
                        <div className="product-visual-body">
                          <div className="product-visual-image">{currentFicha.imageUrl ? <img src={currentFicha.imageUrl} alt="" /> : <span className="inventory-product-placeholder">◇</span>}</div>
                          <div className="product-visual-facts">
                            <div><small>Producto</small><b>{currentFicha.name}</b></div>
                            <div><small>SKU</small><b>{currentFicha.sku || '—'}</b></div>
                            <div><small>Precio</small><b>{currentFicha.price}</b></div>
                            <div><small>Físico</small><b>{currentFicha.itemType === 'service' ? '—' : currentFicha.stock}</b></div>
                            <div><small>Reservado</small><b>{currentFicha.itemType === 'service' ? '—' : currentFicha.reserved}</b></div>
                            <div><small>Disponible</small><b>{currentFicha.itemType === 'service' ? '—' : currentFicha.available}</b></div>
                            <div><small>Estado</small><b className={currentFicha.itemType !== 'service' && Number(currentFicha.available) <= Number(currentFicha.minStock) ? 'status-low' : 'status-ok'}>{currentFicha.itemType === 'service' ? 'Servicio' : Number(currentFicha.available) <= Number(currentFicha.minStock) ? 'Stock bajo' : 'Saludable'}</b></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="inventory-table">
                    <div className="inventory-row inventory-row-head"><span>Producto</span><span>SKU</span><span>Físico</span><span>Reservado</span><span>Disponible</span><span>Estado</span></div>
                    {paginated.length === 0 ? <EmptyState icon="◇" title="No hay productos para mostrar" description="Crea un producto desde el catálogo y luego vuelve aquí para registrar movimientos." actionLabel="Ir al catálogo" onAction={() => router.push('/workspace/catalog')} /> : paginated.map((item, idx) => {
                      const globalIdx = productPage * pageSize + idx;
                      const low = item.itemType !== 'service' && Number(item.available) <= Number(item.minStock);
                      const selected = globalIdx === fichaIndex;
                      return (
                        <div className={`inventory-row ${selected ? 'selected' : ''}`} key={item.id} role="button" tabIndex={0} onClick={() => { setFichaIndex(globalIdx); setShowFicha(true); }} onKeyDown={(e) => { if (e.key === 'Enter') { setFichaIndex(globalIdx); } }}>
                          <span className="inventory-product-cell">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span className="inventory-product-placeholder">◇</span>}<span><b>{item.name}</b><small>{item.itemType === 'service' ? 'Servicio' : 'Producto físico'}</small></span></span>
                          <span>{item.sku || '—'}</span>
                          <strong>{item.itemType === 'service' ? '—' : item.stock}</strong>
                          <span>{item.itemType === 'service' ? '—' : item.reserved}</span>
                          <strong>{item.itemType === 'service' ? '—' : item.available}</strong>
                          <em className={low ? 'status-low' : 'status-ok'}>{item.itemType === 'service' ? 'No aplica' : low ? 'Stock bajo' : 'Saludable'}</em>
                        </div>
                      );
                    })}
                  </div>
                  <div className="catalog-pagination">
                    <button className="button button-secondary" disabled={productPage === 0} onClick={() => setProductPage((p) => Math.max(0, p - 1))}>← Anterior</button>
                    <span className="pagination-label">Página {productPage + 1} de {totalPages} · {filtered.length} productos · 25 por página</span>
                    <button className="button button-secondary" disabled={productPage + 1 >= totalPages} onClick={() => setProductPage((p) => p + 1)}>Siguiente →</button>
                  </div>
                  {nextCursor && <button className="load-more-button" onClick={() => void loadMoreProducts()} disabled={loadingMore}>{loadingMore ? 'Cargando...' : 'Cargar 25 productos más'}</button>}
                </div>
                <aside className="inventory-alerts">
                  <div className="inventory-panel-header"><div><div className="eyebrow">Atención</div><h2>Stock bajo</h2></div><span className="alert-count">{lowStock.length}</span></div>
                  {lowStock.length === 0 ? <div className="alert-empty">No hay productos por debajo del mínimo.</div> : lowStock.map((item) => <div className="alert-item" key={item.id}><span>!</span><div><b>{item.name}</b><small>{item.available} disponibles · {item.reserved} reservadas · mínimo {item.minStock}</small></div><button onClick={() => { setForm({ productId: item.id, movementType: 'receive', quantity: '', reason: 'Reposición de stock' }); setShowMovement(true); }}>Reponer</button></div>)}
                </aside>
              </div>
            )}
          </section>
        )}

        <div className="inventory-panel movements-panel">
          <div className="inventory-panel-header"><div><div className="eyebrow">Historial</div><h2>Últimos movimientos</h2></div></div>
          {movements.length === 0 ? <EmptyState icon="↗" title="Aún no hay movimientos" description="Cuando recibas, ajustes o retires existencias, aparecerán aquí." actionLabel="Configurar productos" onAction={() => router.push('/workspace/catalog')} /> : movements.slice(0, 8).map((movement) => <div className="movement-row" key={movement.id}><span className={`movement-icon ${movement.delta >= 0 ? 'in' : 'out'}`}>{movement.delta >= 0 ? '↑' : '↓'}</span><div><b>{movement.productName || 'Producto archivado'}</b><small>{movement.productSku ? `SKU ${movement.productSku} · ` : ''}{movement.reason} · {movement.type}</small><small>Responsable: {movement.performedByName || 'Sistema'}{movement.performedByEmail ? ` · ${movement.performedByEmail}` : ''}</small></div><strong className={movement.delta >= 0 ? 'movement-in' : 'movement-out'}>{movement.delta >= 0 ? '+' : ''}{movement.delta}</strong></div>)}
        </div>

        {showMovement && <div className="modal-backdrop" onClick={() => setShowMovement(false)}><div className="catalog-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowMovement(false)}>×</button><div className="eyebrow">Movimiento de inventario</div><h2>Actualiza existencias.</h2><form onSubmit={submitMovement}><label>Producto<select required value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })}><option value="">Selecciona un producto</option>{products.filter((item) => item.itemType !== 'service').map((item) => <option key={item.id} value={item.id}>{item.name} · {item.available} disponibles</option>)}</select></label><label>Tipo de movimiento<select value={form.movementType} onChange={(event) => setForm({ ...form, movementType: event.target.value as any })}><option value="receive">Entrada / recepción</option><option value="remove">Salida / ajuste</option><option value="set">Establecer cantidad exacta</option></select></label><label>Cantidad<input type="number" min="0.01" step="1" required value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></label><label>Motivo<input required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Ej. Compra a proveedor" /></label><button className="button auth-submit" disabled={saving}>{saving ? 'Guardando...' : 'Registrar movimiento ↗'}</button></form></div></div>}
      </section>
    </main>
  );
}

export default function InventoryPage() {
  return <InventoryContent />;
}
