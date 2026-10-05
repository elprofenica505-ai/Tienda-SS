'use client';

import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/components/tenant/TenantProvider';
import { formatMoney } from '@/lib/currency';
import { getClientCached, invalidateClientCache } from '@/lib/client-query-cache';
import { BarcodeScanner } from '@/components/workspace/BarcodeScanner';
import { printElement } from '@/lib/print';
import { FinancialWorkbookExportError, prepareMasterWorkbookHandle, updateMasterWorkbook } from '@/lib/financial-workbook-storage';

type Category = { id: string; name: string; active: boolean };
type Product = { id: string; name: string; sku?: string; barcode?: string; imageUrl?: string | null; itemType: string; stock: number; price: number; taxRate?: number; unit?: string; location?: string; categoryId?: string };
type Customer = { id: string; name: string; email?: string; phone?: string; active: boolean };
type CartLine = Product & { quantity: number };
type SaleItemDetail = { productId?: string; name: string; sku?: string; quantity: number; unitPrice: number; total: number };
type Sale = {
  id: string;
  saleNumber?: string;
  invoiceNumber?: string;
  total: number;
  subtotal?: number;
  tax?: number;
  discount?: number;
  paymentMethod: string;
  customerName?: string;
  customerId?: string;
  branchId?: string;
  createdAt?: string;
  updatedAt?: string;
  items?: SaleItemDetail[];
  payments?: Array<{ method: string; amount: number }>;
  soldBy?: string;
};
type PosReceipt = { saleId?: string; saleNumber?: string; invoiceNumber?: string; total: number; paymentMethod: string; cashReceived?: number; changeAmount?: number; items: CartLine[]; customerName: string; issuedAt: string };
type SalesCatalogResponse = { products?: Product[]; categories?: Category[] };
type SalesResponse = { sales?: Sale[]; pagination?: { nextCursor?: string | null; hasMore?: boolean } };
type CustomersResponse = { contacts?: Customer[] };

function ProductThumb({ src }: { src?: string | null }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return <span className="presale-product-placeholder" aria-hidden="true">◇</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="presale-product-image" src={src} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />;
}

function formatDateTime(value: string | undefined, timeZone: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date);
}

function SalesContent() {
  const router = useRouter();
  const { authUser, tenant, member, activeBranchId, organization, loading: tenantLoading } = useTenant();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesNextCursor, setSalesNextCursor] = useState<string | null>(null);
  const [loadingMoreSales, setLoadingMoreSales] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [productPage, setProductPage] = useState(0);
  const [documentType, setDocumentType] = useState('ticket');
  const [notes, setNotes] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [discount, setDiscount] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  const receiptPrintRef = useRef<HTMLElement | null>(null);
  const saleDetailPrintRef = useRef<HTMLElement | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [exportingWorkbook, setExportingWorkbook] = useState(false);
  const [workbookReady, setWorkbookReady] = useState(false);

  const pageSize = 25;
  const timeZone = tenant?.timezone || 'America/Managua';

  const load = useCallback(async () => {
    if (!authUser || !tenant) return;
    setLoading(true);
    try {
      const token = await authUser.getIdToken();
      const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': tenant.id, ...(activeBranchId ? { 'x-branch-id': activeBranchId } : {}) };
      const catalog = await getClientCached<SalesCatalogResponse>(`catalog:${authUser.id}:${tenant.id}:active:first`, async () => {
        const response = await fetch('/api/catalog?pageSize=25', { headers, cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'No se pudo cargar el catálogo.');
        return payload as SalesCatalogResponse;
      }, 60_000);
      const salesData = await getClientCached<SalesResponse>(`sales:${authUser.id}:${tenant.id}:${activeBranchId || 'all'}:first`, async () => {
        const response = await fetch('/api/sales?limit=25', { headers, cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'No se pudo cargar ventas.');
        return payload as SalesResponse;
      }, 10_000);
      const customersData = await getClientCached<CustomersResponse>(`contacts:${authUser.id}:${tenant.id}:customer:active`, async () => {
        const response = await fetch('/api/contacts?type=customer', { headers, cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'No se pudieron cargar clientes.');
        return payload as CustomersResponse;
      }, 60_000);
      setProducts(catalog.products || []);
      setCategories((catalog.categories || []).filter((c) => c.active !== false));
      setSales(salesData.sales || []);
      setSalesNextCursor(salesData.pagination?.nextCursor || null);
      setCustomers(customersData.contacts || []);
      setSelectedSaleId((current) => current && (salesData.sales || []).some((s) => s.id === current) ? current : '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar el punto de venta.');
    } finally {
      setLoading(false);
    }
  }, [authUser, tenant, activeBranchId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!tenant?.id) return;
    let active = true;
    setWorkbookReady(false);
    void prepareMasterWorkbookHandle(tenant.id).finally(() => {
      if (active) setWorkbookReady(true);
    });
    return () => { active = false; };
  }, [tenant?.id]);

  async function loadMoreSales() {
    if (!authUser || !tenant || !salesNextCursor || loadingMoreSales) return;
    setLoadingMoreSales(true);
    try {
      const token = await authUser.getIdToken();
      const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': tenant.id, ...(activeBranchId ? { 'x-branch-id': activeBranchId } : {}) };
      const response = await fetch(`/api/sales?limit=25&cursor=${encodeURIComponent(salesNextCursor)}`, { headers, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar más ventas.');
      const page = (data.sales || []) as Sale[];
      setSales((current) => [...current, ...page.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setSalesNextCursor(data.pagination?.nextCursor || null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron cargar más ventas.');
    } finally {
      setLoadingMoreSales(false);
    }
  }

  async function updateExcel() {
    if (!authUser || !tenant) return;
    setExportingWorkbook(true);
    setMessage('Preparando el Excel maestro de la empresa…');
    try {
      const result = await updateMasterWorkbook({ tenantId: tenant.id, tenantName: tenant.name, token: () => authUser.getIdToken() });
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el Excel maestro.');
      if (error instanceof FinancialWorkbookExportError && error.status === 429) setMessage(error.message);
    } finally {
      setExportingWorkbook(false);
    }
  }

  const filtered = useMemo(() => {
    return products.filter((item) => (!categoryId || item.categoryId === categoryId) && `${item.name} ${item.sku || ''}`.toLowerCase().includes(query.toLowerCase()));
  }, [products, categoryId, query]);

  useEffect(() => { setProductPage(0); }, [query, categoryId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedProducts = useMemo(() => {
    const start = productPage * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, productPage]);

  const filteredCustomers = customers.filter((item) => `${item.name} ${item.email || ''} ${item.phone || ''}`.toLowerCase().includes(customerQuery.toLowerCase()));
  const selectedCustomer = customers.find((item) => item.id === customerId);
  const selectedSale = sales.find((item) => item.id === selectedSaleId) || null;
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0), [cart]);
  const tax = useMemo(() => cart.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity * Number(item.taxRate || 0) / 100, 0), [cart]);
  const total = Math.max(0, subtotal - Math.max(0, Number(discount || 0)) + tax);

  function add(product: Product) {
    setCart((current) => {
      const found = current.find((item) => item.id === product.id);
      if (found) return current.map((item) => item.id === product.id ? { ...item, quantity: Math.min(item.quantity + 1, product.itemType === 'service' ? 999 : product.stock) } : item);
      return [...current, { ...product, quantity: 1 }];
    });
  }

  function scanProduct(value: string) {
    const normalized = value.trim().toLowerCase();
    const product = products.find((item) => [item.barcode, item.sku].filter(Boolean).some((code) => String(code).toLowerCase() === normalized));
    if (!product) { setQuery(value); setMessage(`No encontré un producto con el código ${value}.`); return; }
    if (product.itemType !== 'service' && product.stock <= 0) { setMessage(`${product.name} no tiene stock disponible.`); return; }
    add(product);
    setMessage(`${product.name} agregado a la venta.`);
  }

  function changeQuantity(id: string, delta: number) {
    setCart((current) => current.flatMap((item) => {
      if (item.id !== id) return [item];
      const max = item.itemType === 'service' ? 999 : item.stock;
      const quantity = Math.min(max, item.quantity + delta);
      return quantity > 0 ? [{ ...item, quantity }] : [];
    }));
  }

  async function checkout() {
    const activeWarehouseId = organization?.warehouses.find((item) => item.branchId === activeBranchId && item.active)?.id || organization?.warehouses.find((item) => item.active)?.id;
    if (!authUser || !tenant || !cart.length || !activeBranchId || !activeWarehouseId) { setMessage('Configura un almacén activo para esta sucursal antes de vender.'); return; }
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id, 'x-branch-id': activeBranchId }, body: JSON.stringify({ items: cart.map((item) => ({ productId: item.id, quantity: item.quantity, unitPrice: item.price })), paymentMethod, cashReceived: paymentMethod === 'cash' ? Number(cashReceived || 0) : undefined, customerId: customerId || null, discount: Number(discount || 0), branchId: activeBranchId, warehouseId: activeWarehouseId, taxAmount: tax, documentType, notes, paymentReference }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo completar la venta.');
      invalidateClientCache(`sales:${authUser.id}:${tenant.id}:`);
      invalidateClientCache(`catalog:${authUser.id}:${tenant.id}:`);
      invalidateClientCache(`inventory:${authUser.id}:${tenant.id}:`);
      setReceipt({ saleId: data.saleId, saleNumber: data.saleNumber, invoiceNumber: data.invoiceNumber, total: Number(data.total || total), paymentMethod, cashReceived: paymentMethod === 'cash' ? Number(cashReceived || 0) : undefined, changeAmount: paymentMethod === 'cash' ? Math.max(0, Number(cashReceived || 0) - total) : 0, items: cart, customerName: selectedCustomer?.name || 'Venta mostrador', issuedAt: new Date().toISOString() });
      setMessage(`Venta ${data.saleId} registrada por ${formatMoney(Number(data.total), tenant.currency, tenant.locale)}.`);
      setCart([]); setCustomerId(''); setCustomerQuery(''); setDiscount(''); setCashReceived(''); setNotes(''); setPaymentReference('');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo completar la venta.'); }
    finally { setSaving(false); }
  }

  if (tenantLoading || loading) return <div className="workspace-loading">Cargando punto de venta...</div>;
  if (!authUser || !tenant || !member) { router.replace('/'); return null; }
  const money = (value: number) => formatMoney(value, tenant.currency, tenant.locale);

  return (
    <main className="workspace-page">
      <WorkspaceSidebar />
      <section className="workspace-main sales-main">
        <header className="sales-header">
          <div>
            <button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button>
            <div className="eyebrow catalog-eyebrow">Tu espacio / Ventas</div>
            <h1>Punto de venta</h1>
            <p>Registra ventas en <strong>{organization?.branches.find((branch) => branch.id === activeBranchId)?.name || 'la sucursal activa'}</strong> de {tenant.name}.</p>
          </div>
          <span className="catalog-isolation">● Venta transaccional · página de 25 productos</span>
        </header>
        {message && <div className="catalog-message">{message}</div>}
        {receipt && (
          <section className="section-card fiscal-receipt-card receipt-printable" role="status" ref={receiptPrintRef}>
            <div className="eyebrow">Comprobante generado</div>
            <h2>{receipt.invoiceNumber || receipt.saleNumber || receipt.saleId}</h2>
            <p>{receipt.customerName} · {new Intl.DateTimeFormat(tenant.locale || 'es-NI', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(receipt.issuedAt))}</p>
            <div className="receipt-items">{receipt.items.map((item, index) => <div key={`${item.id}-${index}`}><span>{item.quantity} × {item.name}</span><b>{money(Number(item.price) * item.quantity)}</b></div>)}</div>
            <div className="cash-summary-grid">
              <div><small>Total</small><b>{money(receipt.total)}</b></div>
              <div><small>Método</small><b>{receipt.paymentMethod}</b></div>
              <div><small>Recibido</small><b>{receipt.cashReceived === undefined ? '—' : money(receipt.cashReceived)}</b></div>
              <div><small>Vuelto</small><b>{receipt.changeAmount === undefined ? '—' : money(receipt.changeAmount)}</b></div>
            </div>
            <div className="ticket-actions no-print">
              <button className="button" type="button" onClick={() => printElement(receiptPrintRef.current)}>Imprimir / Guardar PDF</button>
              <button className="button button-secondary" type="button" onClick={() => setReceipt(null)}>Nueva venta</button>
            </div>
          </section>
        )}
        <div className="sales-layout">
          <div className="sales-products">
            <div className="sales-toolbar">
              <div><div className="eyebrow">Catálogo disponible</div><h2>Selecciona productos</h2><p>Hasta 25 productos por página · Filtros Todos y por categoría</p></div>
              <div className="scanner-search-row">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre, SKU o código" />
                <button className="button button-secondary" type="button" onClick={() => setScannerOpen(true)}>Escanear</button>
              </div>
              <div className="catalog-filter-row">
                <button className={`catalog-filter ${!categoryId ? 'selected' : ''}`} type="button" onClick={() => setCategoryId('')}>Todos</button>
                {categories.map((cat) => (
                  <button key={cat.id} className={`catalog-filter ${categoryId === cat.id ? 'selected' : ''}`} type="button" onClick={() => setCategoryId(cat.id)}>{cat.name}</button>
                ))}
              </div>
            </div>
            <div className="sales-product-grid">
              {paginatedProducts.length === 0 ? (
                <div className="catalog-empty">
                  <div className="empty-spark">◇</div>
                  <h2>No hay productos disponibles</h2>
                  <p>Agrega productos en el catálogo antes de registrar una venta.</p>
                  <button className="button" onClick={() => router.push('/workspace/catalog')}>Ir al catálogo ↗</button>
                </div>
              ) : paginatedProducts.map((product) => (
                <button className="sales-product" key={product.id} onClick={() => add(product)} disabled={product.itemType !== 'service' && product.stock <= 0}>
                  <ProductThumb src={product.imageUrl} />
                  <b>{product.name}</b>
                  <small>{product.sku || 'Sin SKU'} · {product.itemType === 'service' ? 'Servicio' : `${product.stock} disponibles`}</small>
                  <strong>{money(Number(product.price || 0))}</strong>
                </button>
              ))}
            </div>
            {filtered.length > pageSize && (
              <div className="catalog-pagination">
                <button className="button button-secondary" disabled={productPage === 0} onClick={() => setProductPage((p) => Math.max(0, p - 1))}>← Anterior</button>
                <span className="pagination-label">Página {productPage + 1} de {totalPages} · {filtered.length} productos</span>
                <button className="button button-secondary" disabled={productPage + 1 >= totalPages} onClick={() => setProductPage((p) => p + 1)}>Siguiente →</button>
              </div>
            )}
          </div>
          <aside className="sale-ticket">
            <div className="ticket-head"><div><div className="eyebrow">Nueva venta</div><h2>Ticket</h2></div><span>{cart.length} ítems</span></div>
            <div className="ticket-lines">
              {cart.length === 0 ? <div className="ticket-empty"><span>+</span><p>Selecciona productos<br />para iniciar la venta</p></div> : cart.map((item) => (
                <div className="ticket-line" key={item.id}>
                  <div><b>{item.name}</b><small>{money(Number(item.price))} c/u</small></div>
                  <div className="quantity-control"><button onClick={() => changeQuantity(item.id, -1)}>−</button><span>{item.quantity}</span><button onClick={() => changeQuantity(item.id, 1)}>+</button></div>
                  <strong>{money(Number(item.price) * item.quantity)}</strong>
                </div>
              ))}
            </div>
            <div className="ticket-form">
              <label>Cliente guardado {paymentMethod === 'credit' && <small className="required-note">(obligatorio para crédito)</small>}
                <select required={paymentMethod === 'credit'} value={customerId} onChange={(event) => { setCustomerId(event.target.value); setCustomerQuery(''); }}>
                  <option value="">{paymentMethod === 'credit' ? 'Selecciona un cliente' : 'Venta mostrador'}</option>
                  {filteredCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}
                </select>
              </label>
              <input className="customer-search" value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="Filtrar clientes guardados" />
              {selectedCustomer && <div className="selected-customer">Cliente seleccionado: <strong>{selectedCustomer.name}</strong></div>}
              {paymentMethod === 'cash' && <label>Efectivo recibido<input type="number" min={total} step="0.01" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} placeholder={money(total)} /><small className={Number(cashReceived || 0) < total ? 'required-note' : undefined}>{Number(cashReceived || 0) < total ? `Faltan ${money(total - Number(cashReceived || 0))}` : `Vuelto: ${money(Number(cashReceived || 0) - total)}`}</small></label>}
              <div className="payment-label">Método de pago</div>
              <div className="payment-options">{[['cash','Efectivo'],['card','Tarjeta'],['transfer','Transferencia'],['credit','Crédito']].map(([value, label]) => <button key={value} className={paymentMethod === value ? 'selected' : ''} onClick={() => setPaymentMethod(value)}>{label}</button>)}</div>
              <label>Tipo de comprobante<select value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="ticket">Ticket</option><option value="invoice">Factura fiscal</option><option value="delivery_note">Nota de entrega</option></select></label>
              <label>Referencia tarjeta / transferencia<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Opcional" /></label>
              <label>Notas de la venta<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Despacho, empaque, observaciones" /></label>
              <label>Descuento<input type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} placeholder="0.00" /></label>
            </div>
            <div className="ticket-total"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Descuento</span><strong>-{money(Math.max(0, Number(discount || 0)))}</strong></div><div><span>Impuestos estimados</span><strong>{money(tax)}</strong></div><div className="total-line"><span>Total</span><strong>{money(total)}</strong></div></div>
            <button className="button button-large checkout-button" onClick={checkout} disabled={saving || !cart.length || !activeBranchId || (paymentMethod === 'credit' && !customerId) || (paymentMethod === 'cash' && Number(cashReceived || 0) < total)}>{saving ? 'Procesando...' : 'Cobrar venta ↗'}</button>
          </aside>
        </div>

        <section className="section-card sales-history-section">
          <div className="inventory-panel-header sales-history-header">
            <div><div className="eyebrow">Historial</div><h2>Ventas recientes seleccionables</h2><p>Selecciona una venta para ver detalle, imprimir y actualizar el Excel maestro. Hasta 25 por página.</p></div>
            <button className="button button-secondary" type="button" onClick={() => void updateExcel()} disabled={exportingWorkbook || !workbookReady}>{exportingWorkbook ? 'Actualizando…' : workbookReady ? 'Actualizar Excel maestro' : 'Preparando…'}</button>
          </div>
          {sales.length === 0 ? <div className="inventory-empty">Las ventas registradas aparecerán aquí.</div> : (
            <div className="sales-history-layout">
              <div className="sales-history-list">
                {sales.map((sale) => (
                  <button key={sale.id} className={`recent-sale selectable ${selectedSaleId === sale.id ? 'selected' : ''}`} type="button" aria-pressed={selectedSaleId === sale.id} onClick={() => setSelectedSaleId(sale.id)}>
                    <span className="sale-status">✓</span>
                    <div><b>{sale.saleNumber || sale.id.slice(0,8)}</b><small>{sale.invoiceNumber ? `Factura ${sale.invoiceNumber} · ` : ''}{sale.customerName || 'Venta mostrador'} · {sale.paymentMethod} · {formatDateTime(sale.createdAt, timeZone)}</small></div>
                    <strong>{money(Number(sale.total || 0))}</strong>
                  </button>
                ))}
                {salesNextCursor && <button className="button button-secondary sales-history-more" type="button" onClick={() => void loadMoreSales()} disabled={loadingMoreSales}>{loadingMoreSales ? 'Cargando…' : 'Cargar más ventas (25)'}</button>}
              </div>
              {selectedSale && (
                <article className="sale-detail-panel" ref={saleDetailPrintRef}>
                  <header className="sale-detail-header">
                    <div><div className="eyebrow">Detalle de venta</div><h3>{selectedSale.saleNumber || selectedSale.id}</h3><p>{selectedSale.invoiceNumber ? `Factura ${selectedSale.invoiceNumber} · ` : ''}{formatDateTime(selectedSale.createdAt, timeZone)}</p></div>
                    <button className="button button-secondary no-print" type="button" onClick={() => printElement(saleDetailPrintRef.current)}>Imprimir detalle</button>
                  </header>
                  <div className="sale-detail-facts">
                    <div><small>Cliente</small><b>{selectedSale.customerName || 'Venta mostrador'}</b></div>
                    <div><small>Total</small><b>{money(Number(selectedSale.total || 0))}</b></div>
                    <div><small>Método</small><b>{selectedSale.paymentMethod}</b></div>
                    <div><small>Estado</small><b>{(selectedSale as any).status || 'completada'}</b></div>
                    <div><small>Subtotal</small><b>{money(Number(selectedSale.subtotal || selectedSale.total || 0))}</b></div>
                    <div><small>Descuento</small><b>{money(Number(selectedSale.discount || 0))}</b></div>
                  </div>
                  <div className="sale-detail-items">
                    <h4>Productos y cantidades</h4>
                    {(selectedSale.items || []).length === 0 ? <p>No hay detalle de productos disponible.</p> : (
                      <table className="financial-detail-table">
                        <thead><tr><th>Producto</th><th>SKU</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead>
                        <tbody>{(selectedSale.items || []).map((item, idx) => (
                          <tr key={`${item.productId}-${idx}`}><td>{item.name}</td><td>{item.sku || '—'}</td><td>{item.quantity}</td><td>{money(Number(item.unitPrice || 0))}</td><td>{money(Number(item.total || 0))}</td></tr>
                        ))}</tbody>
                      </table>
                    )}
                  </div>
                  {selectedSale.payments && selectedSale.payments.length > 0 && (
                    <div className="sale-detail-payments"><h4>Pagos</h4>{selectedSale.payments.map((p, i) => <div key={i} className="cash-movement-payment"><span>{p.method}</span><strong>{money(Number(p.amount || 0))}</strong></div>)}</div>
                  )}
                  <div className="sale-detail-meta"><small>ID: {selectedSale.id}</small><small>Sucursal: {selectedSale.branchId || '—'}</small></div>
                </article>
              )}
            </div>
          )}
        </section>

        <BarcodeScanner open={scannerOpen} title="Escanear producto para venta directa" onDetected={scanProduct} onClose={() => setScannerOpen(false)} />
      </section>
    </main>
  );
}

export default function SalesPage() {
  return <SalesContent />;
}
