import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runReceivablesReminderCycle } from '@/lib/receivables-reminders-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };

function hasValidCronSecret(request: NextRequest, expectedSecret: string): boolean {
  const authorization = request.headers.get('authorization') || '';
  const suppliedSecret = /^Bearer\s+(.+)$/i.exec(authorization)?.[1] || '';
  const expected = Buffer.from(expectedSecret);
  const supplied = Buffer.from(suppliedSecret);
  return expected.length > 0 && expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

/** Revisa cuentas activas y entrega recordatorios/alertas respetando la zona horaria de cada empresa. */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'La tarea de cobranza no tiene configurada su clave de seguridad.' }, { status: 503, headers: NO_STORE });
  }
  if (!hasValidCronSecret(request, cronSecret)) {
    return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401, headers: NO_STORE });
  }

  const tenantId = request.nextUrl.searchParams.get('tenantId')?.trim() || undefined;
  if (tenantId && !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    return NextResponse.json({ ok: false, error: 'El identificador de empresa no es válido.' }, { status: 400, headers: NO_STORE });
  }

  try {
    const report = await runReceivablesReminderCycle({ tenantId });
    return NextResponse.json({ ok: report.ok, report }, { status: report.ok ? 200 : 503, headers: NO_STORE });
  } catch (error: unknown) {
    console.error('receivables_reminders_cycle_failed', {
      message: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    });
    return NextResponse.json({ ok: false, error: 'No se pudo ejecutar el ciclo de cobranza automática.' }, { status: 503, headers: NO_STORE });
  }
}
