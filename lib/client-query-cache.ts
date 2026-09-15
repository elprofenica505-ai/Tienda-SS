'use client';

type CacheEntry<T> = { value: T; expiresAt: number };

const values = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export async function getClientCached<T>(key: string, loader: () => Promise<T>, ttlMs: number, force = false): Promise<T> {
  if (!force) {
    const cached = values.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;
    if (cached) values.delete(key);
    const pending = inFlight.get(key);
    if (pending) return pending as Promise<T>;
  }

  const request = loader().then((value) => {
    values.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }).finally(() => {
    if (inFlight.get(key) === request) inFlight.delete(key);
  });
  inFlight.set(key, request);
  return request;
}

export function invalidateClientCache(prefix: string) {
  for (const key of Array.from(values.keys())) if (key.startsWith(prefix)) values.delete(key);
  for (const key of Array.from(inFlight.keys())) if (key.startsWith(prefix)) inFlight.delete(key);
}

export function clearClientCache() {
  values.clear();
  inFlight.clear();
}
