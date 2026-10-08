export const AI_PERSONALITIES = ['conexia', 'financial', 'sales', 'inventory', 'custom'] as const;

export type AiPersonality = (typeof AI_PERSONALITIES)[number];

export type TenantAiConfig = {
  id?: string;
  tenantId: string;
  provider: 'gemini';
  apiKeyEncrypted: string | null;
  personality: AiPersonality;
  dailyLimit: number;
  enabled: boolean;
  customInstructions: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AiQuota = {
  used: number;
  limit: number | null;
  remaining: number | null;
  localDate?: string;
  resetAt?: string;
  timezone: 'America/Managua';
  unlimited: boolean;
};

export type AiHistoryRole = 'user' | 'assistant' | 'system';

export type AiHistoryMessage = {
  id?: string;
  role: AiHistoryRole;
  content: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

export const DEFAULT_AI_CONFIG: Omit<TenantAiConfig, 'tenantId'> = {
  provider: 'gemini',
  apiKeyEncrypted: null,
  personality: 'conexia',
  dailyLimit: 20,
  enabled: true,
  customInstructions: '',
};

const personalityAliases: Record<string, AiPersonality> = {
  conexia: 'conexia',
  equilibrado: 'conexia',
  financial: 'financial',
  finance: 'financial',
  financiero: 'financial',
  experto_financiero: 'financial',
  'experto-financiero': 'financial',
  sales: 'sales',
  ventas: 'sales',
  experto_ventas: 'sales',
  'experto-ventas': 'sales',
  inventory: 'inventory',
  inventario: 'inventory',
  experto_inventario: 'inventory',
  'experto-inventario': 'inventory',
  custom: 'custom',
  personalizado: 'custom',
  personalizada: 'custom',
};

/** Accepts the stable API values and the labels used in the Spanish interface. */
export function normalizeAiPersonality(value: unknown): AiPersonality | null {
  if (typeof value !== 'string') return null;
  return personalityAliases[value.trim().toLowerCase().replace(/\s+/g, '_')] || null;
}

export function isAiPersonality(value: unknown): value is AiPersonality {
  return typeof value === 'string' && (AI_PERSONALITIES as readonly string[]).includes(value);
}
