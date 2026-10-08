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
  'GET /api/cron/daily-alerts',
  'GET /api/cron/daily-summary',
  'GET /api/cron/receivables-reminders',
  'GET /api/cron/crm-alerts',
  'GET /api/webhooks/whatsapp',
  'POST /api/webhooks/whatsapp',
]);

// IMPORTANTE: el orden importa. `routePolicies` se evalúa de arriba hacia abajo y gana
// la primera coincidencia, por lo que las rutas específicas (p. ej. `/api/reports/export`,
// que exige permiso `export`) deben declararse ANTES del patrón general de su familia
// (`/api/reports(?:/.*)?`, que sólo exige `view`).
//
// El sufijo `(?:\/.*)?` cubre todas las subrutas de un módulo. Antes de este cambio sólo
// se registraba la raíz exacta (`/^\/api\/cash-sessions$/`), de modo que subrutas reales
// como `/api/cash-sessions/movements` o `/api/reports/workbook` devolvían `null` en
// `getApiPolicy()` y el middleware respondía 403 "Ruta API no autorizada.".
const routePolicies: Array<{ pattern: RegExp; policy: ApiPolicy }> = [
  // --- Específicas con acción distinta a la de su familia (deben ir primero) ---
  { pattern: /^\/api\/catalog\/(import|export)$/, policy: { module: 'catalog', action: 'export' } },
  { pattern: /^\/api\/reports\/export(?:\/.*)?$/, policy: { module: 'reports', action: 'export' } },
  { pattern: /^\/api\/reports\/workbook(?:\/.*)?$/, policy: { module: 'reports', action: 'export' } },
  { pattern: /^\/api\/v1\/keys$/, policy: { module: 'members', action: 'create' } },

  // --- Familias de rutas con sus subrutas ---
  { pattern: /^\/api\/catalog(?:\/.*)?$/, policy: { module: 'catalog', action: 'view' } },
  { pattern: /^\/api\/inventory(?:\/.*)?$/, policy: { module: 'inventory', action: 'view' } },
  { pattern: /^\/api\/purchases(?:\/.*)?$/, policy: { module: 'inventory', action: 'view' } },
  { pattern: /^\/api\/deliveries(?:\/.*)?$/, policy: { module: 'sales', action: 'view' } },
  { pattern: /^\/api\/contacts(?:\/.*)?$/, policy: { module: 'contacts', action: 'view' } },
  { pattern: /^\/api\/quotes(?:\/.*)?$/, policy: { module: 'quotes', action: 'view' } },
  { pattern: /^\/api\/crm(?:\/.*)?$/, policy: { module: 'crm', action: 'view' } },
  { pattern: /^\/api\/finance(?:\/.*)?$/, policy: { module: 'finance', action: 'view' } },
  { pattern: /^\/api\/payables(?:\/.*)?$/, policy: { module: 'finance', action: 'view' } },
  { pattern: /^\/api\/(?:members|usuarios)(?:\/.*)?$/, policy: { module: 'members', action: 'view' } },
  { pattern: /^\/api\/notifications(?:\/.*)?$/, policy: { module: 'dashboard', action: 'view' } },
  // Conexia IA aplica además una validación estricta de owner/admin/gerente/jefe
  // dentro de sus handlers. Esta política evita que el middleware la descarte
  // antes de que pueda devolver el mensaje de acceso restringido apropiado.
  { pattern: /^\/api\/ai(?:\/.*)?$/, policy: { module: 'dashboard', action: 'view' } },
  { pattern: /^\/api\/daily-summaries(?:\/.*)?$/, policy: { module: 'dashboard', action: 'view' } },
  { pattern: /^\/api\/permissions(?:\/.*)?$/, policy: { module: 'members', action: 'view' } },
  { pattern: /^\/api\/receivables(?:\/.*)?$/, policy: { module: 'receivables', action: 'view' } },
  { pattern: /^\/api\/reports(?:\/.*)?$/, policy: { module: 'reports', action: 'view' } },
  { pattern: /^\/api\/stats(?:\/.*)?$/, policy: { module: 'reports', action: 'view' } },
  { pattern: /^\/api\/sales(?:\/.*)?$/, policy: { module: 'sales', action: 'view' } },
  { pattern: /^\/api\/presales(?:\/.*)?$/, policy: { module: 'sales', action: 'view' } },
  { pattern: /^\/api\/billing(?:\/.*)?$/, policy: { module: 'finance', action: 'view' } },
  { pattern: /^\/api\/fiscal(?:\/.*)?$/, policy: { module: 'finance', action: 'view' } },
  { pattern: /^\/api\/cash-sessions(?:\/.*)?$/, policy: { module: 'finance', action: 'view' } },
  { pattern: /^\/api\/invitations(?:\/.*)?$/, policy: { module: 'members', action: 'view' } },
  { pattern: /^\/api\/organization(?:\/.*)?$/, policy: { module: 'dashboard', action: 'view' } },
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
