import { getSupabaseServer } from '@/lib/supabase/server';
import {
  DEFAULT_AI_CONFIG,
  isAiPersonality,
  type AiHistoryMessage,
  type AiQuota,
  type TenantAiConfig,
} from '@/lib/ai/types';

function safeText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function safeNumber(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function managuaLocalDate(value = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function managuaResetAt(localDate = managuaLocalDate()): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1, 6, 0, 0));
  return nextDay.toISOString();
}

export function defaultTenantAiConfig(tenantId: string): TenantAiConfig {
  return { tenantId, ...DEFAULT_AI_CONFIG };
}

function mapTenantAiConfig(tenantId: string, row: Record<string, unknown> | null | undefined): TenantAiConfig {
  if (!row) return defaultTenantAiConfig(tenantId);
  const dailyLimit = Math.min(100, Math.max(1, Math.round(safeNumber(row.daily_limit, 20))));
  return {
    id: safeText(row.id) || undefined,
    tenantId,
    provider: 'gemini',
    apiKeyEncrypted: safeText(row.api_key_encrypted) || null,
    personality: isAiPersonality(row.personality) ? row.personality : 'conexia',
    dailyLimit,
    enabled: row.enabled !== false,
    customInstructions: safeText(row.custom_instructions).slice(0, 4000),
    createdAt: safeText(row.created_at) || undefined,
    updatedAt: safeText(row.updated_at) || undefined,
  };
}

export async function getTenantAiConfig(tenantId: string): Promise<TenantAiConfig> {
  const result = await getSupabaseServer()
    .from('tenant_ai_config')
    .select('id,tenant_id,provider,api_key_encrypted,personality,daily_limit,enabled,custom_instructions,created_at,updated_at')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return mapTenantAiConfig(tenantId, result.data as Record<string, unknown> | null);
}

export async function saveTenantAiConfig(config: TenantAiConfig): Promise<TenantAiConfig> {
  const result = await getSupabaseServer()
    .from('tenant_ai_config')
    .upsert({
      tenant_id: config.tenantId,
      provider: 'gemini',
      api_key_encrypted: config.apiKeyEncrypted,
      personality: config.personality,
      daily_limit: config.dailyLimit,
      enabled: config.enabled,
      custom_instructions: config.customInstructions || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' })
    .select('id,tenant_id,provider,api_key_encrypted,personality,daily_limit,enabled,custom_instructions,created_at,updated_at')
    .single();
  if (result.error) throw new Error(result.error.message);
  return mapTenantAiConfig(config.tenantId, result.data as Record<string, unknown>);
}

export async function getAiDailyUsage(tenantId: string, localDate = managuaLocalDate()): Promise<number> {
  const result = await getSupabaseServer()
    .from('ai_chat_daily_usage')
    .select('query_count')
    .eq('tenant_id', tenantId)
    .eq('local_date', localDate)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return Math.max(0, safeNumber((result.data as Record<string, unknown> | null)?.query_count, 0));
}

export function freeAiQuota(used: number, limit: number, localDate = managuaLocalDate()): AiQuota {
  const normalizedLimit = Math.min(100, Math.max(1, Math.round(limit)));
  const normalizedUsed = Math.max(0, Math.round(used));
  return {
    used: normalizedUsed,
    limit: normalizedLimit,
    remaining: Math.max(0, normalizedLimit - normalizedUsed),
    localDate,
    resetAt: managuaResetAt(localDate),
    timezone: 'America/Managua',
    unlimited: false,
  };
}

export function unlimitedAiQuota(): AiQuota {
  return {
    used: 0,
    limit: null,
    remaining: null,
    timezone: 'America/Managua',
    unlimited: true,
  };
}

export async function getRecentAiHistory(tenantId: string, limit = 10): Promise<AiHistoryMessage[]> {
  const safeLimit = Math.min(50, Math.max(1, Math.round(limit)));
  const result = await getSupabaseServer()
    .from('ai_chat_history')
    .select('id,role,content,metadata,created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(safeLimit);
  if (result.error) throw new Error(result.error.message);
  return (result.data || []).map((row: any) => ({
    id: typeof row.id === 'string' ? row.id : undefined,
    role: row.role === 'assistant' || row.role === 'system' ? row.role : 'user',
    content: safeText(row.content),
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {},
    createdAt: safeText(row.created_at) || undefined,
  })).reverse();
}

export async function saveAiHistoryMessage({
  tenantId,
  userId,
  role,
  content,
  metadata = {},
}: {
  tenantId: string;
  userId?: string | null;
  role: AiHistoryMessage['role'];
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<AiHistoryMessage> {
  const result = await getSupabaseServer()
    .from('ai_chat_history')
    .insert({
      tenant_id: tenantId,
      user_id: userId || null,
      role,
      content,
      metadata,
    })
    .select('id,role,content,metadata,created_at')
    .single();
  if (result.error) throw new Error(result.error.message);
  const row = result.data as any;
  return {
    id: row.id,
    role: row.role === 'assistant' || row.role === 'system' ? row.role : 'user',
    content: safeText(row.content),
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {},
    createdAt: safeText(row.created_at) || undefined,
  };
}

export async function clearAiHistory(tenantId: string): Promise<void> {
  const result = await getSupabaseServer().from('ai_chat_history').delete().eq('tenant_id', tenantId);
  if (result.error) throw new Error(result.error.message);
}
