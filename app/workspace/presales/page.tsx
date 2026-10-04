'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar';
import { BarcodeScanner } from '@/components/workspace/BarcodeScanner';
import { useTenant } from '@/components/tenant/TenantProvider';
import { formatMoney } from '@/lib/currency';
import { printElement } from '@/lib/print';
import { FinancialWorkbookExportError, prepareMasterWorkbookHandle, updateMasterWorkbook } from '@/lib/financial-workbook-storage';

type Product = {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  imageUrl?: string | null;
  itemType: string;
  stock: number;
  price: number;
  taxRate?: number;
  unit?: string;
  location?: string;
  categoryId?: string;
};

type Category = { id: string; name: string; active: boolean };
type CartLine = Product & { quantity: number };
type PresaleItem = { productId?: string; name: string; sku?: string; quantity: number; unitPrice: number; total: number; description?: string };
type PresalePayment = { method?: string; amount?: number };
type PresaleSale = { id: string; saleNumber: string; status: string; total: number; createdAt?: string; paymentMethod?: string; payments?: PresalePayment[] };
type PreSale = {
  id: string;
  ticketCode: string;
  total: number;
  status: string;
  sellerName?: string;
  sellerEmail?: string;
  vendedorUid?: string;
  vendedorRole?: string;
  branchId?: string;
  branchName?: string;
  customerId?: string;
  customerName?: string;
  items?: PresaleItem[];
  metadata?: { customerId?: string | null; customerName?: string; suggestedPayment?: string | null; documentType?: string; servicePoint?: string; notes?: string; itemNotes?: Record<string, string> };
  saleId?: string;
  saleNumber?: string;
  sale?: PresaleSale | null;
  createdAt?: string;
  updatedAt?: string;
  paidAt?: string;
  paidBy?: string;
};

function formatDateTime(value: string | undefined, timeZone: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date);
}

function PresalesContent() {
  const router = useRouter();
  const { authUser, tenant, member, activeBranchId, organization, loading: tenantLoading } = useTenant();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [suggestedPayment, setSuggestedPayment] = useState('');
  const [documentType, setDocumentType] = useState('ticket');
  const [servicePoint, setServicePoint] = useState('');
  const [notes, setNotes] = useState('');
  const [presales, setPresales] = useState<PreSale[]>([]);
  const [presaleNextCursor, setPresaleNextCursor] = useState<string | null>(null);
  const [loadingMorePresales, setLoadingMorePresales] = useState(false);
  const [selectedPresaleId, setSelectedPresaleId] = useState('');
  const [lastTicket, setLastTicket] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [productPage, setProductPage] = useState(0);
  const [evidence, setEvidence] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportingWorkbook, setExportingWorkbook] = useState(false);
  const [workbookReady, setWorkbookReady] = useState(false);
  const [message, setMessage] = useState('');
  const detailPrintRef = useRef<HTMLElement | null>(null);
  const lastTicketPrintRef = useRef<HTMLDivElement | null>(null);

  const timeZone = tenant?.timezone || 'America/Managua';
  const money = useCallback((value: number) => formatMoney(Number(value || 0), tenant?.currency || 'NIO', tenant?.locale || 'es-NI'), [tenant?.currency, tenant?.locale]);
  const selectedPresale = presales.find((item) => item.id === selectedPresaleId) || null;
  const pageSize = 25;

  const load = useCallback(async () => {
    if (!authUser || !tenant || !activeBranchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const headers = {
        Authorization: `Bearer ${await authUser.getIdToken()}`,
        'x-tenant-id': tenant.id,
        'x-branch-id': activeBranchId,
      };
      const [catalogResponse, presalesResponse] = await Promise.all([
        fetch('/api/catalog?pageSize=25', { headers, cache: 'no-store' }),
        fetch('/api/presales', { headers, cache: 'no-store' }),
      ]);
      const catalog = await catalogResponse.json();
      const data = await presalesResponse.json();
      if (!catalogResponse.ok) throw new Error(`Catálogo (${catalogResponse.status}): ${catalog.error || 'respuesta rechazada'}`);
      if (!presalesResponse.ok) throw new Error(`Preventas (${presalesResponse.status}): ${data.error || 'respuesta rechazada'}`);
      const nextPresales = (data.presales || []) as PreSale[];
      setProducts(catalog.products || []);
      setCategories((catalog.categories || []).filter((c: Category) => c.active !== false));
      setPresales(nextPresales);
      setPresaleNextCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
      setSelectedPresaleId((current) => current && nextPresales.some((item) => item.id === current) ? current : '');
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar preventas.');
    } finally {
      setLoading(false);
    }
  }, [authUser, tenant, activeBranchId]);

  async function loadMorePresales() {
    if (!authUser || !tenant || !activeBranchId || !presaleNextCursor || loadingMorePresales) return;
    setLoadingMorePresales(true);
    try {
      const response = await fetch(`/api/presales?cursor=${encodeURIComponent(presaleNextCursor)}`, {
        headers: { Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id, 'x-branch-id': activeBranchId },
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar más preventas.');
      const page = (data.presales || []) as PreSale[];
      setPresales((current) => [...current, ...page.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setPresaleNextCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron cargar más preventas.');
    } finally {
      setLoadingMorePresales(false);
    }
  }

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

  useEffect(() => { setProductPage(0); }, [query, categoryFilter]);

  const filtered = useMemo(() => {
    return products.filter((item) => {
      const matchesQuery = `${item.name} ${item.sku || ''}`.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = !categoryFilter || item.categoryId === categoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [products, query, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedProducts = useMemo(() => {
    const start = productPage * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, productPage]);

  const total = useMemo(() => cart.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0), [cart]);

  function add(product: Product) {
    setCart((current) => {
      const found = current.find((item) => item.id === product.id);
      if (found) return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { ...product, quantity: 1 }];
    });
  }

  function scanProduct(value: string) {
    const normalized = value.trim().toLowerCase();
    const product = products.find((item) => [item.barcode, item.sku].filter(Boolean).some((code) => String(code).toLowerCase() === normalized));
    if (!product) {
      setQuery(value);
      setMessage(`No encontré un producto con el código ${value}.`);
      return;
    }
    add(product);
    setMessage(`${product.name} agregado a la Preventa.`);
  }

  function change(id: string, delta: number) {
    setCart((current) => current.flatMap((item) => {
      if (item.id !== id) return [item];
      const quantity = Math.max(0, item.quantity + delta);
      return quantity ? [{ ...item, quantity }] : [];
    }));
  }

  async function cancelPresale(presaleId: string) {
    if (!authUser || !tenant) return;
    if (!window.confirm('¿Cancelar esta preventa? No se descontará inventario.')) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/presales', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id, 'x-branch-id': activeBranchId || '' },
        body: JSON.stringify({ presaleId, action: 'cancel' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cancelar la preventa.');
      setMessage(`Preventa ${data.presaleId} cancelada.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cancelar la preventa.');
    } finally {
      setSaving(false);
    }
  }

  async function sendToCashier() {
    if (!authUser || !tenant || !cart.length || !activeBranchId) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/presales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id, 'x-branch-id': activeBranchId },
        body: JSON.stringify({
          action: 'send',
          branchId: activeBranchId,
          items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
          evidenceRefs: evidence,
          customerId: customerId || null,
          suggestedPayment,
          documentType,
          servicePoint,
          notes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo enviar la preventa.');
      setMessage(`Preventa ${data.ticketCode} enviada a caja.`);
      setLastTicket(data.ticketCode || '');
      setCart([]);
      setEvidence([]);
      setCustomerId('');
      setSuggestedPayment('');
      setServicePoint('');
      setNotes('');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo enviar la preventa.');
    } finally {
      setSaving(false);
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

  function printPresale() {
    if (detailPrintRef.current) printElement(detailPrintRef.current);
  }

  if (tenantLoading || loading) return <div className="workspace-loading">Cargando preventas...</div>;
  if (!authUser || !tenant || !member) {
    router.replace('/');
    return null;
  }

  return (
    <main className="workspace-page">
      <WorkspaceSidebar />
      <section className="workspace-main sales-main">
        <header className="sales-header">
          <div>
            <button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button>
            <div className="eyebrow catalog-eyebrow">Tu espacio / Ventas</div>
            <h1>Preventa en piso</h1>
            <p>Arma el ticket, adjunta evidencia y envíalo a caja para cobrarlo. Filtros Todos y por categoría · Hasta 25 productos por página.</p>
          </div>
          <span className="catalog-isolation">● Stock baja al cobrar · 25 por página</span>
        </header>

        {message && <div className="catalog-message" role="status">{message}</div>}
        {lastTicket && (
          <div className="ticket-code-banner" role="status" ref={lastTicketPrintRef}>
            <strong>{lastTicket}</strong>
            <div className="ticket-actions no-print">
              <button className="button button-secondary" type="button" onClick={() => void navigator.clipboard?.writeText(lastTicket)}>Copiar código</button>
              <button className="button button-secondary" type="button" onClick={() => printElement(lastTicketPrintRef.current)}>Imprimir código</button>
            </div>
          </div>
        )}

        <div className="sales-layout">
          <div className="sales-products">
            <div className="sales-toolbar">
              <div><div className="eyebrow">Catálogo disponible</div><h2>Agrega productos</h2></div>
              <div className="scanner-search-row">
                <input aria-label="Buscar producto por nombre, SKU o código" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre, SKU o código" />
                <button className="button button-secondary" type="button" onClick={() => setScannerOpen(true)}>Escanear</button>
              </div>
              <div className="catalog-filter-row">
                <button className={`catalog-filter ${!categoryFilter ? 'selected' : ''}`} type="button" onClick={() => setCategoryFilter('')}>Todos</button>
                {categories.map((cat) => <button key={cat.id} className={`catalog-filter ${categoryFilter === cat.id ? 'selected' : ''}`} type="button" onClick={() => setCategoryFilter(cat.id)}>{cat.name}</button>)}
              </div>
            </div>
            <div className="sales-product-grid">
              {paginatedProducts.length === 0 ? <div className="catalog-empty"><h2>No hay productos disponibles</h2><p>Solicita al dueño que agregue productos al catálogo.</p></div> : paginatedProducts.map((product) => (
                <button className="sales-product" key={product.id} onClick={() => add(product)} disabled={product.itemType !== 'service' && product.stock <= 0}>
                  {product.imageUrl ? <img className="presale-product-image" src={product.imageUrl} alt="" /> : <span className="presale-product-placeholder" aria-hidden="true">◇</span>}
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
            <div className="ticket-head"><div><div className="eyebrow">Nueva preventa</div><h2>Ticket</h2></div><span>{cart.length} ítems</span></div>
            <div className="ticket-lines">
              {cart.length === 0 ? <div className="ticket-empty"><span>+</span><p>Selecciona productos<br />para iniciar</p></div> : cart.map((item) => (
                <div className="ticket-line" key={item.id}>
                  <div><b>{item.name}</b><small>{money(Number(item.price))} c/u</small></div>
                  <div className="quantity-control"><button type="button" aria-label={`Quitar una unidad de ${item.name}`} onClick={() => change(item.id, -1)}>−</button><span>{item.quantity}</span><button type="button" aria-label={`Agregar una unidad de ${item.name}`} onClick={() => change(item.id, 1)}>+</button></div>
                  <strong>{money(Number(item.price) * item.quantity)}</strong>
                </div>
              ))}
            </div>
            <div className="presale-form space-y-4" aria-label="Datos de la preventa">
              <div className="presale-field"><label htmlFor="presale-customer">Cliente / identificación</label><input id="presale-customer" className="w-full" value={customerId} onChange={(event) => setCustomerId(event.target.value)} placeholder="ID del cliente (opcional)" /></div>
              <div className="presale-field"><label htmlFor="presale-payment">Condición sugerida de pago</label><select id="presale-payment" className="w-full" value={suggestedPayment} onChange={(event) => setSuggestedPayment(event.target.value)}><option value="">La define caja</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="credit">Crédito</option></select></div>
              <div className="presale-field"><label htmlFor="presale-document">Comprobante solicitado</label><select id="presale-document" className="w-full" value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="ticket">Ticket</option><option value="invoice">Factura</option><option value="delivery_note">Nota de entrega</option></select></div>
              <div className="presale-field"><label htmlFor="presale-service-point">Mesa / zona / punto de atención</label><input id="presale-service-point" className="w-full" value={servicePoint} onChange={(event) => setServicePoint(event.target.value)} placeholder="Opcional" /></div>
              <div className="presale-field"><label htmlFor="presale-notes">Observaciones para caja o despacho</label><textarea id="presale-notes" className="w-full" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Entrega, empaque, indicaciones" rows={3} /></div>
              <div className="presale-field"><label htmlFor="presale-evidence">Evidencia del ticket</label><input id="presale-evidence" className="w-full file:mr-3 file:rounded-md file:border-0 file:bg-lime-100 file:px-3 file:py-2 file:text-xs" type="file" accept="image/*" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) setEvidence((current) => [...current, `evidence://${file.name}`].slice(0, 10)); }} /><small>Opcional: cámara o galería. Se guarda una referencia de auditoría.</small></div>
            </div>
            {evidence.length > 0 && <div className="selected-customer">Adjuntos: {evidence.join(', ')}</div>}
            <div className="ticket-total"><div className="total-line"><span>Total</span><strong>{money(total)}</strong></div></div>
            <button className="button button-large checkout-button" onClick={sendToCashier} disabled={saving || !cart.length}>{saving ? 'Enviando...' : 'Enviar a caja ↗'}</button>
          </aside>
        </div>

        <section className="section-card presale-history-section">
          <div className="inventory-panel-header presale-history-header">
            <div><div className="eyebrow">Mis preventas</div><h2>Actividad reciente</h2><p>Selecciona una fila para abrir el detalle en tabla. Impresión ajustada. Hasta 25 por página. Las exportaciones actualizan el mismo Excel maestro.</p></div>
            <button className="button button-secondary" type="button" onClick={() => void updateExcel()} disabled={exportingWorkbook || !workbookReady}>
              {exportingWorkbook ? 'Actualizando…' : workbookReady ? 'Actualizar Excel maestro' : 'Preparando…'}
            </button>
          </div>
          {presales.length === 0 ? <div className="inventory-empty">Tus preventas enviadas aparecerán aquí.</div> : (
            <div className="presale-history-list">
              {presales.map((item) => (
                <article className={`presale-history-item ${selectedPresaleId === item.id ? 'selected' : ''}`} key={item.id}>
                  <button className="presale-history-row" type="button" aria-pressed={selectedPresaleId === item.id} onClick={() => setSelectedPresaleId(item.id)}>
                    <span className={`sale-status ${item.status === 'paid' ? 'is-paid' : ''}`}>{item.status === 'paid' ? '✓' : '•'}</span>
                    <span className="presale-history-copy"><b className="ticket-code-prominent">{item.ticketCode}</b><small>{item.sellerName || item.sellerEmail || 'Usuario de origen'} · {formatDateTime(item.createdAt, timeZone)} · {item.status === 'sent_to_cashier' ? 'En caja' : item.status}</small></span>
                    <strong>{money(Number(item.total || 0))}</strong>
                  </button>
                  <div className="presale-history-actions no-print">
                    <button className="text-link" type="button" onClick={() => void navigator.clipboard?.writeText(item.ticketCode)}>Copiar código</button>
                    {item.status === 'sent_to_cashier' && <button className="text-link" type="button" disabled={saving} onClick={() => void cancelPresale(item.id)}>Cancelar preventa</button>}
                  </div>
                </article>
              ))}
            </div>
          )}
          {presaleNextCursor && <button className="button button-secondary presale-history-more" type="button" onClick={() => void loadMorePresales()} disabled={loadingMorePresales}>{loadingMorePresales ? 'Cargando…' : 'Cargar más preventas (25)'}</button>}
        </section>

        {selectedPresale && (
          <section className="section-card presale-selected-panel">
            <article className="presale-print-detail" ref={detailPrintRef}>
              <header className="presale-detail-heading">
                <div><div className="eyebrow">Detalle de preventa</div><h2>{selectedPresale.ticketCode}</h2><p>{selectedPresale.status === 'sent_to_cashier' ? 'En caja' : selectedPresale.status}</p></div>
                <button className="button button-secondary no-print" type="button" onClick={printPresale}>Imprimir detalle</button>
              </header>
              <div className="presale-facts-grid">
                <div><small>Fecha y hora</small><b>{formatDateTime(selectedPresale.createdAt, timeZone)}</b></div>
                <div><small>Responsable / vendedor</small><b>{selectedPresale.sellerName || selectedPresale.sellerEmail || selectedPresale.vendedorUid || '—'}</b><span>{[selectedPresale.vendedorRole, selectedPresale.sellerEmail].filter(Boolean).join(' · ')}</span></div>
                <div><small>Sucursal</small><b>{selectedPresale.branchName || '—'}</b></div>
                <div><small>Total</small><b>{money(Number(selectedPresale.total || 0))}</b></div>
                <div><small>Cliente / identificación</small><b>{selectedPresale.customerName || selectedPresale.customerId || selectedPresale.metadata?.customerId || 'Venta mostrador'}</b></div>
                <div><small>Pago sugerido</small><b>{selectedPresale.metadata?.suggestedPayment || 'Lo define Caja'}</b></div>
                <div><small>Comprobante</small><b>{selectedPresale.metadata?.documentType || 'Ticket'}</b></div>
                <div><small>Mesa / punto de servicio</small><b>{selectedPresale.metadata?.servicePoint || '—'}</b></div>
                <div className="presale-fact-wide"><small>Observaciones</small><b>{selectedPresale.metadata?.notes || '—'}</b></div>
                {selectedPresale.paidAt && <div><small>Pagada el</small><b>{formatDateTime(selectedPresale.paidAt, timeZone)}</b></div>}
              </div>

              <div className="presale-detail-items">
                <h3>Productos y cantidades — tabla</h3>
                {(selectedPresale.items || []).length === 0 ? <p>No hay productos asociados.</p> : (
                  <div className="financial-table-scroll">
                    <table className="financial-detail-table presale-detail-table">
                      <thead><tr><th>Producto</th><th>SKU</th><th>Cantidad</th><th>Precio unit.</th><th>Total</th></tr></thead>
                      <tbody>
                        {(selectedPresale.items || []).map((item, index) => (
                          <tr key={`${item.productId || item.name}-${index}`}>
                            <td><b>{item.name}</b>{item.description && <small>{item.description}</small>}</td>
                            <td>{item.sku || '—'}</td>
                            <td>{item.quantity}</td>
                            <td>{money(Number(item.unitPrice || 0))}</td>
                            <td><strong>{money(Number(item.total || 0))}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot><tr><td colSpan={4}><b>Total</b></td><td><strong>{money(Number(selectedPresale.total || 0))}</strong></td></tr></tfoot>
                    </table>
                  </div>
                )}
              </div>

              {selectedPresale.sale && (
                <div className="presale-related-sale">
                  <h3>Venta relacionada</h3>
                  <div className="presale-related-sale-row"><span>{selectedPresale.sale.saleNumber}</span><span>{selectedPresale.sale.status}</span><strong>{money(Number(selectedPresale.sale.total || 0))}</strong></div>
                  <small>{formatDateTime(selectedPresale.sale.createdAt, timeZone)} · {selectedPresale.sale.paymentMethod || 'Método no disponible'}</small>
                  {(selectedPresale.sale.payments || []).map((payment, index) => <small key={`${payment.method}-${index}`}>{payment.method || 'Pago'}: {money(Number(payment.amount || 0))}</small>)}
                </div>
              )}
              <div className="presale-related-meta"><small>Identificador: {selectedPresale.id}</small>{selectedPresale.saleId && <small>Venta relacionada: {selectedPresale.saleNumber || selectedPresale.saleId}</small>}</div>
            </article>
          </section>
        )}

        <BarcodeScanner open={scannerOpen} title="Escanear producto para Preventa" onDetected={scanProduct} onClose={() => setScannerOpen(false)} />
      </section>
    </main>
  );
}

export default function PresalesPage() {
  return <PresalesContent />;
}
