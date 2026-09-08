import { reportError } from '@/lib/error-reporting';
import { getCorrelationId } from '@/lib/observability';

export async function onRequestError(error: unknown, request: Readonly<{ path: string; method: string; headers: NodeJS.Dict<string | string[]> }>) {
  const rawCorrelation = request.headers['x-correlation-id'];
  const correlationId = Array.isArray(rawCorrelation) ? rawCorrelation[0] : rawCorrelation;
  const rawTenant = request.headers['x-tenant-id'];
  const tenantId = Array.isArray(rawTenant) ? rawTenant[0] : rawTenant;
  reportError(error, { correlationId: correlationId || getCorrelationId(), tenantId, routePath: request.path, method: request.method });
}
