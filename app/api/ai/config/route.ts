import { NextRequest } from 'next/server';
import { decryptApiKey, encryptApiKey, hasAiEncryptionKey, maskApiKey } from '@/lib/ai/encryption';
import { aiErrorResponse, aiJsonBody, noStoreJson, requireAiManager } from '@/lib/ai/route-utils';
import { freeAiQuota, getAiDailyUsage, getTenantAiConfig, saveTenantAiConfig, unlimitedAiQuota } from '@/lib/ai/store';
import { normalizeAiPersonality, type TenantAiConfig } from '@/lib/ai/types';

export const runtime = 'nodejs';

function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function field(source: Record<string, unknown>, snake: string, camel: string): { present: boolean; value: unknown } {
  if (hasOwn(source, snake)) return { present: true, value: source[snake] };
  if (hasOwn(source, camel)) return { present: true, value: source[camel] };
  return { present: false, value: undefined };
}

function publicConfig(config: TenantAiConfig) {
  let maskedKey: string | null = null;
  let keyReadable = false;
  if (config.apiKeyEncrypted) {
    try {
      maskedKey = maskApiKey(decryptApiKey(config.apiKeyEncrypted));
      keyReadable = true;
    } catch {
      // The saved cipher is still never exposed. A changed/missing encryption
      // key can be repaired by the owner by pasting a new BYOK key.
      maskedKey = '••••';
    }
  }
  const usingOwnKey = Boolean(config.enabled && config.apiKeyEncrypted && keyReadable);
  return {
    provider: 'gemini' as const,
    personality: config.personality,
    dailyLimit: config.dailyLimit,
    enabled: config.enabled,
    customInstructions: config.customInstructions,
    hasApiKey: Boolean(config.apiKeyEncrypted),
    maskedKey,
    keyReadable,
    usingOwnKey,
    encryptionConfigured: hasAiEncryptionKey(),
    hasSystemApiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
  };
}

async function responseForConfig(config: TenantAiConfig) {
  const safeConfig = publicConfig(config);
  const quota = safeConfig.usingOwnKey
    ? unlimitedAiQuota()
    : freeAiQuota(await getAiDailyUsage(config.tenantId), config.dailyLimit);
  return noStoreJson({ ok: true, config: safeConfig, quota });
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireAiManager(request);
    const config = await getTenantAiConfig(context.tenantId);
    return await responseForConfig(config);
  } catch (error) {
    return aiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireAiManager(request);
    const body = await aiJsonBody(request);
    const current = await getTenantAiConfig(context.tenantId);

    const personalityField = field(body, 'personality', 'personality');
    const dailyLimitField = field(body, 'daily_limit', 'dailyLimit');
    const instructionsField = field(body, 'custom_instructions', 'customInstructions');
    const enabledField = field(body, 'enabled', 'enabled');
    const apiKeyField = field(body, 'api_key', 'apiKey');

    let personality = current.personality;
    if (personalityField.present) {
      const normalized = normalizeAiPersonality(personalityField.value);
      if (!normalized) throw new Error('AI_CONFIG_INVALID');
      personality = normalized;
    }

    let dailyLimit = current.dailyLimit;
    if (dailyLimitField.present) {
      const parsed = typeof dailyLimitField.value === 'number' ? dailyLimitField.value : Number(dailyLimitField.value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw new Error('AI_DAILY_LIMIT_INVALID');
      dailyLimit = parsed;
    }

    let customInstructions = current.customInstructions;
    if (instructionsField.present) {
      if (typeof instructionsField.value !== 'string') throw new Error('AI_CONFIG_INVALID');
      customInstructions = instructionsField.value.trim();
      if (customInstructions.length > 2000) throw new Error('AI_CUSTOM_INSTRUCTIONS_INVALID');
    }

    let enabled = current.enabled;
    if (enabledField.present) {
      if (typeof enabledField.value !== 'boolean') throw new Error('AI_CONFIG_INVALID');
      enabled = enabledField.value;
    }

    let apiKeyEncrypted = current.apiKeyEncrypted;
    if (apiKeyField.present) {
      if (typeof apiKeyField.value !== 'string') throw new Error('AI_API_KEY_INVALID_INPUT');
      const candidate = apiKeyField.value.trim();
      // The browser sends its masked preview unchanged when the owner did not
      // touch the field. Bullet characters therefore mean “keep current key”.
      if (candidate.includes('•')) {
        // Preserve the existing cipher.
      } else if (!candidate) {
        apiKeyEncrypted = null;
      } else {
        if (candidate.length < 8 || candidate.length > 512 || /\s/.test(candidate)) throw new Error('AI_API_KEY_INVALID_INPUT');
        apiKeyEncrypted = encryptApiKey(candidate);
      }
    }

    const saved = await saveTenantAiConfig({
      tenantId: context.tenantId,
      provider: 'gemini',
      apiKeyEncrypted,
      personality,
      dailyLimit,
      enabled,
      customInstructions,
    });
    return await responseForConfig(saved);
  } catch (error) {
    return aiErrorResponse(error);
  }
}
