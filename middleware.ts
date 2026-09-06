import { NextRequest, NextResponse } from 'next/server';
import { getApiPolicy, isPublicApiRoute } from '@/lib/api-policy';

function unauthorized(message: string, status = 401) {
  return NextResponse.json({ error: message }, { status });
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/api/')) return NextResponse.next();

  const method = request.method.toUpperCase();
  if (isPublicApiRoute(pathname, method)) return NextResponse.next();

  const authorization = request.headers.get('authorization')?.trim() || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return unauthorized('Autenticación requerida.');
  }

  if (pathname.startsWith('/api/superadmin/')) {
    return NextResponse.next();
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

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/api/:path*'],
};
