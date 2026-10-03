import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { writeImmutableAudit } from '@/lib/audit';
import { loadReceivablesReminderSettings, saveReceivablesReminderSettings, reminderAutomationStatus } from '@/lib/receivables-reminders-service';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };
const MANAGER_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);

function failure(error: unknown) {
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status, headers: NO_STORE });
}

function canManage(role: string) {
  return MANAGER_ROLES.has(role);
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'receivables', 'view');
    if (!canManage(context.role)) {
      return NextResponse.json({ error: 'Solo administración puede ver la configuración del agente de cobranza.' }, { status: 403, headers: NO_STORE });
    }
    const loaded = await loadReceivablesReminderSettings(getSupabaseServer(), context.tenantId);
    return NextResponse.json({ ok: true, ...loaded, whatsapp: reminderAutomationStatus() }, { headers: NO_STORE });
  } catch (error: unknown) {
    return failure(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'receivables', 'edit');
    if (!canManage(context.role)) {
      return NextResponse.json({ error: 'Solo administración puede cambiar la configuración del agente de cobranza.' }, { status: 403, headers: NO_STORE });
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Configuración inválida.' }, { status: 400, headers: NO_STORE });
    }

    const supabase = getSupabaseServer();
    const before = await loadReceivablesReminderSettings(supabase, context.tenantId);
    const settings = await saveReceivablesReminderSettings(supabase, context.tenantId, body, context.uid);
    try {
      await writeImmutableAudit({
        tenantId: context.tenantId,
        actor: context,
        action: 'receivables_reminders.settings.update',
        entity: 'tenant_settings',
        before: before.settings,
        after: settings,
        request: { method: 'PUT', path: request.nextUrl.pathname, requestId: request.headers.get('x-correlation-id') || undefined },
        result: 'success',
      });
    } catch (error: unknown) {
      console.error('receivables_reminder_settings_audit_failed', {
        message: error instanceof Error ? error.message : 'unknown',
      });
    }

    return NextResponse.json({ ok: true, settings, configured: true, whatsapp: reminderAutomationStatus() }, { headers: NO_STORE });
  } catch (error: unknown) {
    return failure(error);
  }
}
