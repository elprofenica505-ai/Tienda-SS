export const TRANSFER_STATUSES = ['draft', 'approved', 'in_transit', 'received', 'cancelled'] as const;

export type StockTransferStatus = (typeof TRANSFER_STATUSES)[number];

export type TransferLine = {
  productId: string;
  requested: number;
  shipped: number;
  received: number;
};

export type TransferItemInput = {
  productId: string;
  quantity: number;
  unitCost?: number;
};

const TRANSITIONS: Record<StockTransferStatus, readonly StockTransferStatus[]> = {
  draft: ['approved', 'cancelled'],
  approved: ['in_transit', 'cancelled'],
  in_transit: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};

export function isTransferStatus(value: string): value is StockTransferStatus {
  return (TRANSFER_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: StockTransferStatus, to: StockTransferStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminalTransferStatus(status: StockTransferStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function assertTransition(from: StockTransferStatus, to: StockTransferStatus): void {
  if (!canTransition(from, to)) throw new Error(`INVALID_TRANSFER_STATUS:${from}`);
}

export function availableStock(quantity: number, reserved: number): number {
  const available = quantity - reserved;
  if (available < 0) throw new Error('TRANSFER_STOCK_INCONSISTENT');
  return available;
}

export function assertTransferableStock(quantity: number, reserved: number, requested: number, productId: string): void {
  if (requested <= 0) throw new Error('INVALID_TRANSFER_QUANTITY');
  if (availableStock(quantity, reserved) < requested) throw new Error(`INSUFFICIENT_WAREHOUSE_STOCK:${productId}`);
}

export function pendingTransferQuantity(line: TransferLine): number {
  return line.shipped - line.received;
}

export function receiveTransferLine(line: TransferLine, receivedNow: number): { received: number; pending: number } {
  if (!Number.isInteger(receivedNow) || receivedNow <= 0) throw new Error('INVALID_TRANSFER_QUANTITY');
  if (receivedNow > pendingTransferQuantity(line)) throw new Error(`RECEIPT_EXCEEDS_PENDING:${line.productId}`);
  return { received: line.received + receivedNow, pending: pendingTransferQuantity(line) - receivedNow };
}

export function transferStatusAfterReceipt(lines: readonly TransferLine[]): Extract<StockTransferStatus, 'in_transit' | 'received'> {
  const hasPendingLine = lines.some((line) => line.received < line.shipped);
  return hasPendingLine ? 'in_transit' : 'received';
}

export function validateTransferItems(items: readonly TransferItemInput[]): TransferItemInput[] {
  if (items.length === 0) throw new Error('TRANSFER_ITEMS_REQUIRED');
  const seen = new Set<string>();
  const normalized: TransferItemInput[] = [];
  for (const item of items) {
    if (!item.productId) throw new Error('INVALID_TRANSFER_ITEM');
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error('INVALID_TRANSFER_QUANTITY');
    if (seen.has(item.productId)) throw new Error('TRANSFER_DUPLICATE_PRODUCT');
    seen.add(item.productId);
    normalized.push({ productId: item.productId, quantity: item.quantity, unitCost: Math.max(item.unitCost || 0, 0) });
  }
  return normalized;
}

export function transferNumberFor(year: number, sequence: number): string {
  return `TRF-${year}-${String(sequence).padStart(6, '0')}`;
}

export function transferTotals(lines: readonly TransferLine[]): { requested: number; shipped: number; received: number; pending: number } {
  return lines.reduce(
    (totals, line) => ({
      requested: totals.requested + line.requested,
      shipped: totals.shipped + line.shipped,
      received: totals.received + line.received,
      pending: totals.pending + pendingTransferQuantity(line),
    }),
    { requested: 0, shipped: 0, received: 0, pending: 0 },
  );
}

/** Códigos que levanta el SQL de la Fase 1A y su traducción para el navegador. */
const TRANSFER_ERROR_CODES: ReadonlyArray<readonly [code: string, status: number, message: string]> = [
  ['INSUFFICIENT_STOCK:RESERVED', 409, 'El movimiento dejaría el stock por debajo de las unidades apartadas.'],
  ['INSUFFICIENT_WAREHOUSE_STOCK', 409, 'No hay existencia disponible suficiente en el almacén de origen.'],
  ['INSUFFICIENT_STOCK', 409, 'El movimiento dejaría el inventario en negativo.'],
  ['RECEIPT_EXCEEDS_PENDING', 409, 'La recepción supera las unidades que siguen en tránsito.'],
  ['INVALID_TRANSFER_STATUS', 409, 'La transferencia está en un estado que no admite esa operación.'],
  ['TRANSFER_NOT_APPROVED', 409, 'La línea no está aprobada para despacho.'],
  ['TRANSFER_STOCK_INCONSISTENT', 409, 'El stock del almacén no cuadra con la transferencia.'],
  ['TRANSFER_IN_TRANSIT_INCONSISTENT', 409, 'Las unidades en tránsito del almacén destino no cuadran.'],
  ['TRANSFER_STOCK_ROW_NOT_FOUND', 409, 'El almacén de origen no tiene registrada la existencia del producto.'],
  ['TRANSFER_SAME_WAREHOUSE', 400, 'El almacén de origen y el de destino no pueden ser el mismo.'],
  ['WAREHOUSE_REQUIRED', 400, 'Indica el almacén de origen y el almacén de destino.'],
  ['TRANSFER_ITEMS_REQUIRED', 400, 'La transferencia necesita al menos un producto con cantidad.'],
  ['TRANSFER_DUPLICATE_PRODUCT', 400, 'Un mismo producto no puede repetirse en la transferencia.'],
  ['TRANSFER_TOO_MANY_ITEMS', 400, 'La transferencia admite hasta 50 productos por operación.'],
  ['INVALID_TRANSFER_ITEM', 400, 'Hay productos inválidos en la transferencia.'],
  ['INVALID_TRANSFER_QUANTITY', 400, 'Las cantidades deben ser números enteros mayores que cero.'],
  ['SERVICE_NOT_TRANSFERABLE', 400, 'Los servicios no se transfieren entre almacenes.'],
  ['TRANSFER_REQUIRED', 400, 'Indica la transferencia que quieres procesar.'],
  ['TRANSFER_NOT_FOUND', 404, 'La transferencia no existe en esta empresa.'],
  ['TRANSFER_ITEM_NOT_FOUND', 404, 'La línea de la transferencia no existe.'],
  ['ORIGIN_WAREHOUSE_NOT_FOUND', 404, 'El almacén de origen no existe o está inactivo.'],
  ['DESTINATION_WAREHOUSE_NOT_FOUND', 404, 'El almacén de destino no existe o está inactivo.'],
  ['WAREHOUSE_NOT_FOUND', 404, 'El almacén no existe o está inactivo.'],
  ['PRODUCT_NOT_FOUND', 404, 'Uno de los productos no existe o está archivado.'],
];

export function transferErrorMapping(code: string): { status: number; message: string } | null {
  for (const [prefix, status, message] of TRANSFER_ERROR_CODES) {
    if (code === prefix || code.startsWith(`${prefix}:`)) return { status, message };
  }
  return null;
}

/** Traduce un código del SQL de transferencias; devuelve null cuando el código no pertenece a este módulo. */
export function transferErrorResponse(error: unknown): { status: number; body: { error: string; code: string } } | null {
  const code = error instanceof Error ? error.message.trim() : typeof error === 'string' ? error.trim() : '';
  if (!code) return null;
  const mapping = transferErrorMapping(code);
  if (!mapping) return null;
  return { status: mapping.status, body: { error: mapping.message, code } };
}

export type TransferItemDraft = { productId: string; quantity: number; unitCost?: number };
export type ReceiptItemDraft = { transferItemId?: string; productId?: string; quantity: number };

const MAX_TRANSFER_ITEMS = 50;

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function wholeQuantity(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

/**
 * Normaliza las líneas de una transferencia nueva. Acepta el formato canónico
 * `items: [{ productId, quantity, unitCost? }]` y el atajo de una sola línea
 * `{ productId, quantity }`. `unitCost` se omite cuando no viene para que el SQL
 * use el costo del producto.
 */
export function parseTransferItems(body: Record<string, unknown>): TransferItemDraft[] {
  const rawItems = Array.isArray(body.items)
    ? body.items
    : text(body.productId, 128)
      ? [{ productId: body.productId, quantity: body.quantity, unitCost: body.unitCost }]
      : [];
  if (rawItems.length === 0) throw new Error('TRANSFER_ITEMS_REQUIRED');
  if (rawItems.length > MAX_TRANSFER_ITEMS) throw new Error('TRANSFER_TOO_MANY_ITEMS');
  const seen = new Set<string>();
  return rawItems.map((raw) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const productId = text(item.productId, 128);
    const quantity = wholeQuantity(item.quantity);
    const unitCost = typeof item.unitCost === 'number' && Number.isFinite(item.unitCost) && item.unitCost > 0 ? Math.round(item.unitCost * 10000) / 10000 : undefined;
    if (!productId) throw new Error('INVALID_TRANSFER_ITEM');
    if (!quantity) throw new Error('INVALID_TRANSFER_QUANTITY');
    if (seen.has(productId)) throw new Error('TRANSFER_DUPLICATE_PRODUCT');
    seen.add(productId);
    return unitCost === undefined ? { productId, quantity } : { productId, quantity, unitCost };
  });
}

/** Normaliza una recepción parcial: admite `transferItemId` o `productId` y `quantity` o `receivedQuantity`. */
export function parseReceiptItems(body: Record<string, unknown>): ReceiptItemDraft[] {
  const rawItems = Array.isArray(body.items)
    ? body.items
    : text(body.transferItemId, 128) || text(body.productId, 128)
      ? [{ transferItemId: body.transferItemId, productId: body.productId, quantity: body.quantity ?? body.receivedQuantity }]
      : [];
  if (rawItems.length === 0) throw new Error('TRANSFER_ITEMS_REQUIRED');
  if (rawItems.length > MAX_TRANSFER_ITEMS) throw new Error('TRANSFER_TOO_MANY_ITEMS');
  const seen = new Set<string>();
  return rawItems.map((raw) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const transferItemId = text(item.transferItemId, 128);
    const productId = text(item.productId, 128);
    const quantity = wholeQuantity(item.quantity ?? item.receivedQuantity);
    if (!transferItemId && !productId) throw new Error('INVALID_TRANSFER_ITEM');
    if (!quantity) throw new Error('INVALID_TRANSFER_QUANTITY');
    const key = transferItemId || `product:${productId}`;
    if (seen.has(key)) throw new Error('TRANSFER_DUPLICATE_PRODUCT');
    seen.add(key);
    if (transferItemId) return { transferItemId, quantity };
    return { productId, quantity };
  });
}

export function nextTransferSequence(existingNumbers: readonly string[], year: number): number {
  const prefix = `TRF-${year}-`;
  let highest = 0;
  for (const value of existingNumbers) {
    if (!value.startsWith(prefix)) continue;
    const sequence = Number(value.slice(prefix.length));
    if (Number.isInteger(sequence) && sequence > highest) highest = sequence;
  }
  return highest + 1;
}
