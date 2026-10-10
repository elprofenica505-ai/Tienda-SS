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
