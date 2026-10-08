import { NextRequest, NextResponse } from 'next/server';
import { buildSystemPrompt, getTenantContextForAI } from '@/lib/ai/context';
import { decryptApiKey } from '@/lib/ai/encryption';
import { callGemini, GeminiCallError, resolveGeminiModel } from '@/lib/ai/gemini';
import { aiErrorResponse, aiJsonBody, noStoreJson, requireAiManager } from '@/lib/ai/route-utils';
import {
  freeAiQuota,
  getRecentAiHistory,
  getTenantAiConfig,
  saveAiHistoryMessage,
  unlimitedAiQuota,
} from '@/lib/ai/store';
import type { AiHistoryMessage, AiQuota } from '@/lib/ai/types';
import { getSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const NO_API_KEY_MESSAGE = 'No hay API Key configurada. Agrega tu propia key en Configuración IA o configura GEMINI_API_KEY en Vercel.';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown, fallback = 0): number {
  const candidate = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(candidate) ? candidate : fallback;
}

function rpcQuota(value: unknown, fallbackLimit: number): { allowed: boolean; quota: AiQuota } {
  const data = record(value);
  const limit = Math.min(100, Math.max(1, Math.round(numberValue(data.limit, fallbackLimit))));
  const used = Math.max(0, Math.round(numberValue(data.used, 0)));
  const remaining = Math.max(0, Math.round(numberValue(data.remaining, limit - used)));
  return {
    allowed: data.allowed === true,
    quota: {
      used,
      limit,
      remaining,
      localDate: typeof data.localDate === 'string' ? data.localDate : undefined,
      resetAt: typeof data.resetAt === 'string' ? data.resetAt : undefined,
      timezone: 'America/Managua',
      unlimited: false,
    },
  };
}

async function releaseReservedQuota(tenantId: string): Promise<void> {
  try {
    await getSupabaseServer().rpc('release_ai_chat_quota', { target_tenant_id: tenantId });
  } catch {
    // A release failure must not expose provider/database details to the owner.
  }
}

function geminiFailure(error: GeminiCallError, usingOwnKey: boolean, quota: AiQuota) {
  if (error.code === 'QUOTA_EXCEEDED') {
    return noStoreJson({
      error: 'Gemini alcanzó temporalmente su cuota. Tu consulta no fue descontada; intenta de nuevo en unos minutos o usa otra API Key.',
      code: error.code,
      quota,
      usingOwnKey,
    }, 429);
  }
  if (error.code === 'API_KEY_INVALID') {
    return noStoreJson({
      error: usingOwnKey
        ? 'Tu API Key de Gemini no es válida o no tiene acceso al modelo. Revísala en Configuración IA.'
        : 'La API Key de Gemini configurada en el servidor no es válida. Configura GEMINI_API_KEY en Vercel o agrega tu propia key.',
      code: error.code,
      quota,
      usingOwnKey,
    }, 503);
  }
  if (error.code === 'MODEL_NOT_FOUND') {
    return noStoreJson({
      error: 'El modelo de Gemini configurado ya no está disponible. Define GEMINI_MODEL en Vercel con un modelo vigente (por ejemplo gemini-3.1-flash-lite). Tu consulta no fue descontada.',
      code: error.code,
      quota,
      usingOwnKey,
    }, 503);
  }
  if (error.code === 'GEMINI_EMPTY_RESPONSE') {
    return noStoreJson({ error: 'Conexia no recibió una respuesta utilizable. Tu consulta no fue descontada; intenta nuevamente.', code: error.code, quota, usingOwnKey }, 502);
  }
  return noStoreJson({ error: 'Conexia no pudo conectarse con Gemini en este momento. Tu consulta no fue descontada; intenta nuevamente.', code: error.code, quota, usingOwnKey }, 503);
}

export async function POST(request: NextRequest) {
  let quotaReserved = false;
  let geminiCompleted = false;
  let reservedTenantId = '';
  let quota: AiQuota | null = null;
  let usingOwnKey = false;
  const model = resolveGeminiModel();

  try {
    const context = await requireAiManager(request);
    reservedTenantId = context.tenantId;
    const body = await aiJsonBody(request);
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > 2000) throw new Error('AI_MESSAGE_INVALID');

    const config = await getTenantAiConfig(context.tenantId);
    let apiKey = '';
    if (config.enabled && config.apiKeyEncrypted) {
      apiKey = decryptApiKey(config.apiKeyEncrypted);
      usingOwnKey = true;
      quota = unlimitedAiQuota();
    } else {
      apiKey = process.env.GEMINI_API_KEY?.trim() || '';
      if (!apiKey) return noStoreJson({ error: NO_API_KEY_MESSAGE, code: 'AI_API_KEY_MISSING' }, 503);

      const usage = await getSupabaseServer().rpc('consume_ai_chat_quota', {
        target_tenant_id: context.tenantId,
        target_limit: config.dailyLimit,
      });
      if (usage.error) throw new Error(usage.error.message);
      const consumed = rpcQuota(usage.data, config.dailyLimit);
      quota = consumed.quota;
      if (!consumed.allowed) {
        return noStoreJson({
          error: `Llegaste a ${quota.limit} consultas gratuitas de hoy. Se reinicia mañana 00:00 (America/Managua). Agrega tu propia API Key en Configuración para ilimitado.`,
          code: 'AI_DAILY_LIMIT',
          quota,
          usingOwnKey: false,
        }, 429);
      }
      quotaReserved = true;
    }

    const [businessContext, history] = await Promise.all([
      getTenantContextForAI(context.tenantId, message),
      getRecentAiHistory(context.tenantId, 10),
    ]);
    await saveAiHistoryMessage({
      tenantId: context.tenantId,
      userId: context.uid,
      role: 'user',
      content: message,
      metadata: { source: 'workspace_assistant' },
    });

    const response = await callGemini({
      apiKey,
      systemInstruction: buildSystemPrompt(businessContext, config),
      history,
      message,
      model,
    });
    geminiCompleted = true;

    // Gemini already billed/accepted this request, so history storage failing
    // should not hide a useful answer or incorrectly release its quota.
    let assistant: AiHistoryMessage = { role: 'assistant', content: response, createdAt: new Date().toISOString() };
    try {
      assistant = await saveAiHistoryMessage({
        tenantId: context.tenantId,
        userId: context.uid,
        role: 'assistant',
        content: response,
        metadata: {
          provider: 'gemini',
          model,
          keyMode: usingOwnKey ? 'byok' : 'system',
        },
      });
    } catch {
      // The next successful message will still include live business context.
    }

    return noStoreJson({
      ok: true,
      response,
      assistant,
      quota: quota || unlimitedAiQuota(),
      usingOwnKey,
    });
  } catch (error) {
    if (quotaReserved && !geminiCompleted && reservedTenantId) {
      await releaseReservedQuota(reservedTenantId);
      if (quota && !quota.unlimited && quota.limit !== null && quota.remaining !== null) {
        quota = {
          ...quota,
          used: Math.max(0, quota.used - 1),
          remaining: Math.min(quota.limit, quota.remaining + 1),
        };
      }
    }
    if (error instanceof GeminiCallError) return geminiFailure(error, usingOwnKey, quota || unlimitedAiQuota());
    return aiErrorResponse(error);
  }
}
