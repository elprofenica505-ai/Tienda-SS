import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireSuperadmin, superadminErrorResponse } from '@/lib/superadmin';

export const runtime = 'nodejs';
function number(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
export async function GET(request: NextRequest) {
  try {
    await requireSuperadmin(request); const supabase = getSupabaseServer();
    const [tenants, members, sales, expenses, alerts] = await Promise.all([
      supabase.from('tenants').select('id,name,plan,status,subscription_status,platform_status,created_at').order('created_at', { ascending: false }).limit(1000),
      supabase.from('members').select('id,status').limit(5000),
      supabase.from('sales').select('id,total,status').limit(5000),
      supabase.from('expenses').select('amount').limit(5000),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('notification_type', 'payment_failed'),
    ]);
    for (const result of [tenants, members, sales, expenses, alerts]) if (result.error) throw new Error(result.error.message);
    const tenantRows = tenants.data || []; const salesRows = sales.data || []; const expenseRows = expenses.data || [];
    const grossSales = salesRows.filter((item) => item.status !== 'voided').reduce((sum, item) => sum + number(item.total), 0); const expenseTotal = expenseRows.reduce((sum, item) => sum + number(item.amount), 0);
    const subscriptionCounts = tenantRows.reduce<Record<string, number>>((result, tenant) => { const status = String(tenant.subscription_status || 'inactive'); result[status] = (result[status] || 0) + 1; return result; }, {});
    const planCounts = tenantRows.reduce<Record<string, number>>((result, tenant) => { const plan = String(tenant.plan || 'starter'); result[plan] = (result[plan] || 0) + 1; return result; }, {});
    return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), metrics: { tenants: tenantRows.length, activeTenants: tenantRows.filter((tenant) => ['active', 'trialing'].includes(String(tenant.subscription_status))).length, users: (members.data || []).length, activeUsers: (members.data || []).filter((member) => member.status === 'active').length, sales: salesRows.length, grossSales, expenses: expenseTotal, net: grossSales - expenseTotal, failedPayments: alerts.count || 0 }, subscriptionCounts, planCounts, recentTenants: tenantRows.slice(0, 10).map((tenant) => ({ id: tenant.id, name: tenant.name || 'Sin nombre', plan: tenant.plan || 'starter', subscriptionStatus: tenant.subscription_status || 'inactive', platformStatus: tenant.platform_status || 'active', createdAt: tenant.created_at || null })) });
  } catch (error: unknown) { const response = superadminErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
