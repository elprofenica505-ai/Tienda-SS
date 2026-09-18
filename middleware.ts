import { NextRequest, NextResponse } from 'next/server';
import { getCorrelationId, logEvent } from '@/lib/observability';
import { getApiPolicy, isPublicApiRoute } from '@/lib/api-policy';

function withSecurityHeaders(response: NextResponse, correlationId?: string) {
  if (correlationId) response.headers.set('x-correlation-id', correlationId);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function unauthorized(message: string, status = 401, correlationId?: string) {
  return withSecurityHeaders(NextResponse.json({ error: message, correlationId }, { status }), correlationId);
}

function firstHeader(request: NextRequest, names: string[]) {
  for (const name of names) {
    const value = request.headers.get(name)?.trim();
    if (value) return value;
  }
  return '';
}

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some(({ name }) => /^sb-.+-auth-token(?:\.[0-9]+)?$/.test(name));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const canonicalHost = 'tienda-ss-ozkq.vercel.app';
  if (process.env.VERCEL_ENV === 'production' && request.nextUrl.hostname.endsWith('.vercel.app') && request.nextUrl.hostname !== canonicalHost) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.hostname = canonicalHost;
    return NextResponse.redirect(canonicalUrl, 308);
  }
  if (!pathname.startsWith('/api/')) return NextResponse.next();

  const method = request.method.toUpperCase();
  const correlationId = getCorrelationId(request);
  logEvent('info', 'api.request.received', { correlationId, method, path: pathname });
  if (isPublicApiRoute(pathname, method)) return withSecurityHeaders(NextResponse.next(), correlationId);

  // Las integraciones versionadas validan la API key aislada por tenant dentro del handler.
  if (pathname.startsWith('/api/v1/') && pathname !== '/api/v1/keys') return withSecurityHeaders(NextResponse.next(), correlationId);

  const authorization = request.headers.get('authorization')?.trim() || '';
  if (!/^Bearer\s+\S+$/i.test(authorization) && !hasSupabaseAuthCookie(request)) {
    return unauthorized('Autenticación requerida.', 401, correlationId);
  }

  if (pathname.startsWith('/api/superadmin/')) {
    return withSecurityHeaders(NextResponse.next(), correlationId);
  }

  // This endpoint discovers the user's active tenant, so it cannot require
  // the tenant header before the route has had a chance to resolve it.
  if (pathname === '/api/tenants/me' && method === 'GET') {
    return withSecurityHeaders(NextResponse.next(), correlationId);
  }

  const tenantId = firstHeader(request, ['x-tenant-id', 'tenant-id', 'tenant_id']);
  if (!tenantId) {
    return unauthorized('Falta identificar la empresa.', 400, correlationId);
  }

  const policy = getApiPolicy(pathname, method);
  if (!policy && pathname !== '/api/tenants') {
    return unauthorized('Ruta API no autorizada.', 403, correlationId);
  }

  const headers = new Headers(request.headers);
  headers.set('x-correlation-id', correlationId);
  headers.set('x-tenant-id', tenantId);
  const branchId = firstHeader(request, ['x-branch-id', 'branch-id', 'branch_id']);
  if (branchId) headers.set('x-branch-id', branchId);
  if (policy) {
    headers.set('x-api-permission-module', policy.module);
    headers.set('x-api-permission-action', policy.action);
  }

  return withSecurityHeaders(NextResponse.next({ request: { headers } }));
}

export const config = {
  matcher: ['/api/:path*'],
};
