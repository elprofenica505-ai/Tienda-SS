import { createHash } from 'node:crypto';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant';

export type AuditResult = 'success' | 'failure';

export type AuditInput = {
  tenantId: string;
  actor?: Partial<TenantContext>;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  request?: {
    requestId?: string;
    method?: string;
    path?: string;
    ip?: string;
  };
  result: AuditResult;
  metadata?: Record<string, unknown>;
};

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item instanceof Date ? item.toISOString() : item, 0);
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function uuidOrNull(value: string | undefined): string | null {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

export async function writeImmutableAudit(input: AuditInput): Promise<string> {
  const supabase = getSupabaseServer();
  const previous = await supabase.from('audit_logs').select('metadata, created_at').eq('tenant_id', input.tenantId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (previous.error) throw new Error(previous.error.message);
  const previousMetadata = previous.data?.metadata && typeof previous.data.metadata === 'object' ? previous.data.metadata as Record<string, unknown> : {};
  const previousHash = typeof previousMetadata.hash === 'string' ? previousMetadata.hash : 'GENESIS';
  const sequence = typeof previousMetadata.sequence === 'number' ? previousMetadata.sequence + 1 : 1;
  const payload = {
    sequence,
    actorUid: input.actor?.uid || null,
    actorRole: input.actor?.role || null,
    tenantId: input.tenantId,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId || null,
    before: input.before ?? null,
    after: input.after ?? null,
    request: input.request || {},
    requestId: input.request?.requestId || null,
    result: input.result,
    metadata: input.metadata || {},
    timestamp: new Date().toISOString(),
    previousHash,
  };
  const hash = digest(payload);
  const result = await supabase.from('audit_logs').insert({
    tenant_id: input.tenantId,
    actor_id: input.actor?.uid || null,
    action: input.action,
    resource_type: input.entity,
    resource_id: uuidOrNull(input.entityId),
    metadata: { ...input.metadata, audit: payload, hash, sequence },
  }).select('id').single();
  if (result.error) throw new Error(result.error.message);
  return String(result.data.id);
}

export function auditIntegrityHash(payload: unknown): string {
  return digest(payload);
}
