import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import type { TenantRole } from '@/lib/tenant';
import { getFinancialPeriod, localDateOfInstant } from '@/lib/financial-period';
import { summarizeFinancialDays } from '@/lib/financial-math';
import { financialFactsToSummaryFacts, loadFinancialFacts, salesPaymentTotal } from '@/lib/financial-records';
import { resolveTenantBranchIds } from '@/lib/organization-scope';
import { readAllSupabasePages, readSupabaseInBatches } from '@/lib/supabase/read-pages';

export const runtime = 'nodejs';
const TENANT_WIDE_ROLES = new Set<TenantRole>(['owner', 'admin', 'gerente', 'jefe']);
type Row = Record<string, any>;

function amount(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function productRelation(value: unknown): Row | null {
  if (Array.isArray(value)) return (value[0] as Row | undefined) || null;
  return value && typeof value === 'object' ? value as Row : null;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'reports', 'view');
    const supabase = getSupabaseServer();
    const wide = TENANT_WIDE_ROLES.has(context.role);
    const branchIds = wide ? [] : await resolveTenantBranchIds(context.tenantId, context.branchIds);
    const tenantResult = await supabase.from('tenants').select('timezone').eq('id', context.tenantId).single();
    if (tenantResult.error) throw new Error(tenantResult.error.message);
    const days = request.nextUrl.searchParams.get('days') || 30;
    const period = getFinancialPeriod(days, tenantResult.data.timezone);
    const dateOf = (instant: string) => localDateOfInstant(instant, period.timeZone);

    const facts = await loadFinancialFacts(supabase, { tenantId: context.tenantId, branchIds, tenantWide: wide, period });
    const summaryFacts = financialFactsToSummaryFacts(facts);
    const dates = Array.from({ length: period.days }, (_, index) => {
      const date = new Date(`${period.fromDate}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
    const series = summarizeFinancialDays({ ...summaryFacts, dates, dateOf });
    const inPeriodSales = facts.sales.filter((sale) => dateOf(String(sale.created_at || '')) >= period.fromDate && dateOf(String(sale.created_at || '')) <= period.toDate && sale.status !== 'voided');

    let cashMovements: Row[] = [];
    if (wide || branchIds.length > 0) {
      cashMovements = await readAllSupabasePages<Row>((from, to) => {
        let query = supabase
          .from('cash_movements')
          .select('amount,movement_type,created_at,cash_sessions!inner(branch_id)')
          .eq('tenant_id', context.tenantId)
          .gte('created_at', period.from)
          .lt('created_at', period.to)
          .order('created_at', { ascending: true })
          .range(from, to);
        if (!wide) query = query.in('cash_sessions.branch_id', branchIds);
        return query;
      });
    }
    const cashAdjustments = cashMovements
      .filter((movement) => movement.movement_type !== 'sale')
      .reduce((sum, movement) => sum + Number(movement.amount || 0), 0);

    const receivables = await readAllSupabasePages<Row>((from, to) => supabase
      .from('receivables')
      .select('id,sale_id,outstanding_amount')
      .eq('tenant_id', context.tenantId)
      .gt('outstanding_amount', 0)
      .order('created_at', { ascending: true })
      .range(from, to));
    let scopedReceivables = receivables;
    if (!wide) {
      const receivableSaleIds = Array.from(new Set(receivables.map((item) => String(item.sale_id || '')).filter(Boolean)));
      const relatedSales = await readSupabaseInBatches<Row>(receivableSaleIds, (batch) => supabase
        .from('sales')
        .select('id,branch_id')
        .eq('tenant_id', context.tenantId)
        .in('id', batch));
      const allowedSaleIds = new Set(relatedSales.filter((sale) => branchIds.includes(String(sale.branch_id))).map((sale) => String(sale.id)));
      scopedReceivables = receivables.filter((item) => item.sale_id && allowedSaleIds.has(String(item.sale_id)));
    }
    const receivableIds = new Set(scopedReceivables.map((item) => String(item.id)));
    const payments = await readAllSupabasePages<Row>((from, to) => supabase
      .from('receivable_payments')
      .select('id,receivable_id,amount,created_at')
      .eq('tenant_id', context.tenantId)
      .gte('created_at', period.from)
      .lt('created_at', period.to)
      .order('created_at', { ascending: true })
      .range(from, to));

    const paymentMethods = new Map<string, number>();
    for (const sale of inPeriodSales) {
      const payments = Array.isArray(sale.sale_payments) ? sale.sale_payments as Row[] : [];
      if (payments.length) {
        for (const payment of payments) {
          const method = String(payment.payment_method || 'unknown');
          paymentMethods.set(method, (paymentMethods.get(method) || 0) + amount(payment.amount));
        }
      } else {
        const metadata = sale.metadata && typeof sale.metadata === 'object' ? sale.metadata as Row : {};
        const method = String(metadata.paymentMethod || 'unknown');
        const paid = method === 'credit' ? amount(metadata.paidAmount) : amount(sale.total);
        paymentMethods.set(method, (paymentMethods.get(method) || 0) + paid);
      }
    }

    const topProducts = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const sale of inPeriodSales) {
      const lines = Array.isArray(sale.sale_items) ? sale.sale_items as Row[] : [];
      for (const line of lines) {
        const product = productRelation(line.products);
        const key = String(line.product_id || product?.name || 'unknown');
        const row = topProducts.get(key) || { name: String(product?.name || 'Producto'), quantity: 0, revenue: 0 };
        row.quantity += amount(line.quantity);
        row.revenue += amount(line.line_total);
        topProducts.set(key, row);
      }
    }

    const income = inPeriodSales.reduce((sum, sale) => sum + salesPaymentTotal(sale), 0);
    const openCredit = scopedReceivables.reduce((sum, item) => sum + amount(item.outstanding_amount), 0);
    const collectedCredit = payments
      .filter((payment) => receivableIds.has(String(payment.receivable_id || '')))
      .reduce((sum, payment) => sum + amount(payment.amount), 0);
    const recentExpenses = [...facts.expenses]
      .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
      .slice(0, 10)
      .map((item) => ({ id: item.id, description: item.description, amount: Number(item.amount || 0), category: item.category }));

    return NextResponse.json({
      ok: true,
      period: { days: period.days, from: period.from, to: new Date(period.to).toISOString(), timezone: period.timeZone },
      summary: {
        income,
        expenses: series.totals.expenses,
        cashAdjustments,
        net: income - series.totals.expenses + cashAdjustments,
        netSales: series.totals.netSales,
        profit: series.totals.profit,
        credits: series.totals.credits,
        sales: series.totals.salesCount,
        averageSale: series.totals.salesCount ? series.totals.netSales / series.totals.salesCount : 0,
        openCredit,
        collectedCredit,
      },
      daily: series.daily,
      paymentMethods: Array.from(paymentMethods, ([method, total]) => ({ method, total })).sort((left, right) => right.total - left.total),
      topProducts: Array.from(topProducts.values()).sort((left, right) => right.revenue - left.revenue).slice(0, 10),
      recentExpenses,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'FINANCIAL_EXPORT_TOO_LARGE') {
      return NextResponse.json({ error: 'El período contiene demasiados registros para procesar de una vez.' }, { status: 413 });
    }
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
