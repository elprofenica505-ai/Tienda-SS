import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isSummaryDateKey } from '@/lib/daily-summary';
import { runDailySummaryCycle } from '@/lib/daily-summary-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };

function hasValidCronSecret(request: NextRequest, expectedSecret: string): boolean {
  const authorization = request.headers.get('authorization') || '';
  const suppliedSecret = /^Bearer\s+(.+)$/i.exec(authorization)?.[1] || '';
  const expected = Buffer.from(expectedSecret);
  const supplied = Buffer.from(suppliedSecret);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

/**
 * Corrida programada del Resumen Diario Automático.
 *
 * Es idempotente: cada empresa tiene su hora local configurada dentro del sistema y esta ruta
 * solo genera/envía los resúmenes cuya hora ya pasó y siguen dentro de la ventana de gracia
 * (DAILY_SUMMARY_WINDOW_HOURS, 6 h por defecto). Por eso se recomienda programarla cada hora.
 *
 * Parámetros opcionales (solo con el secreto del cron):
 *   ?tenantId=<uuid>   procesa una sola empresa
 *   ?date=YYYY-MM-DD   resume una fecha específica
 *   ?force=1           ignora la hora configurada y la ventana (pero respeta whatsappEnabled)
 *   ?generateOnly=1    calcula y guarda el resumen sin enviar WhatsApp (pruebas)
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'La tarea del resumen diario no tiene configurada su clave de seguridad.' },
      { status: 503, headers: NO_STORE },
    );
  }
  if (!hasValidCronSecret(request, cronSecret)) {
    return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401, headers: NO_STORE });
  }

  const params = request.nextUrl.searchParams;
  const tenantId = params.get('tenantId')?.trim() || undefined;
  const date = params.get('date')?.trim() || undefined;
  const force = params.get('force') === '1' || params.get('force') === 'true';
  const generateOnly = params.get('generateOnly') === '1' || params.get('generateOnly') === 'true';
  if (date && !isSummaryDateKey(date)) {
    return NextResponse.json({ ok: false, error: 'La fecha debe tener formato YYYY-MM-DD.' }, { status: 400, headers: NO_STORE });
  }

  try {
    const report = await runDailySummaryCycle({ tenantId, date, force, generateOnly });
    return NextResponse.json({ ok: report.ok, report }, { headers: NO_STORE });
  } catch (error: unknown) {
    console.error('daily_summary_cycle_failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { ok: false, error: 'No se pudieron generar los resúmenes diarios.' },
      { status: 503, headers: NO_STORE },
    );
  }
}
