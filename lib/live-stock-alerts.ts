import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Alertas de stock en tiempo real.
 *
 * Las alertas guardadas en `daily_smart_alerts` las recalcula una tarea diaria. Para que un producto que
 * se agota durante el día aparezca de inmediato, esta capa revisa el stock actual al momento de leer la
 * bandeja y lo combina con las alertas guardadas.
 *
 * - Solo LEE de la base de datos: no escribe nada y no necesita migraciones.
 * - Usa la misma regla que la generación diaria: stock = suma de existencias de los almacenes activos
 *   de la empresa, solo productos físicos activos.
 * - Si algo falla, quien la usa debe seguir mostrando las alertas guardadas (ver `loadLiveStockAlerts`).
 */

export type StockAlertType = 'out_of_stock' | 'low_stock';

export type LiveStockAlert = {
  key: string;
  type: StockAlertType;
  severity: 'critical' | 'warning';
  title: string;
  message: string;
  productId: string;
  metadata: Record<string, unknown>;
};

export type StockProduct = { id: string; name: string; sku: string; unit: string; minStock: number };

/** Forma de una fila de `daily_smart_alerts` tal como la usa la bandeja de alertas. */
export type SmartAlertRow = {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  last_detected_at: string | null;
  read_at?: string | null;
  read_by?: string | null;
  /** `true` cuando la alerta se calculó en vivo y no existe como fila guardada. */
  live?: boolean;
};

export type LiveStockResult = {
  alerts: LiveStockAlert[] | null;
  checkedAt: string | null;
  error: string | null;
};

type PageResult = { data: Array<Record<string, any>> | null; error: { message: string } | null; count?: number | null };

const PAGE_SIZE = 1000;
// Tope de seguridad (100 páginas por tabla). Si se supera, NO se calculan alertas en vivo:
// con datos incompletos se marcarían productos como agotados por error.
const MAX_PAGES = 100;

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

export function isStockAlertType(value: unknown): value is StockAlertType {
  return value === 'out_of_stock' || value === 'low_stock';
}

export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(Number(value.toFixed(4)));
}

/** Calcula las alertas de stock a partir de los productos y su existencia total. */
export function buildLiveStockAlerts(
  products: readonly StockProduct[],
  stockByProduct: ReadonlyMap<string, number>,
): LiveStockAlert[] {
  const outOfStock: LiveStockAlert[] = [];
  const lowStock: LiveStockAlert[] = [];

  for (const product of products) {
    const stock = stockByProduct.get(product.id) ?? 0;
    const minimum = Number.isFinite(product.minStock) && product.minStock > 0 ? product.minStock : 0;
    const name = product.name.trim() || 'Producto';
    const metadata = {
      productId: product.id,
      productName: name,
      sku: product.sku,
      stock: Math.max(0, stock),
      minimum,
    };

    if (stock <= 0) {
      outOfStock.push({
        key: `out_of_stock:${product.id}`,
        type: 'out_of_stock',
        severity: 'critical',
        title: `Sin stock: ${name}`,
        message: `Stock agotado (0 ${product.unit}).${minimum > 0 ? ` Mínimo configurado: ${formatQuantity(minimum)}.` : ''}`,
        productId: product.id,
        metadata,
      });
    } else if (stock < minimum) {
      lowStock.push({
        key: `low_stock:${product.id}`,
        type: 'low_stock',
        severity: 'warning',
        title: `Stock bajo: ${name}`,
        message: `Stock actual: ${formatQuantity(stock)} ${product.unit}; mínimo configurado: ${formatQuantity(minimum)}.`,
        productId: product.id,
        metadata,
      });
    }
  }

  const byTitle = (left: LiveStockAlert, right: LiveStockAlert) => left.title.localeCompare(right.title, 'es');
  return [...outOfStock.sort(byTitle), ...lowStock.sort(byTitle)];
}

function liveRow(alert: LiveStockAlert, checkedAt: string): SmartAlertRow {
  return {
    id: `live:${alert.key}`,
    alert_type: alert.type,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    metadata: alert.metadata,
    is_read: false,
    last_detected_at: checkedAt,
    read_at: null,
    read_by: null,
    live: true,
  };
}

/**
 * Combina las alertas guardadas con el estado de stock en vivo:
 * - Las alertas que no son de stock se dejan igual.
 * - Una alerta guardada de un producto que ya se repuso se oculta (la tarea diaria la cerraría luego).
 * - Si la condición sigue igual, se conserva la fila guardada (y su estado de lectura) con cifras al día.
 * - Si la condición cambió (p. ej. pasó de stock bajo a agotado), se reemplaza por la alerta en vivo.
 * - Los productos con alerta en vivo que aún no tienen fila guardada se agregan como alertas en vivo.
 * Si `live` es `null` (no se pudo revisar), se devuelven las alertas guardadas sin cambios.
 */
export function mergeStockAlerts(
  stored: readonly SmartAlertRow[],
  live: readonly LiveStockAlert[] | null,
  checkedAt: string,
): SmartAlertRow[] {
  if (!live) return [...stored];

  const liveByProduct = new Map(live.map((alert) => [alert.productId, alert]));
  const kept = new Set<string>();
  const merged: SmartAlertRow[] = [];

  for (const row of stored) {
    if (!isStockAlertType(row.alert_type)) {
      merged.push(row);
      continue;
    }
    const productId = typeof row.metadata?.productId === 'string' ? row.metadata.productId : '';
    if (!productId) {
      merged.push(row);
      continue;
    }
    const current = liveByProduct.get(productId);
    if (!current) continue;
    if (current.type === row.alert_type && !kept.has(productId)) {
      merged.push({
        ...row,
        severity: current.severity,
        title: current.title,
        message: current.message,
        metadata: { ...(row.metadata || {}), ...current.metadata },
      });
      kept.add(productId);
    }
  }

  for (const alert of live) {
    if (!kept.has(alert.productId)) merged.push(liveRow(alert, checkedAt));
  }
  return merged;
}

/** Ordena por urgencia: críticas primero, luego sin leer, luego las más recientes. */
export function prioritizeAlerts(rows: readonly SmartAlertRow[]): SmartAlertRow[] {
  return [...rows].sort((left, right) => {
    const severity = (SEVERITY_RANK[left.severity] ?? 3) - (SEVERITY_RANK[right.severity] ?? 3);
    if (severity !== 0) return severity;
    if (left.is_read !== right.is_read) return left.is_read ? 1 : -1;
    return String(right.last_detected_at || '').localeCompare(String(left.last_detected_at || ''));
  });
}

async function fetchAllRows(
  label: string,
  readPage: (from: number, to: number) => PromiseLike<PageResult>,
): Promise<Array<Record<string, any>>> {
  const rows: Array<Record<string, any>> = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    // El desplazamiento usa lo ya leído (no page * PAGE_SIZE): así no se saltan filas si el servidor
    // devuelve páginas más cortas de lo pedido (límite "max rows" de la API).
    const result = await readPage(rows.length, rows.length + PAGE_SIZE - 1);
    if (result.error) throw new Error(`${label}: ${result.error.message}`);
    const data = result.data || [];
    rows.push(...data);
    if (data.length === 0) return rows;
    const total = typeof result.count === 'number' && Number.isFinite(result.count) ? result.count : null;
    // Con el total exacto se sigue leyendo hasta completarlo; sin total, una página incompleta es el final.
    if (total !== null ? rows.length >= total : data.length < PAGE_SIZE) return rows;
  }
  throw new Error(`${label}: hay demasiados registros para revisar el stock en vivo`);
}

/** Lee productos y existencias de la empresa y devuelve sus alertas de stock actuales. */
export async function fetchLiveStockAlerts(
  supabase: Pick<SupabaseClient, 'from'>,
  tenantId: string,
): Promise<LiveStockAlert[]> {
  const warehouses = await fetchAllRows('warehouses', (from, to) => supabase
    .from('warehouses')
    .select('id', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .order('id')
    .range(from, to));
  const activeWarehouseIds = new Set(warehouses.map((row) => String(row.id)));
  // Sin almacenes activos no hay base para medir existencias: no se inventan alertas.
  if (activeWarehouseIds.size === 0) return [];

  const [productRows, stockRows] = await Promise.all([
    fetchAllRows('products', (from, to) => supabase
      .from('products')
      .select('id,name,sku,unit,min_stock', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .neq('item_type', 'service')
      .order('id')
      .range(from, to)),
    fetchAllRows('inventory_stocks', (from, to) => supabase
      .from('inventory_stocks')
      .select('product_id,warehouse_id,quantity', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('id')
      .range(from, to)),
  ]);

  const stockByProduct = new Map<string, number>();
  for (const row of stockRows) {
    if (!activeWarehouseIds.has(String(row.warehouse_id))) continue;
    const quantity = Number(row.quantity);
    if (!Number.isFinite(quantity)) continue;
    const productId = String(row.product_id);
    stockByProduct.set(productId, (stockByProduct.get(productId) || 0) + quantity);
  }

  const products: StockProduct[] = productRows.map((row) => ({
    id: String(row.id),
    name: String(row.name || ''),
    sku: String(row.sku || ''),
    unit: String(row.unit || 'unidad'),
    minStock: Number(row.min_stock),
  }));
  return buildLiveStockAlerts(products, stockByProduct);
}

/** Igual que `fetchLiveStockAlerts`, pero nunca lanza: ante un fallo devuelve `alerts: null`. */
export async function loadLiveStockAlerts(
  supabase: Pick<SupabaseClient, 'from'>,
  tenantId: string,
): Promise<LiveStockResult> {
  try {
    const alerts = await fetchLiveStockAlerts(supabase, tenantId);
    return { alerts, checkedAt: new Date().toISOString(), error: null };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown';
    console.error('live_stock_alerts_failed', { message });
    return { alerts: null, checkedAt: null, error: message.slice(0, 200) };
  }
}
