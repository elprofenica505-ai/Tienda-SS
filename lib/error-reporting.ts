import { logEvent, type CorrelationContext } from '@/lib/observability';

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || 'unknown');
  return message
    .replace(/(authorization|cookie|token|secret|password|api[_-]?key|private[_-]?key)\s*[:=]\s*[^\s,}]+/gi, '$1=[redacted]')
    .slice(0, 500);
}

export function reportError(error: unknown, context: CorrelationContext & { routePath?: string; method?: string } = { correlationId: 'unknown' }) {
  logEvent('error', 'request.failed', {
    correlationId: context.correlationId,
    tenantId: context.tenantId,
    uid: context.uid,
    routePath: context.routePath,
    method: context.method,
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorMessage: safeMessage(error),
  });
}
