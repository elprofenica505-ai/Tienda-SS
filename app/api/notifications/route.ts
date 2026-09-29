import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantMember, tenantErrorResponse } from '@/lib/tenant';

export const runtime = 'nodejs';

const MANAGER_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);
const NO_STORE = { 'Cache-Control': 'no-store' };

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

    let smartAlerts: Array<Record<string, any>> = [];
    if (MANAGER_ROLES.has(context.role)) {
      const alertResult = await supabase
        .from('daily_smart_alerts')
        .select('id,alert_type,severity,title,message,metadata,is_read,last_detected_at,read_at,read_by')
        .eq('tenant_id', context.tenantId)
        .eq('is_active', true)
        .order('last_detected_at', { ascending: false })
        .limit(100);
      if (alertResult.error) throw new Error(alertResult.error.message);
      smartAlerts = alertResult.data || [];
    }

    const notifications = [
      ...(notificationResult.data || []).map((item) => ({
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
      })),
      ...smartAlerts.map((item) => ({
        id: String(item.id),
        type: String(item.alert_type),
        source: 'daily_alert',
        title: String(item.title),
        message: String(item.message),
        metadata: item.metadata,
        read: Boolean(item.is_read),
        active: true,
        severity: String(item.severity),
        createdAt: item.last_detected_at,
        readAt: item.read_at,
        readBy: item.read_by,
      })),
    ].sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));

    return NextResponse.json(
      { ok: true, notifications: notifications.slice(0, 100), activeAlertsCount: smartAlerts.length },
      { headers: NO_STORE },
    );
  } catch (error: unknown) {
    return failure(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireTenantMember(request);
    const body = await request.json();
    const id = text(body.id);
    const source = body.source === 'daily_alert' ? 'daily_alert' : 'notification';
    if (!id) return NextResponse.json({ error: 'Alerta inválida.' }, { status: 400, headers: NO_STORE });

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
