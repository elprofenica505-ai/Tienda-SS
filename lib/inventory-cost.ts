export function inventoryNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(0, value) * 10000) / 10000 : 0;
}

export function stockKey(warehouseId: string, productId: string): string {
  return `${warehouseId}__${productId}`;
}

export function weightedAverageCost(currentQuantity: number, currentCost: number, receivedQuantity: number, receivedCost: number): number {
  const totalQuantity = currentQuantity + receivedQuantity;
  if (totalQuantity <= 0) return 0;
  return Math.round(((currentQuantity * currentCost) + (receivedQuantity * receivedCost)) / totalQuantity * 10000) / 10000;
}

export function stockAfterDelta(currentQuantity: number, delta: number): number {
  const next = currentQuantity + delta;
  if (next < 0) throw new Error('INSUFFICIENT_WAREHOUSE_STOCK');
  return Math.round(next * 10000) / 10000;
}
