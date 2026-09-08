import type { PermissionAction, PermissionModule } from '@/lib/permissions';

export type ApiPolicy = {
  module: PermissionModule;
  action: PermissionAction;
};

const publicRoutes = new Set([
  'GET /api/health',
  'POST /api/auth/login-attempt',
  'POST /api/tenants',
  'POST /api/billing/webhook',
  'GET /api/invitations/accept',
  'POST /api/invitations/accept',
]);

const routePolicies: Array<{ pattern: RegExp; policy: ApiPolicy }> = [
  { pattern: /^\/api\/catalog$/, policy: { module: 'catalog', action: 'view' } },
  { pattern: /^\/api\/catalog\/(import|export)$/, policy: { module: 'catalog', action: 'export' } },
  { pattern: /^\/api\/inventory(?:\/reservations)?$/, policy: { module: 'inventory', action: 'view' } },
  { pattern: /^\/api\/purchases$/, policy: { module: 'inventory', action: 'view' } },
  { pattern: /^\/api\/deliveries$/, policy: { module: 'sales', action: 'view' } },
  { pattern: /^\/api\/contacts$/, policy: { module: 'contacts', action: 'view' } },
  { pattern: /^\/api\/finance$/, policy: { module: 'finance', action: 'view' } },
  { pattern: /^\/api\/(members|usuarios)$/, policy: { module: 'members', action: 'view' } },
  { pattern: /^\/api\/notifications$/, policy: { module: 'dashboard', action: 'view' } },
  { pattern: /^\/api\/permissions$/, policy: { module: 'members', action: 'view' } },
  { pattern: /^\/api\/receivables(?:\/credit-notes)?$/, policy: { module: 'receivables', action: 'view' } },
  { pattern: /^\/api\/reports(?:\/export)?$/, policy: { module: 'reports', action: 'view' } },
  { pattern: /^\/api\/stats\/daily$/, policy: { module: 'reports', action: 'view' } },
  { pattern: /^\/api\/sales(?:\/(returns|void))?$/, policy: { module: 'sales', action: 'view' } },
  { pattern: /^\/api\/presales(?:\/checkout)?$/, policy: { module: 'sales', action: 'view' } },
  { pattern: /^\/api\/billing$/, policy: { module: 'finance', action: 'view' } },
  { pattern: /^\/api\/invitations$/, policy: { module: 'members', action: 'view' } },
  { pattern: /^\/api\/v1\/keys$/, policy: { module: 'members', action: 'create' } },
];

export function isPublicApiRoute(pathname: string, method: string): boolean {
  return publicRoutes.has(`${method.toUpperCase()} ${pathname}`);
}

export function getApiPolicy(pathname: string, method: string): ApiPolicy | null {
  if (pathname === '/api/tenants/me') return { module: 'dashboard', action: 'view' };
  const match = routePolicies.find(({ pattern }) => pattern.test(pathname));
  if (!match) return null;
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === 'GET') return match.policy;
  if (normalizedMethod === 'POST') return { ...match.policy, action: 'create' };
  if (normalizedMethod === 'PATCH' || normalizedMethod === 'PUT') return { ...match.policy, action: 'edit' };
  if (normalizedMethod === 'DELETE') return { ...match.policy, action: 'delete' };
  return null;
}
