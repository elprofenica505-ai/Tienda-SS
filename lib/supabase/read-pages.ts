export const SUPABASE_PAGE_SIZE = 1_000;
export const MAX_FINANCIAL_EXPORT_ROWS = 50_000;

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/** Reads a PostgREST query in stable pages instead of silently stopping at 1,000 rows. */
export async function readAllSupabasePages<T>(
  buildPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  options: { pageSize?: number; maxRows?: number } = {},
): Promise<T[]> {
  const pageSize = options.pageSize || SUPABASE_PAGE_SIZE;
  const maxRows = options.maxRows || MAX_FINANCIAL_EXPORT_ROWS;
  const rows: T[] = [];

  for (let offset = 0; offset <= maxRows; offset += pageSize) {
    const result = await buildPage(offset, offset + pageSize - 1);
    if (result.error) throw new Error(result.error.message);
    const page = result.data || [];
    if (rows.length + page.length > maxRows) throw new Error('FINANCIAL_EXPORT_TOO_LARGE');
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }

  throw new Error('FINANCIAL_EXPORT_TOO_LARGE');
}

export async function readSupabaseInBatches<T>(
  values: string[],
  readBatch: (batch: string[]) => PromiseLike<PageResult<T>>,
  batchSize = 500,
): Promise<T[]> {
  const uniqueValues = Array.from(new Set(values.filter(Boolean)));
  const rows: T[] = [];
  for (let offset = 0; offset < uniqueValues.length; offset += batchSize) {
    const result = await readBatch(uniqueValues.slice(offset, offset + batchSize));
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data || []));
    if (rows.length > MAX_FINANCIAL_EXPORT_ROWS) throw new Error('FINANCIAL_EXPORT_TOO_LARGE');
  }
  return rows;
}
