'use client';

import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar';

import { useCallback, FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/components/tenant/TenantProvider';
import { UpgradePrompt } from '@/components/workspace/UpgradePrompt';
import { formatMoney } from '@/lib/currency';
import { getClientCached, invalidateClientCache } from '@/lib/client-query-cache';
import { BarcodeScanner } from '@/components/workspace/BarcodeScanner';
import { ean13Svg, generateProductBarcode } from '@/lib/barcodes';

type Category = { id: string; name: string; color?: string; active: boolean };
type Product = { id: string; name: string; sku?: string; barcode?: string; imageUrl?: string | null; itemType: string; categoryId?: string; price: number; cost?: number; stock: number; active: boolean };
type Editing = { type: 'category' | 'product'; id: string; name: string; sku: string; price: string; cost: string; stock: string; categoryId: string; active: boolean };
type CatalogResponse = { categories?: Category[]; products?: Product[]; pagination?: { nextCursor?: string | null } };

function CatalogContent() {
  const router = useRouter();
  const { authUser, tenant, member, loading: tenantLoading } = useTenant();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'products' | 'categories'>('products');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [product, setProduct] = useState({ name: '', sku: '', barcode: '', imageDataUrl: '', price: '', stock: '', categoryId: '', itemType: 'physical' });
  const [scannerOpen, setScannerOpen] = useState(false);

  const loadCatalog = useCallback(async (cursor = '', append = false) => {
    if (!authUser || !tenant) return;
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (showArchived) params.set('includeArchived', 'true');
      if (cursor) params.set('cursor', cursor);
      const cursorKey = cursor || 'first';
      const cachePrefix = `catalog:${authUser.id}:${tenant.id}:`;
      const data = await getClientCached<CatalogResponse>(`${cachePrefix}${showArchived ? 'archived' : 'active'}:${cursorKey}`, async () => {
        const response = await fetch(`/api/catalog${params.toString() ? `?${params.toString()}` : ''}`, { headers: { Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'No se pudo cargar el catálogo.');
        return payload as CatalogResponse;
      }, 60_000);
      setCategories(data.categories || []); setProducts((current) => append ? [...current, ...(data.products || [])] : (data.products || []));
      setNextCursor(data.pagination?.nextCursor || null);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Error cargando el catálogo.'); }
    finally { if (append) setLoadingMore(false); else setLoading(false); }
  }, [authUser, tenant, showArchived]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  async function saveMutation(body: Record<string, unknown>, success: string) {
    if (!authUser || !tenant) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/catalog', { method: body.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar el cambio.');
      invalidateClientCache(`catalog:${authUser.id}:${tenant.id}:`);
      invalidateClientCache(`inventory:${authUser.id}:${tenant.id}:`);
      setMessage(success); setShowForm(false); setEditing(null); await loadCatalog();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar el cambio.'); }
    finally { setSaving(false); }
  }

  function createCategory(event: FormEvent) { event.preventDefault(); void saveMutation({ type: 'category', name: categoryName }, 'Categoría creada.').then(() => setCategoryName('')); }
  function createProduct(event: FormEvent) { event.preventDefault(); void saveMutation({ type: 'product', ...product, price: Number(product.price || 0), stock: Number(product.stock || 0) }, 'Producto creado.').then(() => setProduct({ name: '', sku: '', barcode: '', imageDataUrl: '', price: '', stock: '', categoryId: '', itemType: 'physical' })); }
  const handleBarcodeDetected = useCallback((value: string) => setProduct((current) => ({ ...current, barcode: value, sku: current.sku || value })), []);
  function handleProductImage(file: File | undefined) { if (!file) return; if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setMessage('La foto debe ser JPG, PNG o WebP.'); return; } if (file.size > 2 * 1024 * 1024) { setMessage('La foto no debe superar 2 MB.'); return; } const reader = new FileReader(); reader.onload = () => setProduct((current) => ({ ...current, imageDataUrl: typeof reader.result === 'string' ? reader.result : '' })); reader.readAsDataURL(file); }
  function startEditCategory(item: Category) { setEditing({ type: 'category', id: item.id, name: item.name, sku: '', price: '', cost: '', stock: '', categoryId: '', active: item.active }); setShowForm(false); }
  function startEditProduct(item: Product) { setEditing({ type: 'product', id: item.id, name: item.name, sku: item.sku || '', price: String(item.price || 0), cost: String((item as Product & { cost?: number }).cost || 0), stock: String(item.stock || 0), categoryId: item.categoryId || '', active: item.active }); setShowForm(false); }
  function printProductLabel(item: Product) { const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char)); const code = item.barcode || item.sku || ''; const popup = window.open('', '_blank', 'width=420,height=320'); if (!popup) { setMessage('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para imprimir.'); return; } popup.document.write(`<!doctype html><html><head><title>Etiqueta ${escape(item.name)}</title><style>body{font-family:Arial,sans-serif;text-align:center;margin:20px}.label{border:1px dashed #777;padding:16px;width:280px;margin:auto}.label strong{display:block;font-size:16px;margin-bottom:10px}.label svg{display:block;height:80px;margin:auto;width:100%}.label span{display:block;letter-spacing:2px;margin-top:5px}.label b{display:block;font-size:16px;margin-top:7px}.text-only{display:grid;gap:10px}</style></head><body><div class="label">${ean13Svg(code, escape(item.name), escape(money(Number(item.price || 0))))}</div><script>window.onload=()=>window.print()<\/script></body></html>`); popup.document.close(); }
  function archiveOrRestore(type: 'category' | 'product', item: Category | Product) { void saveMutation({ type, id: item.id, active: !item.active }, item.active ? `${type === 'product' ? 'Producto' : 'Categoría'} archivado.` : `${type === 'product' ? 'Producto' : 'Categoría'} reactivado.`); }

  if (tenantLoading || loading) return <div className="workspace-loading">Cargando catálogo de {tenant?.name || 'tu empresa'}...</div>;
  if (!authUser || !tenant || !member) { router.replace('/'); return null; }
  const money = (value: number) => formatMoney(value, tenant.currency, tenant.locale);

  const visibleProducts = products.filter((item) => showArchived || item.active);
  const visibleCategories = categories.filter((item) => showArchived || item.active);
  const editForm = editing && <div className="modal-backdrop" onClick={() => setEditing(null)}><div className="catalog-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setEditing(null)}>×</button><div className="eyebrow">Editar {editing.type === 'product' ? 'producto' : 'categoría'}</div><h2>Actualiza la información.</h2><form onSubmit={(event) => { event.preventDefault(); void saveMutation(editing.type === 'product' ? { type: 'product', id: editing.id, name: editing.name, price: Number(editing.price), cost: Number(editing.cost), stock: Number(editing.stock), categoryId: editing.categoryId } : { type: 'category', id: editing.id, name: editing.name }, 'Cambios guardados.'); }}>{<label>Nombre<input required value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>}{editing.type === 'product' && <><label>SKU<input value={editing.sku} disabled /></label><div className="form-two"><label>Precio<input type="number" min="0" step="0.01" value={editing.price} onChange={(event) => setEditing({ ...editing, price: event.target.value })} /></label><label>Costo unitario<input type="number" min="0" step="0.0001" value={editing.cost} onChange={(event) => setEditing({ ...editing, cost: event.target.value })} /></label><label>Stock<input type="number" min="0" step="1" value={editing.stock} onChange={(event) => setEditing({ ...editing, stock: event.target.value })} /></label></div><label>Categoría<select value={editing.categoryId} onChange={(event) => setEditing({ ...editing, categoryId: event.target.value })}><option value="">Sin categoría</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></>}<button className="button auth-submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios ↗'}</button></form></div></div>;

  return <main className="workspace-page"><WorkspaceSidebar /><section className="workspace-main catalog-main"><header className="catalog-header"><div><button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button><div className="eyebrow catalog-eyebrow">Tu espacio / Catálogo</div><h1>Catálogo</h1><p>Administra los productos y categorías de <strong>{tenant.name}</strong>.</p></div><button className="button" onClick={() => { setEditing(null); setShowForm(true); }}>+ {tab === 'products' ? 'Nuevo producto' : 'Nueva categoría'}</button></header><div className="catalog-toolbar"><div className="catalog-tabs"><button className={tab === 'products' ? 'selected' : ''} onClick={() => setTab('products')}>Productos <span>{visibleProducts.length}</span></button><button className={tab === 'categories' ? 'selected' : ''} onClick={() => setTab('categories')}>Categorías <span>{visibleCategories.length}</span></button></div><label className="archive-toggle"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Mostrar archivados</label><span className="catalog-isolation">● Datos privados de tu empresa</span></div><UpgradePrompt message={message} />{tab === 'products' ? <div className="catalog-grid">{visibleProducts.length === 0 ? <div className="catalog-empty"><div className="empty-spark">◇</div><h2>{showArchived ? 'No hay productos archivados' : 'Aún no hay productos'}</h2><p>Tu catálogo comienza vacío. Agrega el primer producto propio de {tenant.name}.</p><button className="button" onClick={() => setShowForm(true)}>Agregar producto ↗</button></div> : visibleProducts.map((item) => <article className={`product-card ${!item.active ? 'is-archived' : ''}`} key={item.id}>{item.imageUrl ? <img className="product-card-image" src={item.imageUrl} alt="" /> : <div className="product-placeholder">◇</div>}<div className="product-card-content"><span>{!item.active ? 'Archivado' : item.itemType === 'service' ? 'Servicio' : 'Producto físico'}</span><h3>{item.name}</h3><small>{item.sku || 'Sin SKU'} · Código {item.barcode || 'sin asignar'} · {categories.find((category) => category.id === item.categoryId)?.name || 'Sin categoría'}</small><div><strong>{money(Number(item.price || 0))}</strong><em>{item.itemType === 'service' ? 'Servicio' : `${item.stock} en stock`}</em></div><div className="card-actions"><button onClick={() => startEditProduct(item)}>Editar</button><button onClick={() => printProductLabel(item)}>Imprimir etiqueta</button><button onClick={() => archiveOrRestore('product', item)}>{item.active ? 'Archivar' : 'Reactivar'}</button></div></div></article>)}</div> : <div className="category-grid">{visibleCategories.length === 0 ? <div className="catalog-empty"><div className="empty-spark">+</div><h2>{showArchived ? 'No hay categorías archivadas' : 'Aún no hay categorías'}</h2><p>Crea categorías que tengan sentido para la operación de tu empresa.</p><button className="button" onClick={() => setShowForm(true)}>Crear categoría ↗</button></div> : visibleCategories.map((category) => <article className={`category-card ${!category.active ? 'is-archived' : ''}`} key={category.id}><span style={{ background: category.color || '#c7f57b' }}>◇</span><div><h3>{category.name}</h3><small>{products.filter((item) => item.categoryId === category.id).length} productos · {!category.active ? 'Archivada' : 'Activa'}</small></div><div className="card-actions"><button onClick={() => startEditCategory(category)}>Editar</button><button onClick={() => archiveOrRestore('category', category)}>{category.active ? 'Archivar' : 'Reactivar'}</button></div></article>)}</div>}{tab === 'products' && nextCursor && <div className="catalog-pagination"><button className="button" onClick={() => void loadCatalog(nextCursor, true)} disabled={loadingMore}>{loadingMore ? 'Cargando…' : 'Cargar más productos'}</button></div>}{showForm && <div className="modal-backdrop" onClick={() => setShowForm(false)}><div className="catalog-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowForm(false)}>×</button><div className="eyebrow">{tab === 'products' ? 'Nuevo producto' : 'Nueva categoría'}</div><h2>{tab === 'products' ? 'Agrega algo nuevo.' : 'Organiza tu catálogo.'}</h2>{tab === 'products' ? <form onSubmit={createProduct}><label>Nombre<input required value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} placeholder="Ej. Servicio de instalación" /></label><label>Tipo<select value={product.itemType} onChange={(event) => setProduct({ ...product, itemType: event.target.value })}><option value="physical">Producto físico</option><option value="service">Servicio</option></select></label><label>SKU {product.itemType === 'physical' && <small>(obligatorio)</small>}<input required={product.itemType === 'physical'} value={product.sku} onChange={(event) => setProduct({ ...product, sku: event.target.value })} placeholder="Ej. SKU-001" /></label><div className="product-image-field"><label>Foto del producto<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => handleProductImage(event.target.files?.[0])} /></label>{product.imageDataUrl && <img className="product-image-preview" src={product.imageDataUrl} alt="Vista previa del producto" />}</div><div className="barcode-field"><label>Código de barras<input value={product.barcode} onChange={(event) => setProduct({ ...product, barcode: event.target.value })} placeholder="Escanea, escribe o genera un código" /></label><div className="barcode-field-actions"><button className="button button-secondary" type="button" onClick={() => setScannerOpen(true)}>Escanear</button><button className="button button-quiet" type="button" onClick={() => { const value = generateProductBarcode(); setProduct({ ...product, barcode: value, sku: product.sku || value }); }}>Generar código</button></div></div><div className="form-two"><label>Precio<input type="number" min="0" step="0.01" value={product.price} onChange={(event) => setProduct({ ...product, price: event.target.value })} placeholder="0.00" /></label><label>Stock inicial<input type="number" min="0" step="1" value={product.stock} onChange={(event) => setProduct({ ...product, stock: event.target.value })} disabled={product.itemType === 'service'} placeholder="0" /></label></div><label>Categoría<select value={product.categoryId} onChange={(event) => setProduct({ ...product, categoryId: event.target.value })}><option value="">Sin categoría</option>{categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><button className="button auth-submit" disabled={saving}>{saving ? 'Guardando...' : 'Crear producto ↗'}</button></form> : <form onSubmit={createCategory}><label>Nombre de categoría<input required minLength={2} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Ej. Servicios" /></label><button className="button auth-submit" disabled={saving}>{saving ? 'Guardando...' : 'Crear categoría ↗'}</button></form>}</div></div>}{editForm}<BarcodeScanner open={scannerOpen} title="Escanear código del producto" onDetected={handleBarcodeDetected} onClose={() => setScannerOpen(false)} /></section></main>;
}

export default function CatalogPage() {
  return <CatalogContent />; }
