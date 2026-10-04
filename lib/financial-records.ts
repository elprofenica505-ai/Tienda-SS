import type { getSupabaseServer } from '@/lib/supabase/server';
import type { FinancialPeriod } from '@/lib/financial-period';
import { readAllSupabasePages, readSupabaseInBatches } from '@/lib/supabase/read-pages';

type SupabaseServer = ReturnType<typeof getSupabaseServer>;
type Row = Record<string, any>;

export type FinancialFacts = {
  sales: Row[];
  expenses: Row[];
  returns: Row[];
  returnItems: Row[];
  costs: Row[];
};

function branchScoped(query: any, tenantWide: boolean, branchIds: string[], column = 'branch_id') {
  return tenantWide ? query : query.in(column, branchIds);
}

/** Loads the sale, return, expense and historical cost facts used by both reports and Excel. */
export async function loadFinancialFacts(
  supabase: SupabaseServer,
  options: {
    tenantId: string;
    branchIds: string[];
    tenantWide: boolean;
    period: FinancialPeriod;
  },
): Promise<FinancialFacts> {
  const { tenantId, branchIds, tenantWide, period } = options;
  if (!tenantWide && branchIds.length === 0) {
    return { sales: [], expenses: [], returns: [], returnItems: [], costs: [] };
  }

  const [sales, expenses, returns] = await Promise.all([
    readAllSupabasePages<Row>((from, to) => {
      let query = supabase
        .from('sales')
        .select('id,branch_id,invoice_number,status,subtotal,tax,discount,total,customer_id,sold_by,metadata,created_at,sale_payments(payment_method,amount,reference),sale_items(product_id,quantity,unit_price,line_total,products(name,sku))')
        .eq('tenant_id', tenantId)
        .gte('created_at', period.from)
        .lt('created_at', period.to)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);
      query = branchScoped(query, tenantWide, branchIds);
      return query;
    }),
    readAllSupabasePages<Row>((from, to) => {
      let query = supabase
        .from('expenses')
        .select('id,branch_id,description,amount,category,payment_method,notes,created_by,created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', period.from)
        .lt('created_at', period.to)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);
      query = branchScoped(query, tenantWide, branchIds);
      return query;
    }),
    readAllSupabasePages<Row>((from, to) => {
      let query = supabase
        .from('sale_returns')
        .select('id,sale_id,branch_id,amount,refund_method,reason,created_by,created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', period.from)
        .lt('created_at', period.to)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);
      query = branchScoped(query, tenantWide, branchIds);
      return query;
    }),
  ]);

  const salesById = new Map(sales.map((sale) => [String(sale.id), sale]));
  const missingReturnSaleIds = Array.from(new Set(returns.map((item) => String(item.sale_id || '')).filter((id) => id && !salesById.has(id))));
  const relatedSales = await readSupabaseInBatches<Row>(missingReturnSaleIds, (batch) => {
    let query = supabase
      .from('sales')
      .select('id,branch_id,invoice_number,status,subtotal,tax,discount,total,customer_id,sold_by,metadata,created_at,sale_payments(payment_method,amount,reference),sale_items(product_id,quantity,unit_price,line_total,products(name,sku))')
      .eq('tenant_id', tenantId)
      .in('id', batch);
    query = branchScoped(query, tenantWide, branchIds);
    return query;
  });
  for (const sale of relatedSales) salesById.set(String(sale.id), sale);

  const returnIds = returns.map((item) => String(item.id));
  const returnItems = await readSupabaseInBatches<Row>(returnIds, (batch) => supabase
    .from('sale_return_items')
    .select('return_id,sale_id,product_id,quantity,unit_price,amount')
    .eq('tenant_id', tenantId)
    .in('return_id', batch));

  const saleIds = Array.from(salesById.keys());
  const costs = await readSupabaseInBatches<Row>(saleIds, (batch) => supabase
    .from('inventory_movements')
    .select('reference_id,product_id,quantity,unit_cost')
    .eq('tenant_id', tenantId)
    .eq('movement_type', 'sale')
    .eq('reference_type', 'sale')
    .in('reference_id', batch));

  return { sales: Array.from(salesById.values()), expenses, returns, returnItems, costs };
}

export function financialFactsToSummaryFacts(facts: FinancialFacts) {
  return {
    sales: facts.sales.map((sale) => {
      const metadata = sale.metadata && typeof sale.metadata === 'object' ? sale.metadata as Record<string, unknown> : {};
      const payments = Array.isArray(sale.sale_payments)
        ? sale.sale_payments.map((payment: Row) => ({ method: String(payment.payment_method || ''), amount: Number(payment.amount || 0) }))
        : [];
      const creditAmount = Number(metadata.creditAmount || 0);
      return {
        id: String(sale.id),
        createdAt: String(sale.created_at || ''),
        status: String(sale.status || ''),
        total: Number(sale.total || 0),
        creditAmount: creditAmount > 0 ? creditAmount : undefined,
        paymentMethod: String(metadata.paymentMethod || ''),
        payments,
      };
    }),
    returns: facts.returns.map((item) => ({
      id: String(item.id),
      saleId: String(item.sale_id),
      createdAt: String(item.created_at || ''),
      amount: Number(item.amount || 0),
      refundMethod: String(item.refund_method || ''),
    })),
    expenses: facts.expenses.map((item) => ({ createdAt: String(item.created_at || ''), amount: Number(item.amount || 0) })),
    costs: facts.costs.map((item) => ({
      saleId: String(item.reference_id || ''),
      productId: String(item.product_id || ''),
      quantity: Number(item.quantity || 0),
      unitCost: Number(item.unit_cost || 0),
    })),
    returnedItems: facts.returnItems.map((item) => ({
      returnId: String(item.return_id || ''),
      productId: String(item.product_id || ''),
      quantity: Number(item.quantity || 0),
    })),
  };
}

export function salesPaymentTotal(sale: Row): number {
  const payments = Array.isArray(sale.sale_payments) ? sale.sale_payments as Row[] : [];
  if (payments.length) return payments.filter((payment) => payment.payment_method !== 'credit').reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const metadata = sale.metadata && typeof sale.metadata === 'object' ? sale.metadata as Record<string, unknown> : {};
  if (Number.isFinite(Number(metadata.paidAmount))) return Number(metadata.paidAmount || 0);
  return metadata.paymentMethod === 'credit' ? 0 : Number(sale.total || 0);
}

export function salesCreditTotal(sale: Row): number {
  const payments = Array.isArray(sale.sale_payments) ? sale.sale_payments as Row[] : [];
  if (payments.length) return payments.filter((payment) => payment.payment_method === 'credit').reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const metadata = sale.metadata && typeof sale.metadata === 'object' ? sale.metadata as Record<string, unknown> : {};
  const creditAmount = Number(metadata.creditAmount || 0);
  if (creditAmount > 0) return creditAmount;
  return metadata.paymentMethod === 'credit' ? Number(sale.total || 0) : 0;
}
