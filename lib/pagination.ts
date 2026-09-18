export const MAX_PAGE_SIZE = 25;
export const DEFAULT_PAGE_SIZE = 25;
export function parsePageSize(value: unknown, fallback = DEFAULT_PAGE_SIZE): number {
  const parsed = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(parsed)));
}
export function parsePage(value: unknown, fallback = 1): number {
  const parsed = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}
export function pageRange(page: number, pageSize = DEFAULT_PAGE_SIZE): { from: number; to: number } {
  const safePage = parsePage(page);
  const safeSize = parsePageSize(pageSize);
  const from = (safePage - 1) * safeSize;
  return { from, to: from + safeSize - 1 };
}
export function parseCursor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cursor = value.trim();
  return cursor.length > 0 && cursor.length <= 256 ? cursor : undefined;
}
export function paginatedResponse<T>(items: readonly T[], pageSize: number, nextCursor?: string, page = 1, total?: number | null) {
  return { items, pageSize, page, total: total ?? null, hasMore: Boolean(nextCursor), nextCursor: nextCursor || null };
}
