import { getSupabaseServer } from '@/lib/supabase/server';

export type AiUsageResult = {
  allowed?: boolean;
  tenantId: string;
  plan: string;
  usageDate: string;
  dailyLimit: number;
  used: number;
  remaining: number;
  lastResetAt: string | null;
  nextResetAt: string;
};

function normalizeResult(data: unknown): AiUsageResult {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object') throw new Error('AI_USAGE_INVALID_RESPONSE');

  const result = value as Record<string, unknown>;
  const dailyLimit = Number(result.dailyLimit);
  const used = Number(result.used);
  const remaining = Number(result.remaining);
  if (
    typeof result.tenantId !== 'string' ||
    typeof result.plan !== 'string' ||
    typeof result.usageDate !== 'string' ||
    !Number.isInteger(dailyLimit) || dailyLimit < 0 ||
    !Number.isInteger(used) || used < 0 ||
    !Number.isInteger(remaining) || remaining < 0 ||
    typeof result.nextResetAt !== 'string'
  ) {
    throw new Error('AI_USAGE_INVALID_RESPONSE');
  }

  return {
    allowed: typeof result.allowed === 'boolean' ? result.allowed : undefined,
    tenantId: result.tenantId,
    plan: result.plan,
    usageDate: result.usageDate,
    dailyLimit,
    used,
    remaining,
    lastResetAt: typeof result.lastResetAt === 'string' ? result.lastResetAt : null,
    nextResetAt: result.nextResetAt,
  };
}

/** Read-only status. Does not spend a daily AI query. */
export async function getAiUsageStatus(tenantId: string): Promise<AiUsageResult> {
  const result = await getSupabaseServer().rpc('get_ai_usage_status', { target_tenant_id: tenantId });
  if (result.error) throw new Error(`AI_USAGE_STATUS_FAILED:${result.error.message}`);
  return normalizeResult(result.data);
}

/** Atomically reserves one query before any future Gemini request is made. */
export async function consumeAiQuery(tenantId: string): Promise<AiUsageResult> {
  const result = await getSupabaseServer().rpc('consume_ai_query', { target_tenant_id: tenantId });
  if (result.error) throw new Error(`AI_USAGE_CONSUME_FAILED:${result.error.message}`);
  return normalizeResult(result.data);
}
