import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function hasValidCronSecret(request: NextRequest, expectedSecret: string): boolean {
  const authorization = request.headers.get('authorization') || '';
  const suppliedSecret = /^Bearer\s+(.+)$/i.exec(authorization)?.[1] || '';
  const expected = Buffer.from(expectedSecret);
  const supplied = Buffer.from(suppliedSecret);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'La tarea diaria no tiene configurada su clave de seguridad.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (!hasValidCronSecret(request, cronSecret)) {
    return NextResponse.json(
      { ok: false, error: 'No autorizado.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const result = await getSupabaseServer().rpc('generate_daily_smart_alerts');
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json(
      { ok: true, result: result.data },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    console.error('daily_smart_alerts_generation_failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { ok: false, error: 'No se pudieron generar las alertas diarias.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
