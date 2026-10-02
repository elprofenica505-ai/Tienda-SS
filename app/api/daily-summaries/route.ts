import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { DEFAULT_DAILY_SUMMARY_SETTINGS, isSummaryDateKey, resolveDailySummarySchedule } from '@/lib/daily-summary';
import {
  dailySummaryWindowMinutes,
  listDailySummaries,
  loadDailySummarySettings,
  runDailySummaryCycle,
  sendDailySummaryNow,
} from '@/lib/daily-summary-service';
import { isWhatsAppConfigured, resolveWhatsAppProvider } from '@/lib/whatsapp';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };
const MANAGER_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);
// El cálculo recorre ventas, kardex, cartera e inventario de toda la empresa: se limita
// la regeneración manual a una vez cada 30 s por empresa en esta instancia.
const MANUAL_GENERATE_COOLDOWN_MS = 30_000;
const lastManualGenerate = new Map<string, number>();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  if (code === 'SUMMARY_NOT_FOUND') {
    return NextResponse.json({ error: 'El resumen indicado no existe para esta empresa.' }, { status: 404, headers: NO_STORE });
  }
  if (code === 'WHATSAPP_NOT_CONFIGURED') {
    return NextResponse.json(
      { error: 'El envío por WhatsApp no está configurado en el servidor. Falta WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID (o las credenciales de Twilio).', code },
      { status: 503, headers: NO_STORE },
    );
  }
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status, headers: NO_STORE });
}

function isManager(role: string): boolean {
  return MANAGER_ROLES.has(role);
}

/** Últimos resúmenes guardados + configuración vigente + si el servidor puede enviar WhatsApp. */
export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'dashboard', 'view');
    if (!isManager(context.role)) {
      return NextResponse.json({ error: 'El resumen diario está disponible solo para administración.' }, { status: 403, headers: NO_STORE });
    }
    const supabase = getSupabaseServer();
    const tenant = await supabase.from('tenants').select('name,timezone,currency').eq('id', context.tenantId).maybeSingle();
    if (tenant.error) throw new Error(tenant.error.message);
    const timezone = String(tenant.data?.timezone || DEFAULT_DAILY_SUMMARY_SETTINGS.timezone);
    const [{ settings, configured, updatedAt }, summaries] = await Promise.all([
      loadDailySummarySettings(supabase, context.tenantId, timezone),
      listDailySummaries(supabase, context.tenantId, 30),
    ]);
    const now = new Date();
    const schedule = resolveDailySummarySchedule(settings, now, dailySummaryWindowMinutes());
    return NextResponse.json({
      ok: true,
      tenant: { name: String(tenant.data?.name || ''), timezone, currency: String(tenant.data?.currency || 'NIO') },
      settings,
      configured,
      settingsUpdatedAt: updatedAt,
      schedule,
      whatsapp: { configured: isWhatsAppConfigured(), provider: resolveWhatsAppProvider() },
      serverNow: now.toISOString(),
      summaries,
    }, { headers: NO_STORE });
  } catch (error: unknown) {
    return failure(error);
  }
}

/**
 * Acciones manuales del dueño:
 *  - { action: 'generate', date?: 'YYYY-MM-DD' } → recalcula y guarda el resumen sin enviarlo.
 *  - { action: 'send', summaryId, phone? }       → envía por WhatsApp el resumen indicado.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'dashboard', 'edit');
    if (!isManager(context.role)) {
      return NextResponse.json({ error: 'El resumen diario está disponible solo para administración.' }, { status: 403, headers: NO_STORE });
    }
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const action = typeof body?.action === 'string' ? body.action : '';
    const supabase = getSupabaseServer();

    if (action === 'generate') {
      const now = Date.now();
      const last = lastManualGenerate.get(context.tenantId) || 0;
      if (now - last < MANUAL_GENERATE_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((MANUAL_GENERATE_COOLDOWN_MS - (now - last)) / 1000);
        return NextResponse.json({ ok: true, generated: false, throttled: true, retryAfterSeconds }, { headers: NO_STORE });
      }
      lastManualGenerate.set(context.tenantId, now);

      const requestedDate = typeof body?.date === 'string' && isSummaryDateKey(body.date) ? body.date : undefined;
      const report = await runDailySummaryCycle({
        tenantId: context.tenantId,
        date: requestedDate,
        force: true,
        generateOnly: true,
      });
      if (report.errors.length > 0) throw new Error(report.errors[0].message);
      const summaries = await listDailySummaries(supabase, context.tenantId, 1);
      return NextResponse.json({ ok: true, generated: true, report, summary: summaries[0] || null }, { headers: NO_STORE });
    }

    if (action === 'send') {
      const summaryId = typeof body?.summaryId === 'string' ? body.summaryId.trim() : '';
      if (!UUID_PATTERN.test(summaryId)) {
        return NextResponse.json({ error: 'El resumen indicado no es válido.' }, { status: 400, headers: NO_STORE });
      }
      const phone = typeof body?.phone === 'string' ? body.phone.trim() : undefined;
      const { row, delivery } = await sendDailySummaryNow(supabase, context.tenantId, summaryId, phone);
      return NextResponse.json({ ok: delivery.status === 'sent', summary: row, delivery }, { headers: NO_STORE });
    }

    return NextResponse.json({ error: 'Acción inválida.' }, { status: 400, headers: NO_STORE });
  } catch (error: unknown) {
    return failure(error);
  }
}
