import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireSuperadmin, superadminErrorResponse } from '@/lib/superadmin';

export const runtime = 'nodejs';
function number(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
export async function GET(request: NextRequest) {
  try {
    await requireSuperadmin(request); const db = getAdminDb(); const tenantsSnapshot = await db.collection('tenants').orderBy('createdAt', 'desc').limit(1000).get();
    const tenantRows: Array<Record<string, unknown> & { id: string }> = tenantsSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>) }));
    const memberGroups = await Promise.all(tenantRows.map((tenant) => db.collection('tenants').doc(tenant.id).collection('members').get()));
    const members = memberGroups.flatMap((group) => group.docs.map((item) => item.data() as Record<string, unknown>));
    const [salesSnapshot, expensesSnapshot, alertsSnapshot] = await Promise.all([db.collectionGroup('sales').limit(5000).get(), db.collectionGroup('expenses').limit(5000).get(), db.collectionGroup('notifications').where('type', '==', 'payment_failed').limit(500).get()]);
    const sales = salesSnapshot.docs.map((item) => item.data() as Record<string, unknown>); const expenses = expensesSnapshot.docs.map((item) => item.data() as Record<string, unknown>);
    const grossSales = sales.reduce((sum, item) => sum + number(item.total), 0); const expenseTotal = expenses.reduce((sum, item) => sum + number(item.amount), 0);
    const subscriptionCounts = tenantRows.reduce<Record<string, number>>((result, tenant) => { const status = String(tenant.subscriptionStatus || 'inactive'); result[status] = (result[status] || 0) + 1; return result; }, {});
    const planCounts = tenantRows.reduce<Record<string, number>>((result, tenant) => { const plan = String(tenant.plan || 'starter'); result[plan] = (result[plan] || 0) + 1; return result; }, {});
    return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), metrics: { tenants: tenantRows.length, activeTenants: tenantRows.filter((tenant) => ['active', 'trialing'].includes(String(tenant.subscriptionStatus))).length, users: members.length, activeUsers: members.filter((member) => member.status === 'active').length, sales: sales.length, grossSales, expenses: expenseTotal, net: grossSales - expenseTotal, failedPayments: alertsSnapshot.size }, subscriptionCounts, planCounts, recentTenants: tenantRows.slice(0, 10).map((tenant) => ({ id: tenant.id, name: String(tenant.name || 'Sin nombre'), plan: String(tenant.plan || 'starter'), subscriptionStatus: String(tenant.subscriptionStatus || 'inactive'), platformStatus: String(tenant.platformStatus || 'active'), createdAt: tenant.createdAt || null })) });
  } catch (error: unknown) { const response = superadminErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
