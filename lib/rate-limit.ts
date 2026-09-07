import { getAdminDb } from '@/lib/firebaseAdmin';

export type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitDimensions = {
  ip?: string;
  uid?: string;
  tenantId?: string;
  endpoint: string;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

const buckets = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanupAt = 0;

function cleanupExpired(now: number) {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  for (const [key, entry] of Array.from(buckets.entries())) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}

export function getClientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function buildRateLimitKey(dimensions: RateLimitDimensions): string {
  const normalize = (value: string | undefined) => value?.trim().slice(0, 160) || 'anonymous';
  return [normalize(dimensions.endpoint), normalize(dimensions.ip), normalize(dimensions.uid), normalize(dimensions.tenantId)].join(':');
}

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  cleanupExpired(now);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, limit - current.count),
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

/**
 * Firestore-backed limiter. The transaction makes increments atomic across
 * server instances. Set RATE_LIMIT_SHARED=false only for local tests.
 */
export async function consumeDistributedRateLimit(
  dimensions: RateLimitDimensions,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<RateLimitResult> {
  const key = buildRateLimitKey(dimensions);
  if (process.env.RATE_LIMIT_SHARED === 'false' || process.env.NODE_ENV === 'test') {
    return consumeRateLimit(key, limit, windowMs, now);
  }

  const ref = getAdminDb().collection('systemRateLimits').doc(encodeURIComponent(key));
  const result = await getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? snapshot.data() as Partial<RateLimitEntry> : undefined;
    const resetAt = typeof current?.resetAt === 'number' ? current.resetAt : 0;
    const count = resetAt > now && typeof current?.count === 'number' ? current.count : 0;
    const nextResetAt = resetAt > now ? resetAt : now + windowMs;
    const allowed = count < limit;
    const nextCount = allowed ? count + 1 : count;
    transaction.set(ref, { count: nextCount, resetAt: nextResetAt, updatedAt: now }, { merge: true });
    return {
      allowed,
      remaining: Math.max(0, limit - nextCount),
      retryAfterSeconds: Math.max(1, Math.ceil((nextResetAt - now) / 1000)),
    } satisfies RateLimitResult;
  });
  return result;
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return new Response(JSON.stringify({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfterSeconds),
      'Cache-Control': 'no-store',
    },
  });
}
