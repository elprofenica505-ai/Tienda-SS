import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { consumeDistributedRateLimits, getClientAddress, rateLimitResponse } from '@/lib/rate-limit';
import { logEvent } from '@/lib/observability';

export const runtime = 'nodejs';

// Pre-login protection is deliberately independent from Firebase Auth so an
// attacker cannot rotate credentials or consume provider capacity unchecked.
const ENABLE_LOGIN_ATTEMPT_RATE_LIMIT = true;

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function emailKey(email: string): string {
  return createHash('sha256').update(email).digest('hex').slice(0, 32);
}

export async function POST(request: NextRequest) {
  let email = '';
  try {
    const body = await request.json();
    email = normalizeEmail(body.email);
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Correo inválido.' }, { status: 400 });
  }

  if (ENABLE_LOGIN_ATTEMPT_RATE_LIMIT) {
    const ip = getClientAddress(request);
    const rate = await consumeDistributedRateLimits(
      { endpoint: `/api/auth/login-attempt:v2:${emailKey(email)}`, ip },
      { ip: 40, endpoint: 15, composite: 15 },
      15 * 60 * 1000,
    );
    if (!rate.allowed) {
      logEvent('warn', 'auth.login.rate_limited', { ip, emailHash: emailKey(email), scope: rate.blockedBy || 'composite', retryAfterSeconds: rate.retryAfterSeconds });
      return rateLimitResponse(rate.retryAfterSeconds, rate.blockedBy);
    }
  }

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
