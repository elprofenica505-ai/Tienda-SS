import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import type { TenantRole } from '@/lib/tenant';

export const runtime = 'nodejs';
function money(value: unknown) { const n = typeof value === 'number' ? value : Number(value); return Number.isFinite(n) ? Math.max(0, n) : 0; }
function dayKey(value: unknown) { const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10); }
const TENANT_WIDE_ROLES = new Set<TenantRole>(['owner', 'admin', 'gerente', 'jefe']);

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'reports', 'view');
    const days = Math.min(365, Math.max(7, Number(new URL(request.url).searchParams.get('days') || 30)));
    const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0); cutoff.setDate(cutoff.getDate() - days + 1);
    const cutoffIso = cutoff.toISOString();
    const supabase = getSupabaseServer();
    const wide = TENANT_WIDE_ROLES.has(context.role);
    const branchIds = context.branchIds;
    const [salesResult, expensesResult, sessionsResult, receivablesResult, paymentsResult] = await Promise.all([
      supabase.from('sales').select('id,branch_id,status,total,metadata,created_at,sale_payments(payment_method,amount),sale_items(quantity,line_total,products(name))').eq('tenant_id', context.tenantId).gte('created_at', cutoffIso).order('created_at', { ascending: false }).limit(5000),
      supabase.from('expenses').select('id,branch_id,description,amount,category,payment_method,created_at').eq('tenant_id', context.tenantId).gte('created_at', cutoffIso).order('created_at', { ascending: false }).limit(5000),
      supabase.from('cash_sessions').select('id,branch_id').eq('tenant_id', context.tenantId).limit(5000),
      supabase.from('receivables').select('id,sale_id,outstanding_amount,created_at').eq('tenant_id', context.tenantId).limit(5000),
      supabase.from('receivable_payments').select('id,receivable_id,amount,payment_method,created_at').eq('tenant_id', context.tenantId).gte('created_at', cutoffIso).limit(5000),
    ]);
    for (const result of [salesResult, expensesResult, sessionsResult, receivablesResult, paymentsResult]) if (result.error) throw new Error(result.error.message);
    const sessions = sessionsResult.data || [];
    const sessionIds = (wide ? sessions : sessions.filter((row) => branchIds.includes(row.branch_id))).map((row) => row.id);
    const cashResult = sessionIds.length ? await supabase.from('cash_movements').select('id,cash_session_id,amount,movement_type,metadata,created_at').eq('tenant_id', context.tenantId).in('cash_session_id', sessionIds).gte('created_at', cutoffIso).order('created_at', { ascending: false }).limit(5000) : { data: [], error: null };
    if (cashResult.error) throw new Error(cashResult.error.message);
    const sales = (salesResult.data || []).filter((row) => wide || branchIds.includes(row.branch_id));
    const expenses = (expensesResult.data || []).filter((row) => wide || branchIds.includes(row.branch_id));
    const sessionBranch = new Map(sessions.map((row) => [row.id, row.branch_id]));
    const cash = (cashResult.data || []).filter((row) => (wide || branchIds.includes(sessionBranch.get(row.cash_session_id))) && row.movement_type !== 'sale');
    const saleIds = new Set(sales.map((row) => row.id));
    const receivables = (receivablesResult.data || []).filter((row) => wide || saleIds.has(row.sale_id));
    const receivableIds = new Set(receivables.map((row) => row.id));
    const payments = (paymentsResult.data || []).filter((row) => wide || receivableIds.has(row.receivable_id));
    const inRange = (item: Record<string, unknown>) => Boolean(dayKey(item.created_at));
    const income = sales.filter((item) => item.status !== 'voided').reduce((sum, item) => { const payment = Array.isArray(item.sale_payments) ? item.sale_payments[0] as Record<string, unknown> | undefined : undefined; const method = String(payment?.payment_method || item.metadata?.paymentMethod || 'cash'); const amount = method === 'credit' ? money(item.metadata?.paidAmount) : money(payment?.amount || item.total); return sum + amount; }, 0);
    const expensesTotal = expenses.reduce((sum, item) => sum + money(item.amount), 0);
    const cashAdjustments = cash.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const chart = new Map<string, { date: string; income: number; expenses: number; net: number }>();
    for (let index = days - 1; index >= 0; index -= 1) { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - index); const key = date.toISOString().slice(0, 10); chart.set(key, { date: key, income: 0, expenses: 0, net: 0 }); }
    for (const item of sales) { if (item.status === 'voided') continue; const key = dayKey(item.created_at); const row = chart.get(key); const payment = Array.isArray(item.sale_payments) ? item.sale_payments[0] as Record<string, unknown> | undefined : undefined; const method = String(payment?.payment_method || item.metadata?.paymentMethod || 'cash'); if (row) row.income += method === 'credit' ? money(item.metadata?.paidAmount) : money(payment?.amount || item.total); }
    for (const item of expenses) { const row = chart.get(dayKey(item.created_at)); if (row) row.expenses += money(item.amount); }
    chart.forEach((row) => { row.net = row.income - row.expenses; });
    const paymentMethods = new Map<string, number>();
    for (const item of sales) { const payment = Array.isArray(item.sale_payments) ? item.sale_payments[0] as Record<string, unknown> | undefined : undefined; const method = String(payment?.payment_method || item.metadata?.paymentMethod || 'unknown'); paymentMethods.set(method, (paymentMethods.get(method) || 0) + money(payment?.amount || item.total)); }
    const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const sale of sales) { const items = Array.isArray(sale.sale_items) ? sale.sale_items as Array<Record<string, unknown>> : []; for (const line of items) { const product = line.products as Record<string, unknown> | null; const id = String(product?.name || line.id || 'unknown'); const row = productMap.get(id) || { name: String(product?.name || 'Producto'), quantity: 0, revenue: 0 }; row.quantity += money(line.quantity); row.revenue += money(line.line_total); productMap.set(id, row); } }
    const openCredit = receivables.reduce((sum, item) => sum + money(item.outstanding_amount), 0);
    const collectedCredit = payments.reduce((sum, item) => sum + money(item.amount), 0);
    return NextResponse.json({ ok: true, period: { days, from: cutoffIso, to: new Date().toISOString() }, summary: { income, expenses: expensesTotal, cashAdjustments, net: income - expensesTotal + cashAdjustments, sales: sales.length, averageSale: sales.length ? income / sales.length : 0, openCredit, collectedCredit }, daily: Array.from(chart.values()), paymentMethods: Array.from(paymentMethods, ([method, total]) => ({ method, total })).sort((a, b) => b.total - a.total), topProducts: Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10), recentExpenses: expenses.slice(0, 10) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
