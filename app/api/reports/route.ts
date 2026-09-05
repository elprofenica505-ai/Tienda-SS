import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantMember, tenantErrorResponse } from '@/lib/tenant';

export const runtime = 'nodejs';
function money(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
function dayKey(value: unknown) { const date = value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function' ? value.toDate() : value instanceof Date ? value : new Date(String(value)); return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10); }

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantMember(request);
    const days = Math.min(365, Math.max(7, Number(new URL(request.url).searchParams.get('days') || 30)));
    const tenant = getAdminDb().collection('tenants').doc(context.tenantId);
    const [salesSnapshot, expensesSnapshot, cashSnapshot, receivablesSnapshot] = await Promise.all([
      tenant.collection('sales').orderBy('createdAt', 'desc').limit(500).get(),
      tenant.collection('expenses').orderBy('createdAt', 'desc').limit(500).get(),
      tenant.collection('cashMovements').orderBy('createdAt', 'desc').limit(500).get(),
      tenant.collection('receivablePayments').orderBy('createdAt', 'desc').limit(500).get()
    ]);
    const sales: Array<Record<string, unknown> & { id: string }> = salesSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>) }));
    const expenses: Array<Record<string, unknown> & { id: string }> = expensesSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>) }));
    const cash: Array<Record<string, unknown> & { id: string }> = cashSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>) }));
    const payments: Array<Record<string, unknown> & { id: string }> = receivablesSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>) }));
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    const inRange = (item: Record<string, unknown>) => { const key = dayKey(item.createdAt); return key && new Date(`${key}T00:00:00`) >= cutoff; };
    const rangeSales = sales.filter(inRange); const rangeExpenses = expenses.filter(inRange); const rangeCash = cash.filter(inRange);
    const income = rangeSales.reduce((sum, item) => sum + (item.paymentMethod === 'credit' ? money(item.paidAmount) : money(item.total)), 0);
    const expensesTotal = rangeExpenses.reduce((sum, item) => sum + money(item.amount), 0);
    const cashAdjustments = rangeCash.reduce((sum, item) => sum + (item.direction === 'in' ? money(item.amount) : -money(item.amount)), 0);
    const chart = new Map<string, { date: string; income: number; expenses: number; net: number }>();
    for (let index = days - 1; index >= 0; index -= 1) { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - index); const key = date.toISOString().slice(0, 10); chart.set(key, { date: key, income: 0, expenses: 0, net: 0 }); }
    for (const item of rangeSales) { const key = dayKey(item.createdAt); const row = chart.get(key); if (row) row.income += item.paymentMethod === 'credit' ? money(item.paidAmount) : money(item.total); }
    for (const item of rangeExpenses) { const key = dayKey(item.createdAt); const row = chart.get(key); if (row) row.expenses += money(item.amount); }
    chart.forEach((row) => { row.net = row.income - row.expenses; });
    const paymentMethods = new Map<string, number>();
    for (const item of rangeSales) { const method = String(item.paymentMethod || 'unknown'); paymentMethods.set(method, (paymentMethods.get(method) || 0) + money(item.total)); }
    const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const sale of rangeSales) { const items = Array.isArray(sale.items) ? sale.items as Array<Record<string, unknown>> : []; for (const line of items) { const id = String(line.productId || line.name || 'unknown'); const row = productMap.get(id) || { name: String(line.name || 'Producto'), quantity: 0, revenue: 0 }; row.quantity += money(line.quantity); row.revenue += money(line.total); productMap.set(id, row); } }
    const openCredit = sales.reduce((sum, item) => sum + Math.max(0, money(item.balanceDue || 0)), 0);
    return NextResponse.json({ ok: true, period: { days, from: cutoff.toISOString(), to: new Date().toISOString() }, summary: { income, expenses: expensesTotal, cashAdjustments, net: income - expensesTotal + cashAdjustments, sales: rangeSales.length, averageSale: rangeSales.length ? income / rangeSales.length : 0, openCredit, collectedCredit: payments.filter(inRange).reduce((sum, item) => sum + money(item.amount), 0) }, daily: Array.from(chart.values()), paymentMethods: Array.from(paymentMethods, ([method, total]) => ({ method, total })).sort((a, b) => b.total - a.total), topProducts: Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10), recentExpenses: rangeExpenses.slice(0, 10) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
