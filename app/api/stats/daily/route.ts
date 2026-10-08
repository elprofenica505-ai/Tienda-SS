import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantBranchIds } from '@/lib/branch-scope';
import { dayBoundsInTimeZone, isValidLocalDateKey, localDateKeyIn } from '@/lib/dashboard-summary';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import type { TenantRole } from '@/lib/tenant';

export const runtime = 'nodejs';

const TENANT_WIDE_ROLES = new Set<TenantRole>(['owner', 'admin', 'gerente', 'jefe']);
const DEFAULT_TIME_ZONE = 'America/Managua';
const ROW_LIMIT = 5000;

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Zona horaria del negocio. "Hoy" se calculaba en UTC, así que en Managua
 * (UTC-6) el Resumen reportaba cero ventas después de las 18:00 locales porque
 * el servidor ya estaba consultando la ventana del día siguiente.
 */
async function tenantTimeZone(tenantId: string): Promise<string> {
  const result = await getSupabaseServer().from('tenants').select('timezone').eq('id', tenantId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  const configured = asText((result.data as { timezone?: unknown } | null)?.timezone);
  if (!configured) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: configured });
    return configured;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function requestedBranch(request: NextRequest): string {
  return (request.headers.get('x-branch-id') || request.nextUrl.searchParams.get('branchId') || '').trim().slice(0, 128);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'reports', 'view');
    if (!TENANT_WIDE_ROLES.has(context.role)) return NextResponse.json({ error: 'Las estadísticas globales requieren un rol administrativo.' }, { status: 403 });

    const supabase = getSupabaseServer();
    const timeZone = await tenantTimeZone(context.tenantId);
    const today = localDateKeyIn(new Date(), timeZone);
    const requested = (request.nextUrl.searchParams.get('date') || '').trim();
    let dateKey = today;
    if (requested) {
      if (!isValidLocalDateKey(requested)) return NextResponse.json({ error: 'La fecha debe tener formato YYYY-MM-DD.' }, { status: 400 });
      if (requested > today) return NextResponse.json({ error: 'La fecha no puede estar en el futuro.' }, { status: 400 });
      dateKey = requested;
    }

    // Sucursal activa del espacio de trabajo. Se resuelven también los IDs
    // heredados para que una venta antigua siga contando en su sucursal.
    const branch = requestedBranch(request);
    let branchReferences: string[] | null = null;
    let branchId: string | null = null;
    if (branch) {
      const resolved = await resolveTenantBranchIds(supabase, context.tenantId, [branch]);
      if (!resolved.length) return NextResponse.json({ error: 'La sucursal seleccionada no existe o está inactiva.' }, { status: 404 });
      branchId = resolved[0];
      branchReferences = Array.from(new Set([...resolved, branch]));
    }

    const { from, until } = dayBoundsInTimeZone(dateKey, timeZone);
    let query = supabase
      .from('sales')
      .select('total,status,created_at')
      .eq('tenant_id', context.tenantId)
      .gte('created_at', from)
      .lt('created_at', until)
      .limit(ROW_LIMIT);
    if (branchReferences) query = query.in('branch_id', branchReferences);
    const result = await query;
    if (result.error) throw new Error(result.error.message);

    const completed = (result.data || []).filter((sale) => sale.status !== 'voided');
    return NextResponse.json({
      ok: true,
      date: dateKey,
      timeZone,
      branchId,
      stats: {
        salesCount: completed.length,
        salesTotal: roundMoney(completed.reduce((sum, sale) => sum + Number(sale.total || 0), 0)),
        updatedAt: new Date().toISOString(),
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
