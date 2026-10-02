import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { writeImmutableAudit } from '@/lib/audit';
import { DEFAULT_DAILY_SUMMARY_SETTINGS, resolveDailySummarySchedule } from '@/lib/daily-summary';
import { dailySummaryWindowMinutes, loadDailySummarySettings, saveDailySummarySettings } from '@/lib/daily-summary-service';
import { isWhatsAppConfigured, resolveWhatsAppProvider } from '@/lib/whatsapp';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };
const MANAGER_ROLES = new Set(['owner', 'admin', 'gerente']);

function failure(error: unknown) {
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status, headers: NO_STORE });
}

async function tenantTimezone(tenantId: string): Promise<string> {
  const tenant = await getSupabaseServer().from('tenants').select('timezone').eq('id', tenantId).maybeSingle();
  if (tenant.error) throw new Error(tenant.error.message);
  return String(tenant.data?.timezone || DEFAULT_DAILY_SUMMARY_SETTINGS.timezone);
}

/** Configuración del módulo: qué hora, en qué zona horaria, si envía WhatsApp y a quién. */
export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'dashboard', 'view');
    if (!MANAGER_ROLES.has(context.role)) {
      return NextResponse.json({ error: 'Solo administración puede ver la configuración del resumen diario.' }, { status: 403, headers: NO_STORE });
    }
    const timezone = await tenantTimezone(context.tenantId);
    const { settings, configured, updatedAt } = await loadDailySummarySettings(getSupabaseServer(), context.tenantId, timezone);
    return NextResponse.json({
      ok: true,
      settings,
      configured,
      settingsUpdatedAt: updatedAt,
      schedule: resolveDailySummarySchedule(settings, new Date(), dailySummaryWindowMinutes()),
      whatsapp: { configured: isWhatsAppConfigured(), provider: resolveWhatsAppProvider() },
    }, { headers: NO_STORE });
  } catch (error: unknown) {
    return failure(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'dashboard', 'edit');
    if (!MANAGER_ROLES.has(context.role)) {
      return NextResponse.json({ error: 'Solo administración puede cambiar el resumen diario.' }, { status: 403, headers: NO_STORE });
    }
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Configuración inválida.' }, { status: 400, headers: NO_STORE });
    }
    const supabase = getSupabaseServer();
    const timezone = await tenantTimezone(context.tenantId);
    const { settings: before } = await loadDailySummarySettings(supabase, context.tenantId, timezone);
    const settings = await saveDailySummarySettings(supabase, context.tenantId, body, context.uid, timezone);

    // El cambio de horario/WhatsApp queda en la bitácora de auditoría; si la auditoría falla,
    // la configuración ya guardada sigue siendo válida y se reporta en los logs.
    try {
      await writeImmutableAudit({
        tenantId: context.tenantId,
        actor: { uid: context.uid, tenantId: context.tenantId, role: context.role },
        action: 'daily_summary.settings.update',
        entity: 'tenant_settings',
        before,
        after: settings,
        request: { method: 'PUT', path: request.nextUrl.pathname, requestId: request.headers.get('x-correlation-id') || undefined },
        result: 'success',
      });
    } catch (error: unknown) {
      console.error('daily_summary_settings_audit_failed', {
        message: error instanceof Error ? error.message : 'unknown',
      });
    }

    return NextResponse.json({
      ok: true,
      settings,
      schedule: resolveDailySummarySchedule(settings, new Date(), dailySummaryWindowMinutes()),
      whatsapp: { configured: isWhatsAppConfigured(), provider: resolveWhatsAppProvider() },
    }, { headers: NO_STORE });
  } catch (error: unknown) {
    return failure(error);
  }
}
