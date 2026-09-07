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

export type RateLimitLimits = {
  ip?: number;
  uid?: number;
  tenant?: number;
  endpoint?: number;
  composite?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  blockedBy?: keyof RateLimitLimits;
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

function normalize(value: string | undefined): string {
  return value?.trim().slice(0, 160) || 'anonymous';
}

export function getClientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const candidate = forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
  return /^[a-fA-F0-9:.]+$/.test(candidate) ? candidate : 'unknown';
}

export function buildRateLimitKey(dimensions: RateLimitDimensions): string {
  return [normalize(dimensions.endpoint), normalize(dimensions.ip), normalize(dimensions.uid), normalize(dimensions.tenantId)].join(':');
}

function bucketKeys(dimensions: RateLimitDimensions, limits: RateLimitLimits): Array<[keyof RateLimitLimits, string, number]> {
  const endpoint = normalize(dimensions.endpoint);
  const keys: Array<[keyof RateLimitLimits, string, number]> = [];
  if (limits.ip != null) keys.push(['ip', `${endpoint}:ip:${normalize(dimensions.ip)}`, limits.ip]);
  if (limits.uid != null && dimensions.uid) keys.push(['uid', `${endpoint}:uid:${normalize(dimensions.uid)}`, limits.uid]);
  if (limits.tenant != null && dimensions.tenantId) keys.push(['tenant', `${endpoint}:tenant:${normalize(dimensions.tenantId)}`, limits.tenant]);
  if (limits.endpoint != null) keys.push(['endpoint', `${endpoint}:endpoint`, limits.endpoint]);
  if (limits.composite != null) keys.push(['composite', `${endpoint}:composite:${normalize(dimensions.ip)}:${normalize(dimensions.uid)}:${normalize(dimensions.tenantId)}`, limits.composite]);
  return keys;
}

function consumeLocalBuckets(entries: Array<[keyof RateLimitLimits, string, number]>, windowMs: number, now: number): RateLimitResult {
  cleanupExpired(now);
  const states = entries.map(([scope, key, limit]) => ({ scope, key, limit, current: buckets.get(key) }));
  const blocked = states.find(({ current, limit }) => current && current.resetAt > now && current.count >= limit);
  if (blocked) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(((blocked.current?.resetAt || now + windowMs) - now) / 1000)),
      blockedBy: blocked.scope,
    };
  }
  let remaining = Number.POSITIVE_INFINITY;
  let retryAfterSeconds = Math.ceil(windowMs / 1000);
  states.forEach(({ key, limit, current }) => {
    const active = current && current.resetAt > now;
    const next: RateLimitEntry = active ? { count: current.count + 1, resetAt: current.resetAt } : { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    remaining = Math.min(remaining, Math.max(0, limit - next.count));
    retryAfterSeconds = Math.max(retryAfterSeconds, Math.max(1, Math.ceil((next.resetAt - now) / 1000)));
  });
  return { allowed: true, remaining: Number.isFinite(remaining) ? remaining : 0, retryAfterSeconds };
}

export function consumeRateLimits(dimensions: RateLimitDimensions, limits: RateLimitLimits, windowMs: number, now = Date.now()): RateLimitResult {
  return consumeLocalBuckets(bucketKeys(dimensions, limits), windowMs, now);
}

export function consumeRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  return consumeLocalBuckets([['composite', key, limit]], windowMs, now);
}

/** Firestore-backed multi-bucket limiter. All scope counters are checked and incremented atomically. */
export async function consumeDistributedRateLimits(
  dimensions: RateLimitDimensions,
  limits: RateLimitLimits,
  windowMs: number,
  now = Date.now(),
): Promise<RateLimitResult> {
  const entries = bucketKeys(dimensions, limits);
  if (process.env.RATE_LIMIT_SHARED === 'false' || process.env.NODE_ENV === 'test') {
    return consumeLocalBuckets(entries, windowMs, now);
  }
  if (entries.length === 0) return { allowed: true, remaining: 0, retryAfterSeconds: Math.ceil(windowMs / 1000) };

  const db = getAdminDb();
  const refs = entries.map(([, key]) => db.collection('systemRateLimits').doc(encodeURIComponent(key)));
  return db.runTransaction(async (transaction) => {
    const snapshots = [];
    for (const ref of refs) snapshots.push(await transaction.get(ref));
    const states = snapshots.map((snapshot, index) => {
      const data = snapshot.exists ? snapshot.data() as Partial<RateLimitEntry> : undefined;
      const [scope, , limit] = entries[index];
      return { scope, limit, current: data };
    });
    const blocked = states.find(({ current, limit }) => current && typeof current.resetAt === 'number' && current.resetAt > now && Number(current.count || 0) >= limit);
    if (blocked) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil(((blocked.current?.resetAt || now + windowMs) - now) / 1000)),
        blockedBy: blocked.scope,
      } satisfies RateLimitResult;
    }

    let remaining = Number.POSITIVE_INFINITY;
    let retryAfterSeconds = Math.ceil(windowMs / 1000);
    states.forEach(({ current, limit }, index) => {
      const active = typeof current?.resetAt === 'number' && current.resetAt > now;
      const resetAt = active ? Number(current?.resetAt) : now + windowMs;
      const nextCount = active ? Number(current?.count || 0) + 1 : 1;
      transaction.set(refs[index], { count: nextCount, resetAt, updatedAt: now }, { merge: true });
      remaining = Math.min(remaining, Math.max(0, limit - nextCount));
      retryAfterSeconds = Math.max(retryAfterSeconds, Math.max(1, Math.ceil((resetAt - now) / 1000)));
    });
    return { allowed: true, remaining: Number.isFinite(remaining) ? remaining : 0, retryAfterSeconds } satisfies RateLimitResult;
  });
}

export async function consumeDistributedRateLimit(dimensions: RateLimitDimensions, limit: number, windowMs: number, now = Date.now()): Promise<RateLimitResult> {
  return consumeDistributedRateLimits(dimensions, { composite: limit }, windowMs, now);
}

export function rateLimitResponse(retryAfterSeconds: number, blockedBy?: keyof RateLimitLimits) {
  return new Response(JSON.stringify({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.', code: 'RATE_LIMITED', scope: blockedBy || 'composite' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfterSeconds),
      'Cache-Control': 'no-store',
    },
  });
}
