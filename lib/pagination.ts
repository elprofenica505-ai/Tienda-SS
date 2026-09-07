export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

export function parsePageSize(value: unknown, fallback = DEFAULT_PAGE_SIZE): number {
  const parsed = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(parsed)));
}

export function parseCursor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cursor = value.trim();
  return cursor.length > 0 && cursor.length <= 256 ? cursor : undefined;
}

export function paginatedResponse<T>(items: readonly T[], pageSize: number, nextCursor?: string) {
  return {
    items,
    pageSize,
    hasMore: Boolean(nextCursor),
    nextCursor: nextCursor || null,
  };
}
