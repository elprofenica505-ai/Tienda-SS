import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { logEvent } from '@/lib/observability';
import { getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export function GET(): NextResponse;
export function GET(request: Request): NextResponse | Promise<NextResponse>;
export function GET(request?: Request): NextResponse | Promise<NextResponse> {
  const readiness = request ? new URL(request.url).searchParams.get('ready') === 'true' : false;
  if (!readiness) {
    return response({ ok: true, status: 'live', service: 'tienda-ss', timestamp: new Date().toISOString() });
  }
  return readinessResponse();
}

async function readinessResponse() {
  const checks: Record<string, string> = { process: 'ok' };
  try {
    await getAdminDb().collection('system').doc('health').get();
    checks.firestore = 'ok';
  } catch (error) {
    checks.firestore = 'failed';
    logEvent('error', 'health.readiness.failed', { dependency: 'firestore', error: error instanceof Error ? error.message : 'unknown' });
  }

  if (process.env.STRIPE_SECRET_KEY) {
    try { await getStripe().accounts.retrieve(null); checks.stripe = 'ok'; }
    catch (error) { checks.stripe = 'failed'; logEvent('error', 'health.readiness.failed', { dependency: 'stripe', error: error instanceof Error ? error.message : 'unknown' }); }
  } else checks.stripe = 'not_configured';
  if (process.env.RESEND_API_KEY) checks.email = 'configured';
  else checks.email = 'not_configured';

  const ok = checks.firestore === 'ok' && checks.stripe === 'ok';
  return response({ ok, status: ok ? 'ready' : 'not_ready', service: 'tienda-ss', checks, timestamp: new Date().toISOString() }, ok ? 200 : 503);
}
