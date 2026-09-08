import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { consumeDistributedRateLimits, getClientAddress, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

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

  const ip = getClientAddress(request);
  const rate = await consumeDistributedRateLimits(
    { endpoint: `/api/auth/login-attempt:${emailKey(email)}`, ip },
    { ip: 20, endpoint: 8, composite: 8 },
    15 * 60 * 1000,
  );
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds, rate.blockedBy);

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
