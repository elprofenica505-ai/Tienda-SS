export type LogLevel = 'info' | 'warn' | 'error';

export type CorrelationContext = {
  correlationId: string;
  requestId?: string;
  tenantId?: string;
  uid?: string;
};

export function getCorrelationId(request?: Request): string {
  const incoming = request?.headers.get('x-correlation-id')?.trim();
  if (incoming && incoming.length <= 128) return incoming;
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `corr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  const serialized = JSON.stringify(payload);
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.info(serialized);
}

export function measure<T>(event: string, operation: () => Promise<T>, context: CorrelationContext): Promise<T> {
  const startedAt = Date.now();
  return operation().finally(() => {
    logEvent('info', event, { ...context, durationMs: Date.now() - startedAt });
  });
}
