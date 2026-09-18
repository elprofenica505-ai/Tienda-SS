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
  const payload = {
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
  };
  const result = await supabase.rpc('append_audit_log', {
    target_tenant_id: input.tenantId,
    target_actor_id: uuidOrNull(input.actor?.uid),
    target_action: input.action,
    target_resource_type: input.entity,
    target_resource_id: uuidOrNull(input.entityId),
    target_metadata: input.metadata || {},
    target_request_id: input.request?.requestId || null,
    target_payload: payload,
  });
  if (result.error) throw new Error(result.error.message);
  return String(result.data);
}

export function auditIntegrityHash(payload: unknown): string {
  return digest(payload);
}
