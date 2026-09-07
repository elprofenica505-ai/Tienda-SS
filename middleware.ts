import { NextRequest, NextResponse } from 'next/server';
import { getCorrelationId } from '@/lib/observability';
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/api/')) return NextResponse.next();

  const method = request.method.toUpperCase();
  const correlationId = getCorrelationId(request);
  if (isPublicApiRoute(pathname, method)) return withSecurityHeaders(NextResponse.next(), correlationId);

  const authorization = request.headers.get('authorization')?.trim() || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
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

  if (!request.headers.get('x-tenant-id')?.trim()) {
    return unauthorized('Falta identificar la empresa.', 400, correlationId);
  }

  const policy = getApiPolicy(pathname, method);
  if (!policy && pathname !== '/api/tenants') {
    return unauthorized('Ruta API no autorizada.', 403, correlationId);
  }

  const headers = new Headers(request.headers);
  headers.set('x-correlation-id', correlationId);
  if (policy) {
    headers.set('x-api-permission-module', policy.module);
    headers.set('x-api-permission-action', policy.action);
  }

  return withSecurityHeaders(NextResponse.next({ request: { headers } }));
}

export const config = {
  matcher: ['/api/:path*'],
};
