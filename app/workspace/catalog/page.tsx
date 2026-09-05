'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TenantProvider, useTenant } from '@/components/tenant/TenantProvider';

type Category = { id: string; name: string; color?: string };
type Product = { id: string; name: string; sku?: string; itemType: string; categoryId?: string; price: number; stock: number; active: boolean };

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
  const [categoryName, setCategoryName] = useState('');
  const [product, setProduct] = useState({ name: '', sku: '', price: '', stock: '', categoryId: '', itemType: 'physical' });

  async function loadCatalog() {
    if (!authUser || !tenant) return;
    setLoading(true);
    try {
      const token = await authUser.getIdToken();
      const response = await fetch('/api/catalog', { headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenant.id }, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar el catálogo.');
      setCategories(data.categories || []);
      setProducts(data.products || []);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Error cargando el catálogo.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadCatalog(); }, [authUser, tenant]);

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    if (!authUser || !tenant) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/catalog', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, body: JSON.stringify({ type: 'category', name: categoryName }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo crear la categoría.');
      setCategoryName(''); setShowForm(false); setMessage('Categoría creada.'); await loadCatalog();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Error guardando categoría.'); }
    finally { setSaving(false); }
  }

  async function createProduct(event: FormEvent) {
    event.preventDefault();
    if (!authUser || !tenant) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/catalog', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, body: JSON.stringify({ type: 'product', ...product, price: Number(product.price || 0), stock: Number(product.stock || 0) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo crear el producto.');
      setProduct({ name: '', sku: '', price: '', stock: '', categoryId: '', itemType: 'physical' }); setShowForm(false); setMessage('Producto creado.'); await loadCatalog();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Error guardando producto.'); }
    finally { setSaving(false); }
  }

  if (tenantLoading || loading) return <div className="workspace-loading">Cargando catálogo de {tenant?.name || 'tu empresa'}...</div>;
  if (!authUser || !tenant || !member) { router.replace('/'); return null; }

  return <main className="workspace-page"><aside className="workspace-sidebar"><div className="onboarding-brand"><span className="brand-mark-icon">N</span><b>Nexo<span>Flow</span></b></div><div className="workspace-company"><span>{tenant.name.slice(0, 1).toUpperCase()}</span><div><b>{tenant.name}</b><small>Plan {tenant.plan || 'Starter'}</small></div></div><nav><a onClick={() => router.push('/workspace')}>▦ <span>Resumen</span></a><a className="active">◇ <span>Catálogo</span></a><a>◈ <span>Ventas</span></a><a>○ <span>Clientes</span></a><a>≡ <span>Reportes</span></a></nav></aside><section className="workspace-main catalog-main"><header className="catalog-header"><div><button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button><div className="eyebrow catalog-eyebrow">Tu espacio / Catálogo</div><h1>Catálogo</h1><p>Administra los productos y categorías de <strong>{tenant.name}</strong>.</p></div><button className="button" onClick={() => setShowForm(true)}>+ {tab === 'products' ? 'Nuevo producto' : 'Nueva categoría'}</button></header><div className="catalog-toolbar"><div className="catalog-tabs"><button className={tab === 'products' ? 'selected' : ''} onClick={() => setTab('products')}>Productos <span>{products.length}</span></button><button className={tab === 'categories' ? 'selected' : ''} onClick={() => setTab('categories')}>Categorías <span>{categories.length}</span></button></div><span className="catalog-isolation">● Datos privados de tu empresa</span></div>{message && <div className="catalog-message">{message}</div>}{tab === 'products' ? <div className="catalog-grid">{products.length === 0 ? <div className="catalog-empty"><div className="empty-spark">◇</div><h2>Aún no hay productos</h2><p>Tu catálogo comienza vacío. Agrega el primer producto propio de {tenant.name}.</p><button className="button" onClick={() => setShowForm(true)}>Agregar primer producto ↗</button></div> : products.map((item) => <article className="product-card" key={item.id}><div className="product-placeholder">◇</div><div className="product-card-content"><span>{item.itemType === 'service' ? 'Servicio' : 'Producto físico'}</span><h3>{item.name}</h3><small>{item.sku || 'Sin SKU'} · {categories.find((category) => category.id === item.categoryId)?.name || 'Sin categoría'}</small><div><strong>${item.price.toFixed(2)}</strong><em>{item.itemType === 'service' ? 'Servicio' : `${item.stock} en stock`}</em></div></div></article>)}</div> : <div className="category-grid">{categories.length === 0 ? <div className="catalog-empty"><div className="empty-spark">+</div><h2>Aún no hay categorías</h2><p>Crea categorías que tengan sentido para la operación de tu empresa.</p><button className="button" onClick={() => setShowForm(true)}>Crear primera categoría ↗</button></div> : categories.map((category) => <article className="category-card" key={category.id}><span style={{ background: category.color || '#c7f57b' }}>◇</span><div><h3>{category.name}</h3><small>{products.filter((item) => item.categoryId === category.id).length} productos</small></div></article>)}</div>}{showForm && <div className="modal-backdrop" onClick={() => setShowForm(false)}><div className="catalog-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowForm(false)}>×</button><div className="eyebrow">{tab === 'products' ? 'Nuevo producto' : 'Nueva categoría'}</div><h2>{tab === 'products' ? 'Agrega algo nuevo.' : 'Organiza tu catálogo.'}</h2>{tab === 'products' ? <form onSubmit={createProduct}><label>Nombre<input required value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} placeholder="Ej. Servicio de instalación" /></label><label>Tipo<select value={product.itemType} onChange={(event) => setProduct({ ...product, itemType: event.target.value })}><option value="physical">Producto físico</option><option value="service">Servicio</option></select></label><label>SKU {product.itemType === 'physical' && <small>(obligatorio)</small>}<input required={product.itemType === 'physical'} value={product.sku} onChange={(event) => setProduct({ ...product, sku: event.target.value })} placeholder="Ej. SKU-001" /></label><div className="form-two"><label>Precio<input type="number" min="0" step="0.01" value={product.price} onChange={(event) => setProduct({ ...product, price: event.target.value })} placeholder="0.00" /></label><label>Stock inicial<input type="number" min="0" step="1" value={product.stock} onChange={(event) => setProduct({ ...product, stock: event.target.value })} disabled={product.itemType === 'service'} placeholder="0" /></label></div><label>Categoría<select value={product.categoryId} onChange={(event) => setProduct({ ...product, categoryId: event.target.value })}><option value="">Sin categoría</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><button className="button auth-submit" disabled={saving}>{saving ? 'Guardando...' : 'Crear producto ↗'}</button></form> : <form onSubmit={createCategory}><label>Nombre de categoría<input required minLength={2} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Ej. Servicios" /></label><button className="button auth-submit" disabled={saving}>{saving ? 'Guardando...' : 'Crear categoría ↗'}</button></form>}</div></div>}</section></main>;
}

export default function CatalogPage() {
  return <TenantProvider><CatalogContent /></TenantProvider>;
}
