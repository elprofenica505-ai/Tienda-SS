import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import type { TenantRole } from '@/lib/tenant';

export const runtime = 'nodejs';
const TENANT_WIDE_ROLES = new Set<TenantRole>(['owner', 'admin', 'gerente', 'jefe']);
function dateKey(value: string | null) { const candidate = value || new Date().toISOString().slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null; }
export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'reports', 'view');
    if (!TENANT_WIDE_ROLES.has(context.role)) return NextResponse.json({ error: 'Las estadísticas globales requieren un rol administrativo.' }, { status: 403 });
    const key = dateKey(new URL(request.url).searchParams.get('date'));
    if (!key) return NextResponse.json({ error: 'La fecha debe tener formato YYYY-MM-DD.' }, { status: 400 });
    const from = `${key}T00:00:00.000Z`; const until = new Date(`${key}T00:00:00.000Z`); until.setUTCDate(until.getUTCDate() + 1);
    const result = await getSupabaseServer().from('sales').select('total,status,created_at').eq('tenant_id', context.tenantId).gte('created_at', from).lt('created_at', until.toISOString()).limit(5000);
    if (result.error) throw new Error(result.error.message);
    const completed = (result.data || []).filter((sale) => sale.status !== 'voided');
    return NextResponse.json({ ok: true, date: key, stats: { salesCount: completed.length, salesTotal: completed.reduce((sum, sale) => sum + Number(sale.total || 0), 0), updatedAt: new Date().toISOString() } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
