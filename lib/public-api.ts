import { createHash, randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { consumeDistributedRateLimits, getClientAddress } from '@/lib/rate-limit';

export function hashApiKey(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function createApiKey(): { value: string; hash: string; prefix: string } { const value = `tss_live_${randomBytes(24).toString('base64url')}`; return { value, hash: hashApiKey(value), prefix: value.slice(0, 14) }; }
export async function requirePublicApiKey(request: NextRequest) {
  const raw = request.headers.get('x-api-key')?.trim() || '';
  if (!/^tss_live_[A-Za-z0-9_-]{20,}$/.test(raw)) throw new Error('API_KEY_INVALID');
  const result = await getSupabaseServer().from('api_keys').select('id,tenant_id,status').eq('hash', hashApiKey(raw)).eq('status', 'active').maybeSingle();
  if (result.error || !result.data) throw new Error('API_KEY_INVALID');
  const tenant = await getSupabaseServer().from('tenants').select('id,status,platform_status,plan').eq('id', result.data.tenant_id).maybeSingle();
  if (tenant.error || !tenant.data || tenant.data.status !== 'active' || tenant.data.platform_status === 'suspended') throw new Error('API_KEY_INVALID');
  const rate = await consumeDistributedRateLimits({ endpoint: request.nextUrl.pathname, ip: getClientAddress(request), tenantId: result.data.tenant_id }, { ip: 60, tenant: 600, endpoint: 300 }, 60_000);
  if (!rate.allowed) throw new Error('API_RATE_LIMITED');
  await getSupabaseServer().from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', result.data.id).eq('tenant_id', result.data.tenant_id);
  return { tenantId: result.data.tenant_id, keyId: result.data.id, tenantSnapshot: tenant.data };
}
export function publicApiError(error: unknown) { const code = error instanceof Error ? error.message : ''; if (code === 'API_RATE_LIMITED') return { status: 429, body: { error: 'Límite de API alcanzado.', code } }; if (code === 'API_KEY_INVALID') return { status: 401, body: { error: 'API key inválida.', code } }; return { status: 500, body: { error: 'Error interno del servidor.' } }; }
