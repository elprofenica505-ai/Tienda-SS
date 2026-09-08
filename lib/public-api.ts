import { createHash, randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { consumeDistributedRateLimits, getClientAddress } from '@/lib/rate-limit';

export function hashApiKey(value: string): string { return createHash('sha256').update(value).digest('hex'); }

export function createApiKey(): { value: string; hash: string; prefix: string } {
  const value = `tss_live_${randomBytes(24).toString('base64url')}`;
  return { value, hash: hashApiKey(value), prefix: value.slice(0, 14) };
}

export async function requirePublicApiKey(request: NextRequest) {
  const raw = request.headers.get('x-api-key')?.trim() || '';
  if (!/^tss_live_[A-Za-z0-9_-]{20,}$/.test(raw)) throw new Error('API_KEY_INVALID');
  const db = getAdminDb();
  const matches = await db.collectionGroup('apiKeys').where('hash', '==', hashApiKey(raw)).limit(1).get();
  const key = matches.docs[0];
  if (!key || key.data()?.status !== 'active') throw new Error('API_KEY_INVALID');
  const tenantRef = key.ref.parent.parent;
  if (!tenantRef) throw new Error('API_KEY_INVALID');
  const tenantSnapshot = await tenantRef.get();
  if (!tenantSnapshot.exists || tenantSnapshot.data()?.status !== 'active' || tenantSnapshot.data()?.platformStatus === 'suspended') throw new Error('API_KEY_INVALID');
  const tenantId = tenantRef.id;
  const rate = await consumeDistributedRateLimits({ endpoint: request.nextUrl.pathname, ip: getClientAddress(request), tenantId }, { ip: 60, tenant: 600, endpoint: 300 }, 60_000);
  if (!rate.allowed) throw new Error('API_RATE_LIMITED');
  return { tenantId, keyId: key.id, tenantSnapshot: tenantSnapshot.data() || {} };
}

export function publicApiError(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  if (code === 'API_RATE_LIMITED') return { status: 429, body: { error: 'Límite de API alcanzado.', code } };
  if (code === 'API_KEY_INVALID') return { status: 401, body: { error: 'API key inválida.', code } };
  return { status: 500, body: { error: 'Error interno del servidor.' } };
}
