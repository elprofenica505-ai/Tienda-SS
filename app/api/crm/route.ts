import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';

export const runtime = 'nodejs';
function fail(error: unknown) { const r = tenantErrorResponse(error); return NextResponse.json(r.body, { status: r.status }); }
export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'crm', 'view'); const db = getSupabaseServer();
    const [customers, settings, alerts] = await Promise.all([
      db.from('customers').select('id,name,email,phone,origin_channel,created_at').eq('tenant_id', context.tenantId).eq('active', true).order('name').limit(500),
      db.from('crm_settings').select('*').eq('tenant_id', context.tenantId).maybeSingle(),
      db.from('crm_alerts').select('id,alert_type,customer_id,quote_id,title,message,last_detected_at').eq('tenant_id', context.tenantId).eq('is_active', true).order('last_detected_at', { ascending: false }).limit(100),
    ]);
    if (customers.error || settings.error || alerts.error) throw new Error(customers.error?.message || settings.error?.message || alerts.error?.message || 'CRM_ERROR');
    const cfg = settings.data || { vip_min_spend: 50000, recurrent_min_purchases: 4, inactive_days: 90, stalled_quote_days: 3 };
    const ids = (customers.data || []).map((c) => c.id); let sales: Array<Record<string, any>> = [];
    if (ids.length) { let q = db.from('sales').select('customer_id,total,created_at,branch_id').eq('tenant_id', context.tenantId).eq('status', 'completed').in('customer_id', ids).gte('created_at', new Date(Date.now() - 366 * 86400000).toISOString()); if (!['owner','admin','gerente','jefe'].includes(context.role)) q = q.in('branch_id', context.branchIds.length ? context.branchIds : ['00000000-0000-0000-0000-000000000000']); const r = await q; if (r.error) throw new Error(r.error.message); sales = r.data || []; }
    const customerRows = (customers.data || []).map((customer) => { const own = sales.filter((s) => s.customer_id === customer.id); const spend = own.reduce((sum, s) => sum + Number(s.total || 0), 0); const last = own.map((s) => String(s.created_at)).sort().at(-1) || null; const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null; const segment = spend >= Number(cfg.vip_min_spend) ? 'VIP' : own.length >= Number(cfg.recurrent_min_purchases) ? 'Recurrente' : days === null || days >= Number(cfg.inactive_days) ? 'Inactivo' : 'Ocasional'; return { ...customer, segment, purchases: own.length, spend, lastPurchaseAt: last, daysWithoutPurchase: days }; });
    return NextResponse.json({ ok: true, customers: customerRows, settings: cfg, alerts: alerts.data || [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return fail(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'crm', 'edit'); if (!['owner','admin','gerente','jefe'].includes(context.role)) throw new Error('FORBIDDEN'); const body = await request.json();
    const payload = { tenant_id: context.tenantId, vip_min_spend: Math.max(0, Number(body.vipMinSpend) || 50000), recurrent_min_purchases: Math.max(1, Math.floor(Number(body.recurrentMinPurchases) || 4)), inactive_days: Math.max(1, Math.floor(Number(body.inactiveDays) || 90)), stalled_quote_days: Math.max(1, Math.floor(Number(body.stalledQuoteDays) || 3)), updated_by: context.uid, updated_at: new Date().toISOString() };
    const result = await getSupabaseServer().from('crm_settings').upsert(payload).select('*').single(); if (result.error) throw new Error(result.error.message); return NextResponse.json({ ok: true, settings: result.data });
  } catch (error) { return fail(error); }
}
