import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import type { TenantRole } from '@/lib/tenant';
import { getFinancialPeriod, localDateOfInstant } from '@/lib/financial-period';
import { summarizeFinancialDays } from '@/lib/financial-math';
import { financialFactsToSummaryFacts, loadFinancialFacts, salesCreditTotal, salesPaymentTotal } from '@/lib/financial-records';
import { resolveTenantBranchIds } from '@/lib/organization-scope';
import { readAllSupabasePages, readSupabaseInBatches } from '@/lib/supabase/read-pages';
import { reportExportQuotaFailure } from '@/lib/report-export-quota';

export const runtime = 'nodejs';
const TENANT_WIDE_ROLES = new Set<TenantRole>(['owner', 'admin', 'gerente', 'jefe']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Row = Record<string, any>;

function record(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}

function relation(value: unknown): Row {
  if (Array.isArray(value)) return record(value[0]);
  return record(value);
}

function number(value: unknown): number {
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : 0;
}

function saleItems(sale: Row, productNames?: Map<string, Row>) {
  const lines = Array.isArray(sale.sale_items) ? sale.sale_items as Row[] : [];
  return lines.map((line) => {
    const product = relation(line.products);
    const fallback = productNames?.get(String(line.product_id || '')) || {};
    return {
      productId: String(line.product_id || ''),
      name: String(product.name || fallback.name || 'Producto'),
      sku: String(product.sku || fallback.sku || ''),
      quantity: number(line.quantity),
      unitPrice: number(line.unit_price),
      lineTotal: number(line.line_total),
      total: number(line.line_total),
    };
  });
}

function payments(sale: Row) {
  const rows = Array.isArray(sale.sale_payments) ? sale.sale_payments as Row[] : [];
  return rows.map((payment) => ({ method: String(payment.payment_method || 'otro'), amount: number(payment.amount) }));
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'reports', 'export');
    const supabase = getSupabaseServer();
    const tenantResult = await supabase.from('tenants').select('id,name,timezone,currency').eq('id', context.tenantId).single();
    if (tenantResult.error) throw new Error(tenantResult.error.message);
    const tenant = tenantResult.data;
    const timeZone = String(tenant.timezone || 'America/Managua');
    const period = getFinancialPeriod(365, timeZone);
    const wide = TENANT_WIDE_ROLES.has(context.role);
    const branchIds = wide ? [] : await resolveTenantBranchIds(context.tenantId, context.branchIds);
    const noAccessibleBranches = !wide && branchIds.length === 0;
    const dateOf = (instant: string) => localDateOfInstant(instant, period.timeZone);

    const factsPromise = loadFinancialFacts(supabase, { tenantId: context.tenantId, branchIds, tenantWide: wide, period });
    const cashPromise = noAccessibleBranches ? Promise.resolve([] as Row[]) : readAllSupabasePages<Row>((from, to) => {
      let query = supabase
        .from('cash_movements')
        .select('id,cash_session_id,movement_type,amount,reference_type,reference_id,performed_by,metadata,created_at,cash_sessions!inner(branch_id,cash_register_id,status)')
        .eq('tenant_id', context.tenantId)
        .gte('created_at', period.from)
        .lt('created_at', period.to)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);
      if (!wide) query = query.in('cash_sessions.branch_id', branchIds);
      return query;
    });
    const presalesPromise = noAccessibleBranches ? Promise.resolve([] as Row[]) : readAllSupabasePages<Row>((from, to) => {
      let query = supabase
        .from('presales')
        .select('id,ticket_code,items,total,seller_uid,seller_email,seller_role,status,evidence_refs,metadata,sale_id,branch_id,created_at,updated_at,paid_by,paid_at')
        .eq('tenant_id', context.tenantId)
        .gte('created_at', period.from)
        .lt('created_at', period.to)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);
      if (!wide) query = query.in('branch_id', branchIds);
      return query;
    });
    const [facts, rawCashMovements, rawPresales] = await Promise.all([factsPromise, cashPromise, presalesPromise]);

    const allSaleIds = Array.from(new Set([
      ...facts.sales.map((sale) => String(sale.id || '')),
      ...rawPresales.map((presale) => String(presale.sale_id || '')),
    ].filter(Boolean)));
    const missingSaleIds = allSaleIds.filter((id) => !facts.sales.some((sale) => String(sale.id) === id));
    const linkedSales = await readSupabaseInBatches<Row>(missingSaleIds, (batch) => supabase
      .from('sales')
      .select('id,branch_id,invoice_number,status,subtotal,tax,discount,total,customer_id,sold_by,metadata,created_at,sale_payments(payment_method,amount,reference),sale_items(product_id,quantity,unit_price,line_total,products(name,sku))')
      .eq('tenant_id', context.tenantId)
      .in('id', batch));
    const saleById = new Map([...facts.sales, ...linkedSales].map((sale) => [String(sale.id), sale]));

    const presaleItems = rawPresales.flatMap((presale) => Array.isArray(presale.items) ? presale.items as Row[] : []);
    const productIds = Array.from(new Set(presaleItems.map((item) => String(item.productId || '')).filter(Boolean)));
    const products = await readSupabaseInBatches<Row>(productIds, (batch) => supabase
      .from('products')
      .select('id,name,sku')
      .eq('tenant_id', context.tenantId)
      .in('id', batch));
    const productById = new Map(products.map((product) => [String(product.id), product]));

    const userIds = Array.from(new Set([
      ...facts.sales.map((sale) => String(sale.sold_by || '')),
      ...facts.expenses.map((expense) => String(expense.created_by || '')),
      ...facts.returns.map((item) => String(item.created_by || '')),
      ...rawCashMovements.map((movement) => String(movement.performed_by || '')),
      ...rawPresales.flatMap((presale) => [String(presale.seller_uid || ''), String(presale.paid_by || '')]),
      ...linkedSales.map((sale) => String(sale.sold_by || '')),
    ].filter(Boolean)));
    const profiles = await readSupabaseInBatches<Row>(userIds, (batch) => supabase
      .from('profiles')
      .select('auth_user_id,display_name,email')
      .in('auth_user_id', batch));
    const profileById = new Map(profiles.map((profile) => [String(profile.auth_user_id), profile]));

    const cashSessions = rawCashMovements.map((movement) => relation(movement.cash_sessions));
    const branchIdsInData = Array.from(new Set([
      ...facts.sales.map((sale) => String(sale.branch_id || '')),
      ...facts.expenses.map((expense) => String(expense.branch_id || '')),
      ...cashSessions.map((session) => String(session.branch_id || '')),
      ...rawPresales.map((presale) => String(presale.branch_id || '')),
    ].filter(Boolean)));
    const branches = await readSupabaseInBatches<Row>(branchIdsInData, (batch) => supabase
      .from('branches')
      .select('id,name,code')
      .eq('tenant_id', context.tenantId)
      .in('id', batch));
    const branchById = new Map(branches.map((branch) => [String(branch.id), branch]));
    const registerIds = Array.from(new Set(cashSessions.map((session) => String(session.cash_register_id || '')).filter(Boolean)));
    const registers = await readSupabaseInBatches<Row>(registerIds, (batch) => supabase
      .from('cash_registers')
      .select('id,name,code')
      .eq('tenant_id', context.tenantId)
      .in('id', batch));
    const registerById = new Map(registers.map((register) => [String(register.id), register]));

    const customerIds = Array.from(new Set([
      ...facts.sales.map((sale) => String(sale.customer_id || '')),
      ...rawPresales.map((presale) => String(record(presale.metadata).customerId || '')),
    ].filter((id) => UUID_PATTERN.test(id))));
    const customers = await readSupabaseInBatches<Row>(customerIds, (batch) => supabase
      .from('customers')
      .select('id,name,document_id,phone,email')
      .eq('tenant_id', context.tenantId)
      .in('id', batch));
    const customerById = new Map(customers.map((customer) => [String(customer.id), customer]));

    const returnsBySale = new Map<string, number>();
    for (const item of facts.returns) returnsBySale.set(String(item.sale_id), (returnsBySale.get(String(item.sale_id)) || 0) + number(item.amount));
    const returnById = new Map(facts.returns.map((item) => [String(item.id), item]));
    const returnItemsById = new Map<string, Row[]>();
    for (const item of facts.returnItems) {
      const key = String(item.return_id || '');
      returnItemsById.set(key, [...(returnItemsById.get(key) || []), item]);
    }
    const dailyDates = Array.from({ length: period.days }, (_, index) => {
      const value = new Date(`${period.fromDate}T00:00:00.000Z`);
      value.setUTCDate(value.getUTCDate() + index);
      return value.toISOString().slice(0, 10);
    });
    const financialSummary = summarizeFinancialDays({
      ...financialFactsToSummaryFacts(facts),
      dates: dailyDates,
      dateOf,
    });

    const mappedSales = facts.sales
      .filter((sale) => dateOf(String(sale.created_at || '')) >= period.fromDate && dateOf(String(sale.created_at || '')) <= period.toDate)
      .map((sale) => {
        const metadata = record(sale.metadata);
        const customer = customerById.get(String(sale.customer_id || ''));
        const profile = profileById.get(String(sale.sold_by || ''));
        const paymentRows = payments(sale);
        const returnAmount = returnsBySale.get(String(sale.id)) || 0;
        return {
          id: String(sale.id),
          saleNumber: String(sale.invoice_number || metadata.saleNumber || sale.id),
          branchId: String(sale.branch_id || ''),
          branchName: String(branchById.get(String(sale.branch_id || ''))?.name || ''),
          status: String(sale.status || ''),
          total: number(sale.total),
          netSales: sale.status === 'voided' ? 0 : Math.max(0, number(sale.total) - returnAmount),
          paidAmount: salesPaymentTotal(sale),
          creditAmount: salesCreditTotal(sale),
          paymentMethod: String(metadata.paymentMethod || paymentRows.map((item) => item.method).join(', ')),
          payments: paymentRows,
          customerId: String(sale.customer_id || ''),
          customerName: String(customer?.name || customer?.document_id || ''),
          sellerUid: String(sale.sold_by || ''),
          sellerName: String(profile?.display_name || profile?.email || ''),
          sellerEmail: String(profile?.email || ''),
          createdAt: String(sale.created_at || ''),
          businessDate: dateOf(String(sale.created_at || '')),
          items: saleItems(sale),
        };
      });
    const reportSalesById = new Map(mappedSales.map((sale) => [sale.id, sale]));
    for (const sale of linkedSales) {
      const metadata = record(sale.metadata);
      const customer = customerById.get(String(sale.customer_id || ''));
      const profile = profileById.get(String(sale.sold_by || ''));
      reportSalesById.set(String(sale.id), {
        id: String(sale.id),
        saleNumber: String(sale.invoice_number || metadata.saleNumber || sale.id),
        branchId: String(sale.branch_id || ''),
        branchName: String(branchById.get(String(sale.branch_id || ''))?.name || ''),
        status: String(sale.status || ''),
        total: number(sale.total),
        netSales: Math.max(0, number(sale.total) - (returnsBySale.get(String(sale.id)) || 0)),
        paidAmount: salesPaymentTotal(sale),
        creditAmount: salesCreditTotal(sale),
        paymentMethod: String(metadata.paymentMethod || ''),
        payments: payments(sale),
        customerId: String(sale.customer_id || ''),
        customerName: String(customer?.name || customer?.document_id || ''),
        sellerUid: String(sale.sold_by || ''),
        sellerName: String(profile?.display_name || profile?.email || ''),
        sellerEmail: String(profile?.email || ''),
        createdAt: String(sale.created_at || ''),
        businessDate: dateOf(String(sale.created_at || '')),
        items: saleItems(sale),
      });
    }

    const mappedPresales = rawPresales.map((presale) => {
      const metadata = record(presale.metadata);
      const seller = profileById.get(String(presale.seller_uid || ''));
      const branch = branchById.get(String(presale.branch_id || ''));
      const linked = reportSalesById.get(String(presale.sale_id || ''));
      const customerId = String(metadata.customerId || '');
      const customer = customerById.get(customerId);
      const items = (Array.isArray(presale.items) ? presale.items as Row[] : []).map((item) => {
        const product = productById.get(String(item.productId || ''));
        return {
          productId: String(item.productId || ''),
          name: String(item.name || product?.name || 'Producto'),
          sku: String(item.sku || product?.sku || ''),
          quantity: number(item.quantity),
          unitPrice: number(item.unitPrice),
          total: number(item.total),
        };
      });
      return {
        id: String(presale.id),
        ticketCode: String(presale.ticket_code || ''),
        total: number(presale.total),
        status: String(presale.status || ''),
        sellerUid: String(presale.seller_uid || ''),
        sellerName: String(seller?.display_name || seller?.email || presale.seller_email || ''),
        sellerEmail: String(presale.seller_email || seller?.email || ''),
        sellerRole: String(presale.seller_role || ''),
        branchId: String(presale.branch_id || ''),
        branchName: String(branch?.name || ''),
        customerId,
        customerName: String(customer?.name || customer?.document_id || metadata.customerName || ''),
        metadata,
        saleId: String(presale.sale_id || ''),
        saleNumber: linked?.saleNumber || String(presale.sale_id || ''),
        createdAt: String(presale.created_at || ''),
        businessDate: dateOf(String(presale.created_at || '')),
        updatedAt: String(presale.updated_at || ''),
        paidAt: presale.paid_at ? String(presale.paid_at) : '',
        paidBy: String(presale.paid_by || ''),
        items,
      };
    });

    const mappedReturns = facts.returns.map((item) => {
      const sale = reportSalesById.get(String(item.sale_id)) || saleById.get(String(item.sale_id));
      const actor = profileById.get(String(item.created_by || ''));
      const relatedSale = sale || {};
      const saleItemByProduct = new Map(item.sale_id ? saleItems(saleById.get(String(item.sale_id)) || {}).map((line: Row) => [String(line.productId), line]) : []);
      const items = (returnItemsById.get(String(item.id)) || []).map((line) => {
        const saleLine = saleItemByProduct.get(String(line.product_id)) || {};
        return { productId: String(line.product_id || ''), name: saleLine.name || 'Producto', sku: saleLine.sku || '', quantity: number(line.quantity), unitPrice: number(line.unit_price), total: number(line.amount) };
      });
      return {
        id: String(item.id),
        saleId: String(item.sale_id || ''),
        saleNumber: String(relatedSale.saleNumber || item.sale_id || ''),
        branchName: String(branchById.get(String(item.branch_id || ''))?.name || ''),
        amount: number(item.amount),
        refundMethod: String(item.refund_method || ''),
        reason: String(item.reason || ''),
        userName: String(actor?.display_name || actor?.email || ''),
        createdAt: String(item.created_at || ''),
        businessDate: dateOf(String(item.created_at || '')),
        items,
      };
    });

    const mappedCashMovements = rawCashMovements.map((movement, index) => {
      const session = cashSessions[index] || relation(movement.cash_sessions);
      const metadata = record(movement.metadata);
      const returnRow = movement.reference_type === 'sale_return' ? returnById.get(String(movement.reference_id || '')) : undefined;
      const saleId = movement.reference_type === 'sale'
        ? String(movement.reference_id || '')
        : String(returnRow?.sale_id || metadata.saleId || '');
      const sale = saleById.get(saleId);
      const saleDetail = reportSalesById.get(saleId);
      const actor = profileById.get(String(movement.performed_by || ''));
      const returnLines = returnRow ? (returnItemsById.get(String(returnRow.id)) || []).map((line) => {
        const saleLine: Row = saleItems(sale || {}).find((item: Row) => item.productId === String(line.product_id)) || {};
        const product = productById.get(String(line.product_id)) || {};
        return { productId: String(line.product_id || ''), name: saleLine.name || product.name || 'Producto', sku: saleLine.sku || product.sku || '', quantity: number(line.quantity), unitPrice: number(line.unit_price), lineTotal: number(line.amount), total: number(line.amount) };
      }) : [];
      const movementSaleItems = returnRow ? returnLines : (sale ? saleItems(sale) : []);
      const paymentRows = sale ? payments(sale) : [];
      const paymentMethod = String(metadata.paymentMethod || returnRow?.refund_method || '');
      const movementType = String(movement.movement_type || '');
      const labels: Record<string, string> = { sale: 'Cobro de venta', refund: 'Devolución', deposit: 'Entrada de caja', withdrawal: 'Retiro de caja', adjustment: 'Ajuste de caja', payment: 'Pago', purchase: 'Compra' };
      return {
        id: String(movement.id),
        cashSessionId: String(movement.cash_session_id || ''),
        movementType,
        movementLabel: returnRow ? 'Devolución' : (labels[movementType] || movementType),
        amount: Math.abs(number(movement.amount)),
        signedAmount: number(movement.amount),
        direction: number(movement.amount) >= 0 ? 'Entrada' : 'Salida',
        paymentMethod,
        payments: paymentRows,
        description: String(metadata.description || returnRow?.reason || (sale ? 'Venta registrada en Caja' : movement.reference_type || movementType)),
        referenceType: String(movement.reference_type || ''),
        referenceId: String(movement.reference_id || ''),
        saleId,
        saleNumber: String(sale?.invoice_number || record(sale?.metadata).saleNumber || saleId),
        saleTotal: number(sale?.total || saleDetail?.total || 0),
        branchId: String(session.branch_id || ''),
        branchName: String(branchById.get(String(session.branch_id || ''))?.name || ''),
        registerName: String(registerById.get(String(session.cash_register_id || ''))?.name || ''),
        cashSessionIdLabel: String(movement.cash_session_id || ''),
        userId: String(movement.performed_by || ''),
        userName: String(actor?.display_name || actor?.email || movement.performed_by || 'Usuario no disponible'),
        userEmail: String(actor?.email || ''),
        createdAt: String(movement.created_at || ''),
        businessDate: dateOf(String(movement.created_at || '')),
        items: movementSaleItems,
      };
    });

    const mappedExpenses = facts.expenses.map((expense) => {
      const actor = profileById.get(String(expense.created_by || ''));
      return {
        id: String(expense.id),
        description: String(expense.description || ''),
        amount: number(expense.amount),
        category: String(expense.category || ''),
        paymentMethod: String(expense.payment_method || ''),
        notes: String(expense.notes || ''),
        userName: String(actor?.display_name || actor?.email || ''),
        userEmail: String(actor?.email || ''),
        branchName: String(branchById.get(String(expense.branch_id || ''))?.name || ''),
        createdAt: String(expense.created_at || ''),
        businessDate: dateOf(String(expense.created_at || '')),
      };
    });

    const exportQuota = await supabase.rpc('consume_financial_report_export', {
      target_tenant_id: context.tenantId,
      target_user_id: context.uid,
    });
    if (exportQuota.error) throw new Error(exportQuota.error.message);
    const blocked = reportExportQuotaFailure(record(exportQuota.data), String(tenant.name || 'la empresa'), period.timeZone);
    if (blocked) return blocked;

    return NextResponse.json({
      ok: true,
      tenant: {
        id: String(tenant.id),
        name: String(tenant.name || ''),
        timezone: period.timeZone,
        currency: String(tenant.currency || 'NIO'),
        locale: 'es-NI',
      },
      period: { fromDate: period.fromDate, toDate: period.toDate, days: period.days, timezone: period.timeZone },
      totals: {
        ...financialSummary.totals,
        returnsTotal: facts.returns.reduce((sum, item) => sum + number(item.amount), 0),
      },
      daily: financialSummary.daily,
      sales: mappedSales,
      cashMovements: mappedCashMovements,
      presales: mappedPresales,
      expenses: mappedExpenses,
      returns: mappedReturns,
      quota: record(exportQuota.data),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'FINANCIAL_EXPORT_TOO_LARGE') {
      return NextResponse.json({ error: 'El período supera la cantidad de filas segura para preparar el Excel en este dispositivo. Intenta nuevamente luego o reduce el período.' }, { status: 413 });
    }
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
