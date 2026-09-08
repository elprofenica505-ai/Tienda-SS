import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebaseAdmin';
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

export async function writeImmutableAudit(input: AuditInput): Promise<string> {
  const db = getAdminDb();
  const collection = db.collection('tenants').doc(input.tenantId).collection('auditLogs');
  const ref = collection.doc();
  await db.runTransaction(async (transaction) => {
    const previous = await transaction.get(collection.orderBy('sequence', 'desc').limit(1));
    const previousHash = previous.empty ? 'GENESIS' : String(previous.docs[0].data().hash || 'GENESIS');
    const sequence = previous.empty ? 1 : Number(previous.docs[0].data().sequence || 0) + 1;
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
    transaction.create(ref, { ...payload, hash: digest(payload) });
  });
  return ref.id;
}

export function auditIntegrityHash(payload: unknown): string {
  return digest(payload);
}
