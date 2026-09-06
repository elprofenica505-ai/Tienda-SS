type RateLimitEntry = {
  count: number;
  resetAt: number;
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

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
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
