import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantContext } from '@/lib/tenant';
import { resolveTenantBranchIds } from '@/lib/branch-scope';
import {
  calculateFinancialReport,
  type FinancialCreditCollectionInput,
  type FinancialCreditIssueInput,
  type FinancialExpenseInput,
  type FinancialReportDataset,
  type FinancialReportPeriod,
  type FinancialReturnInput,
  type FinancialSaleInput,
  type HistoricalCostMovementInput,
} from '@/lib/financial-reports';

const REPORT_MANAGER_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);
const PAGE_SIZE = 1_000;
const ID_BATCH_SIZE = 100;

type QueryResult<T> = { data: T[] | null; error: { message: string } | null };
type RawRow = Record<string, any>;

export type FinancialReportScope = {
  /** null means all branches in the authenticated tenant; an array is always an explicit allowlist. */
  branchIds: string[] | null;
  branchId: string | null;
};

export type FinancialTenantSettings = {
  timezone: string;
  currency: string;
  plan: string;
};

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown): number {
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : 0;
}

function relation(value: unknown): RawRow | null {
  if (Array.isArray(value)) return (value[0] as RawRow | undefined) || null;
  return value && typeof value === 'object' ? value as RawRow : null;
}

async function fetchPaged<T>(fetchPage: (from: number, to: number) => PromiseLike<QueryResult<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await fetchPage(offset, offset + PAGE_SIZE - 1);
    if (result.error) throw new Error(result.error.message);
    const page = result.data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function branchFiltered(query: any, scope: FinancialReportScope, field = 'branch_id') {
  return scope.branchIds ? query.in(field, scope.branchIds) : query;
}

async function fetchByIds<T>(
  supabase: SupabaseClient,
  table: string,
  ids: string[],
  select: string,
  tenantId: string,
  options: { idColumn?: string; branchScope?: FinancialReportScope; branchField?: string; extra?: (query: any) => any } = {},
): Promise<T[]> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) return [];
  const db = supabase as any;
  const rows: T[] = [];
  for (let start = 0; start < uniqueIds.length; start += ID_BATCH_SIZE) {
    const batch = uniqueIds.slice(start, start + ID_BATCH_SIZE);
    const result = await fetchPaged<T>((from, to) => {
      let query = db.from(table).select(select).eq('tenant_id', tenantId).in(options.idColumn || 'id', batch).order('id', { ascending: true });
      if (options.branchScope) query = branchFiltered(query, options.branchScope, options.branchField || 'branch_id');
      if (options.extra) query = options.extra(query);
      return query.range(from, to);
    });
    rows.push(...result);
  }
  return rows;
}

export async function getFinancialTenantSettings(supabase: SupabaseClient, tenantId: string): Promise<FinancialTenantSettings> {
  const result = await (supabase as any).from('tenants').select('timezone,currency,plan').eq('id', tenantId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  const timezone = asText(result.data?.timezone, 'America/Managua');
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format(new Date());
  } catch {
    return { timezone: 'America/Managua', currency: asText(result.data?.currency, 'NIO'), plan: asText(result.data?.plan, 'starter') };
  }
  return {
    timezone,
    currency: asText(result.data?.currency, 'NIO'),
    plan: asText(result.data?.plan, 'starter'),
  };
}

export async function resolveFinancialReportScope(
  supabase: SupabaseClient,
  context: Pick<TenantContext, 'tenantId' | 'role' | 'branchIds'>,
  requestedBranchId = '',
): Promise<FinancialReportScope> {
  const requested = requestedBranchId.trim().slice(0, 128);
  const isManager = REPORT_MANAGER_ROLES.has(context.role);
  if (requested) {
    const resolved = (await resolveTenantBranchIds(supabase, context.tenantId, [requested]))[0];
    if (!resolved) throw new Error('BRANCH_NOT_FOUND');
    if (!isManager) {
      const assigned = await resolveTenantBranchIds(supabase, context.tenantId, context.branchIds.slice(0, 500));
      if (!assigned.includes(resolved)) throw new Error('BRANCH_OUT_OF_SCOPE');
    }
    return { branchIds: [resolved], branchId: resolved };
  }
  if (isManager) return { branchIds: null, branchId: null };
  const assigned = await resolveTenantBranchIds(supabase, context.tenantId, context.branchIds.slice(0, 500));
  if (!assigned.length) throw new Error('BRANCH_OUT_OF_SCOPE');
  return { branchIds: assigned, branchId: null };
}

function normalizeSale(row: RawRow): FinancialSaleInput {
  return {
    id: asText(row.id),
    branchId: asText(row.branch_id),
    invoiceNumber: asText(row.invoice_number, asText(row.id)),
    status: asText(row.status),
    total: asNumber(row.total),
    createdAt: asText(row.created_at),
    items: (Array.isArray(row.sale_items) ? row.sale_items : []).map((item: RawRow) => {
      const product = relation(item.products);
      return {
        id: asText(item.id),
        productId: asText(item.product_id),
        warehouseId: asText(item.warehouse_id),
        productName: asText(product?.name, 'Producto'),
        itemType: asText(product?.item_type, 'product'),
        quantity: asNumber(item.quantity),
        unitPrice: asNumber(item.unit_price),
        lineTotal: asNumber(item.line_total),
      };
    }),
    payments: (Array.isArray(row.sale_payments) ? row.sale_payments : []).map((payment: RawRow) => ({
      paymentMethod: asText(payment.payment_method, 'other'),
      amount: asNumber(payment.amount),
    })),
  };
}

function normalizeReceivable(row: RawRow): FinancialCreditIssueInput {
  const sale = relation(row.sales);
  const customer = relation(row.customers);
  return {
    id: asText(row.id),
    saleId: asText(row.sale_id),
    saleNumber: asText(sale?.invoice_number, asText(row.sale_id)),
    customerName: asText(customer?.name, 'Cliente sin identificar'),
    originalAmount: asNumber(row.original_amount),
    outstandingAmount: asNumber(row.outstanding_amount),
    status: asText(row.status),
    createdAt: asText(row.created_at),
  };
}

function normalizeExpense(row: RawRow): FinancialExpenseInput {
  return {
    id: asText(row.id),
    branchId: asText(row.branch_id),
    description: asText(row.description, 'Gasto'),
    category: asText(row.category, 'General'),
    paymentMethod: asText(row.payment_method, '—'),
    amount: asNumber(row.amount),
    createdAt: asText(row.created_at),
  };
}

export async function loadFinancialReportDataset(input: {
  supabase: SupabaseClient;
  tenantId: string;
  period: FinancialReportPeriod;
  settings: FinancialTenantSettings;
  scope: FinancialReportScope;
}): Promise<FinancialReportDataset> {
  const { supabase, tenantId, period, settings, scope } = input;
  const db = supabase as any;
  const salesSelect = 'id,branch_id,invoice_number,status,total,created_at,sale_items(id,product_id,warehouse_id,quantity,unit_price,line_total,products(name,item_type)),sale_payments(id,payment_method,amount,created_at)';
  const receivableSelect = 'id,sale_id,original_amount,outstanding_amount,status,created_at,customers(name),sales!inner(id,branch_id,invoice_number,created_at)';

  const [salesRows, expenseRows, returnRows, issuedReceivableRows, openReceivableRows, paymentRows] = await Promise.all([
    fetchPaged<RawRow>((from, to) => {
      let query = db.from('sales').select(salesSelect).eq('tenant_id', tenantId)
        .in('status', ['completed', 'returned'])
        .gte('created_at', period.from).lt('created_at', period.to)
        .order('created_at', { ascending: true }).order('id', { ascending: true });
      query = branchFiltered(query, scope);
      return query.range(from, to);
    }),
    fetchPaged<RawRow>((from, to) => {
      let query = db.from('expenses').select('id,branch_id,description,amount,category,payment_method,created_at')
        .eq('tenant_id', tenantId).gte('created_at', period.from).lt('created_at', period.to)
        .order('created_at', { ascending: true }).order('id', { ascending: true });
      query = branchFiltered(query, scope);
      return query.range(from, to);
    }),
    fetchPaged<RawRow>((from, to) => {
      let query = db.from('sale_returns').select('id,sale_id,branch_id,amount,refund_method,status,created_at')
        .eq('tenant_id', tenantId).eq('status', 'completed')
        .gte('created_at', period.from).lt('created_at', period.to)
        .order('created_at', { ascending: true }).order('id', { ascending: true });
      query = branchFiltered(query, scope);
      return query.range(from, to);
    }),
    fetchPaged<RawRow>((from, to) => {
      let query = db.from('receivables').select(receivableSelect).eq('tenant_id', tenantId)
        .gte('created_at', period.from).lt('created_at', period.to)
        .order('created_at', { ascending: true }).order('id', { ascending: true });
      query = branchFiltered(query, scope, 'sales.branch_id');
      return query.range(from, to);
    }),
    fetchPaged<RawRow>((from, to) => {
      let query = db.from('receivables').select(receivableSelect).eq('tenant_id', tenantId)
        .in('status', ['open', 'partial', 'overdue']).gt('outstanding_amount', 0)
        .order('created_at', { ascending: true }).order('id', { ascending: true });
      query = branchFiltered(query, scope, 'sales.branch_id');
      return query.range(from, to);
    }),
    fetchPaged<RawRow>((from, to) => db.from('receivable_payments')
      .select('id,receivable_id,customer_id,receipt_number,amount,payment_method,created_at')
      .eq('tenant_id', tenantId).gte('created_at', period.from).lt('created_at', period.to)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)),
  ]);

  const returnIds = returnRows.map((row) => asText(row.id));
  const returnItemRows = await fetchByIds<RawRow>(supabase, 'sale_return_items', returnIds, 'id,return_id,sale_id,product_id,warehouse_id,quantity,unit_price,amount', tenantId, {
    idColumn: 'return_id',
  });

  const paymentIds = paymentRows.map((row) => asText(row.id));
  const allocationRows = await fetchByIds<RawRow>(supabase, 'receivable_payment_allocations', paymentIds, 'id,payment_id,receivable_id,amount', tenantId, {
    idColumn: 'payment_id',
  });
  const linkedReceivableIds = [
    ...allocationRows.map((row) => asText(row.receivable_id)),
    ...paymentRows.map((row) => asText(row.receivable_id)),
  ];
  const linkedReceivableRows = await fetchByIds<RawRow>(supabase, 'receivables', linkedReceivableIds, receivableSelect, tenantId, {
    branchScope: scope,
    branchField: 'sales.branch_id',
  });

  const receivableRowsById = new Map<string, RawRow>();
  for (const row of [...issuedReceivableRows, ...openReceivableRows, ...linkedReceivableRows]) {
    const id = asText(row.id);
    if (id) receivableRowsById.set(id, row);
  }
  const creditIssues = issuedReceivableRows.map(normalizeReceivable);
  const openReceivables = openReceivableRows.map(normalizeReceivable);

  const allocationsByPayment = new Map<string, RawRow[]>();
  for (const row of allocationRows) {
    const paymentId = asText(row.payment_id);
    const bucket = allocationsByPayment.get(paymentId) || [];
    bucket.push(row);
    allocationsByPayment.set(paymentId, bucket);
  }
  const creditCollections: FinancialCreditCollectionInput[] = [];
  for (const payment of paymentRows) {
    const paymentId = asText(payment.id);
    const allocations = allocationsByPayment.get(paymentId) || [];
    const appliedRows = allocations.length
      ? allocations.map((row) => ({ receivableId: asText(row.receivable_id), amount: asNumber(row.amount) }))
      : asText(payment.receivable_id)
        ? [{ receivableId: asText(payment.receivable_id), amount: asNumber(payment.amount) }]
        : [];
    for (let index = 0; index < appliedRows.length; index += 1) {
      const allocation = appliedRows[index];
      const receivable = receivableRowsById.get(allocation.receivableId);
      if (!receivable || allocation.amount <= 0) continue;
      const normalized = normalizeReceivable(receivable);
      creditCollections.push({
        id: `${paymentId}:${normalized.id}:${index}`,
        paymentId,
        saleId: normalized.saleId,
        saleNumber: normalized.saleNumber,
        customerName: normalized.customerName,
        receiptNumber: asText(payment.receipt_number, paymentId),
        paymentMethod: asText(payment.payment_method, 'other'),
        amount: allocation.amount,
        createdAt: asText(payment.created_at),
      });
    }
  }

  const salesById = new Map<string, RawRow>(salesRows.map((row) => [asText(row.id), row]));
  const returnSaleIds = Array.from(new Set(returnRows.map((row) => asText(row.sale_id)).filter((id) => id && !salesById.has(id))));
  const olderReturnSales = await fetchByIds<RawRow>(supabase, 'sales', returnSaleIds, 'id,branch_id,invoice_number,status,total,created_at', tenantId, {
    branchScope: scope,
  });
  for (const row of olderReturnSales) salesById.set(asText(row.id), row);

  const normalizedSales = salesRows.map(normalizeSale);
  const movementReferenceIds = Array.from(new Set([
    ...salesRows.map((row) => asText(row.id)),
    ...returnRows.map((row) => asText(row.sale_id)),
  ].filter(Boolean)));
  const movementRows = await fetchByIds<RawRow>(supabase, 'inventory_movements', movementReferenceIds,
    'id,reference_id,product_id,warehouse_id,movement_type,quantity,unit_cost', tenantId, {
      idColumn: 'reference_id',
      extra: (query) => query.eq('reference_type', 'sale').eq('movement_type', 'sale'),
    });
  const movements: HistoricalCostMovementInput[] = movementRows.map((row) => ({
    saleId: asText(row.reference_id),
    productId: asText(row.product_id),
    warehouseId: asText(row.warehouse_id),
    quantity: asNumber(row.quantity),
    unitCost: asNumber(row.unit_cost),
  }));

  const returnItemsById = new Map<string, RawRow[]>();
  for (const row of returnItemRows) {
    const returnId = asText(row.return_id);
    const bucket = returnItemsById.get(returnId) || [];
    bucket.push(row);
    returnItemsById.set(returnId, bucket);
  }
  const normalizedReturns: FinancialReturnInput[] = returnRows.map((row) => {
    const originalSale = salesById.get(asText(row.sale_id));
    return {
      id: asText(row.id),
      saleId: asText(row.sale_id),
      invoiceNumber: asText(originalSale?.invoice_number, asText(row.sale_id)),
      refundMethod: asText(row.refund_method, 'other'),
      amount: asNumber(row.amount),
      status: asText(row.status),
      createdAt: asText(row.created_at),
      items: (returnItemsById.get(asText(row.id)) || []).map((item) => ({
        id: asText(item.id),
        saleId: asText(item.sale_id),
        productId: asText(item.product_id),
        warehouseId: asText(item.warehouse_id),
        productName: 'Producto',
        quantity: asNumber(item.quantity),
        unitPrice: asNumber(item.unit_price),
        amount: asNumber(item.amount),
      })),
    };
  });

  return calculateFinancialReport({
    period,
    currency: settings.currency,
    branchId: scope.branchId,
    sales: normalizedSales,
    movements,
    returns: normalizedReturns,
    expenses: expenseRows.map(normalizeExpense),
    creditIssues,
    creditCollections,
    openReceivables,
  });
}
