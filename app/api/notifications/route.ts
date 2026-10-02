import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantMember, tenantErrorResponse } from '@/lib/tenant';
import { loadLiveStockAlerts, mergeStockAlerts, prioritizeAlerts, type SmartAlertRow } from '@/lib/live-stock-alerts';

export const runtime = 'nodejs';

const MANAGER_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);
const NO_STORE = { 'Cache-Control': 'no-store' };
const LIST_LIMIT = 100;
// La generación SQL recalcula TODAS las empresas, así que la actualización manual se limita:
// una vez cada 30 s por empresa en esta instancia, y nunca si alguien la ejecutó hace menos de 60 s.
const MANUAL_REFRESH_COOLDOWN_MS = 30_000;
const GENERATION_FRESH_WINDOW_MS = 60_000;
const lastManualRefresh = new Map<string, number>();

function text(value: unknown, max = 128) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function failure(error: unknown) {
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status, headers: NO_STORE });
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantMember(request);
    const supabase = getSupabaseServer();
    const notificationResult = await supabase
      .from('notifications')
      .select('id,notification_type,title,message,metadata,is_read,created_at,read_at,read_by')
      .eq('tenant_id', context.tenantId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (notificationResult.error) throw new Error(notificationResult.error.message);

    let smartAlerts: SmartAlertRow[] = [];
    let liveStock: { ok: boolean; checkedAt: string | null; error: string | null } | null = null;
    if (MANAGER_ROLES.has(context.role)) {
      const alertResult = await supabase
        .from('daily_smart_alerts')
        .select('id,alert_type,severity,title,message,metadata,is_read,last_detected_at,read_at,read_by')
        .eq('tenant_id', context.tenantId)
        .eq('is_active', true)
        .order('last_detected_at', { ascending: false })
        .limit(100);
      if (alertResult.error) throw new Error(alertResult.error.message);
      const storedAlerts = (alertResult.data || []) as SmartAlertRow[];

      // Stock en vivo: el producto que se agota hoy aparece ya, sin esperar a la tarea diaria.
      // Nunca lanza: si falla, se muestran las alertas guardadas como antes.
      const live = await loadLiveStockAlerts(supabase, context.tenantId);
      smartAlerts = mergeStockAlerts(storedAlerts, live.alerts, live.checkedAt || new Date().toISOString());
      liveStock = { ok: live.alerts !== null, checkedAt: live.checkedAt, error: live.error };
    }

    const platformNotifications = (notificationResult.data || []).map((item) => ({
      id: item.id,
      type: item.notification_type,
      source: 'notification',
      title: item.title,
      message: item.message,
      metadata: item.metadata,
      read: item.is_read,
      active: true,
      severity: 'info',
      createdAt: item.created_at,
      readAt: item.read_at,
      readBy: item.read_by,
    }));
    // Las notificaciones de la plataforma (cobros, suscripción) nunca se desplazan de la lista por
    // una avalancha de alertas de stock: las alertas usan solo el espacio restante, las más urgentes primero.
    const alertBudget = Math.max(0, LIST_LIMIT - platformNotifications.length);
    const operationalAlerts = prioritizeAlerts(smartAlerts).slice(0, alertBudget).map((item) => ({
      id: String(item.id),
      type: String(item.alert_type),
      source: item.live ? 'live_alert' : 'daily_alert',
      title: String(item.title),
      message: String(item.message),
      metadata: item.metadata,
      read: Boolean(item.is_read),
      active: true,
      severity: String(item.severity),
      createdAt: item.last_detected_at,
      readAt: item.read_at,
      readBy: item.read_by,
    }));

    const notifications = [...platformNotifications, ...operationalAlerts]
      .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));

    return NextResponse.json(
      { ok: true, notifications: notifications.slice(0, LIST_LIMIT), activeAlertsCount: smartAlerts.length, liveStock },
      { headers: NO_STORE },
    );
  } catch (error: unknown) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantMember(request);
    if (!MANAGER_ROLES.has(context.role)) {
      return NextResponse.json({ error: 'Solo administración puede actualizar las alertas.' }, { status: 403, headers: NO_STORE });
    }
    const body = await request.json().catch(() => null);
    if (!body || body.action !== 'refresh') {
      return NextResponse.json({ error: 'Acción inválida.' }, { status: 400, headers: NO_STORE });
    }

    const now = Date.now();
    const lastForTenant = lastManualRefresh.get(context.tenantId) || 0;
    if (now - lastForTenant < MANUAL_REFRESH_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((MANUAL_REFRESH_COOLDOWN_MS - (now - lastForTenant)) / 1000);
      return NextResponse.json({ ok: true, refreshed: false, throttled: true, retryAfterSeconds }, { headers: NO_STORE });
    }

    const supabase = getSupabaseServer();
    const latest = await supabase
      .from('daily_smart_alerts')
      .select('last_detected_at')
      .order('last_detected_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const latestTime = latest.error || !latest.data?.last_detected_at ? 0 : Date.parse(String(latest.data.last_detected_at));
    if (Number.isFinite(latestTime) && latestTime > 0 && now - latestTime < GENERATION_FRESH_WINDOW_MS) {
      const retryAfterSeconds = Math.ceil((GENERATION_FRESH_WINDOW_MS - (now - latestTime)) / 1000);
      return NextResponse.json({ ok: true, refreshed: false, throttled: true, retryAfterSeconds }, { headers: NO_STORE });
    }

    const result = await supabase.rpc('generate_daily_smart_alerts');
    if (result.error) {
      console.error('manual_smart_alerts_refresh_failed', { message: result.error.message });
      return NextResponse.json(
        { error: 'No se pudieron recalcular las alertas. Intenta de nuevo en un momento.' },
        { status: 503, headers: NO_STORE },
      );
    }

    lastManualRefresh.set(context.tenantId, now);
    for (const [tenantId, time] of Array.from(lastManualRefresh.entries())) {
      if (now - time > MANUAL_REFRESH_COOLDOWN_MS) lastManualRefresh.delete(tenantId);
    }
    return NextResponse.json({ ok: true, refreshed: true, throttled: false }, { headers: NO_STORE });
  } catch (error: unknown) {
    return failure(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireTenantMember(request);
    const body = await request.json();
    const id = text(body.id);
    const source = body.source === 'daily_alert' ? 'daily_alert' : body.source === 'live_alert' ? 'live_alert' : 'notification';
    if (!id) return NextResponse.json({ error: 'Alerta inválida.' }, { status: 400, headers: NO_STORE });
    if (source === 'live_alert') {
      return NextResponse.json({ error: 'Las alertas en vivo se quitan solas cuando repones el inventario.' }, { status: 400, headers: NO_STORE });
    }

    const supabase = getSupabaseServer();
    const result = source === 'daily_alert'
      ? MANAGER_ROLES.has(context.role)
        ? await supabase.from('daily_smart_alerts')
          .update({ is_read: true, read_at: new Date().toISOString(), read_by: context.uid })
          .eq('id', id)
          .eq('tenant_id', context.tenantId)
          .eq('is_active', true)
          .select('id')
          .maybeSingle()
        : null
      : await supabase.from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString(), read_by: context.uid })
        .eq('id', id)
        .eq('tenant_id', context.tenantId)
        .select('id')
        .maybeSingle();

    if (!result) return NextResponse.json({ error: 'No tienes permiso para marcar esta alerta.' }, { status: 403, headers: NO_STORE });
    if (result.error) throw new Error(result.error.message);
    if (!result.data) return NextResponse.json({ error: 'Alerta no encontrada.' }, { status: 404, headers: NO_STORE });
    return NextResponse.json({ ok: true, id, source }, { headers: NO_STORE });
  } catch (error: unknown) {
    return failure(error);
  }
}
