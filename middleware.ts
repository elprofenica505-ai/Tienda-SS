import { NextRequest, NextResponse } from 'next/server';
import { getApiPolicy, isPublicApiRoute } from '@/lib/api-policy';

function withSecurityHeaders(response: NextResponse) {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function unauthorized(message: string, status = 401) {
  return withSecurityHeaders(NextResponse.json({ error: message }, { status }));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/api/')) return NextResponse.next();

  const method = request.method.toUpperCase();
  if (isPublicApiRoute(pathname, method)) return withSecurityHeaders(NextResponse.next());

  const authorization = request.headers.get('authorization')?.trim() || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return unauthorized('Autenticación requerida.');
  }

  if (pathname.startsWith('/api/superadmin/')) {
    return withSecurityHeaders(NextResponse.next());
  }

  if (!request.headers.get('x-tenant-id')?.trim()) {
    return unauthorized('Falta identificar la empresa.', 400);
  }

  const policy = getApiPolicy(pathname, method);
  if (!policy && pathname !== '/api/tenants') {
    return unauthorized('Ruta API no autorizada.', 403);
  }

  const headers = new Headers(request.headers);
  if (policy) {
    headers.set('x-api-permission-module', policy.module);
    headers.set('x-api-permission-action', policy.action);
  }

  return withSecurityHeaders(NextResponse.next({ request: { headers } }));
}

export const config = {
  matcher: ['/api/:path*'],
};
