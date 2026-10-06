import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { getApiPolicy, isPublicApiRoute } from '@/lib/api-policy';

const protectedTenantRoutes = [
  '/api/billing',
  '/api/cash-sessions',
  '/api/catalog',
  '/api/contacts',
  '/api/finance',
  '/api/fiscal/config',
  '/api/inventory',
  '/api/inventory/warehouses',
  '/api/inventory/reservations',
  '/api/members',
  '/api/notifications',
  '/api/permissions',
  '/api/receivables',
  '/api/receivables/credit-notes',
  '/api/receivables/reminders',
  '/api/receivables/reminders/settings',
  '/api/reports',
  '/api/reports/export',
  '/api/stats/daily',
  '/api/sales',
  '/api/sales/returns',
  '/api/sales/void',
  '/api/tenants',
  '/api/usuarios',
];

// Subrutas reales que antes devolvían 403 "Ruta API no autorizada." porque
// `getApiPolicy()` resolvía `null` al existir sólo el patrón de la raíz exacta.
const protectedSubRoutes = [
  '/api/cash-sessions/movements',
  '/api/reports/workbook',
  '/api/reports/consolidated',
  '/api/daily-summaries',
  '/api/daily-summaries/settings',
  '/api/payables',
  '/api/purchases',
  '/api/deliveries',
  '/api/presales',
  '/api/presales/checkout',
  '/api/organization',
  '/api/invitations',
];

const superadminRoutes = [
  '/api/superadmin/audit',
  '/api/superadmin/metrics',
  '/api/superadmin/tenants',
];

const discoveredTenantRoutes = ['/api/tenants/me'];
const publicRoutes = ['/api/health', '/api/auth/login-attempt', '/api/tenants', '/api/billing/webhook', '/api/cron/daily-alerts', '/api/cron/receivables-reminders', '/api/webhooks/whatsapp'];

function request(path: string, method = 'GET', headers?: Record<string, string>) {
  return new NextRequest(`http://localhost${path}`, { method, headers });
}

async function errorBody(response: Response) {
  return (await response.json()) as { error?: string };
}

test('matriz global rechaza sin Authorization todas las rutas protegidas de tenant', async (t) => {
  for (const path of protectedTenantRoutes) {
    await t.test(path, async () => {
      const response = middleware(request(path));
      assert.equal(response.status, 401);
      assert.equal((await errorBody(response)).error, 'Autenticación requerida.');
    });
  }
});

test('matriz global rechaza sin tenant todas las rutas protegidas de tenant', async (t) => {
  for (const path of protectedTenantRoutes) {
    await t.test(path, async () => {
      const response = middleware(request(path, 'GET', { Authorization: 'Bearer test-token' }));
      assert.equal(response.status, 400);
      assert.equal((await errorBody(response)).error, 'Falta identificar la empresa.');
    });
  }
});

test('matriz global exige autenticación para rutas de superadmin y no exige tenant previo', async (t) => {
  for (const path of superadminRoutes) {
    await t.test(`${path} sin token`, async () => {
      const response = middleware(request(path));
      assert.equal(response.status, 401);
    });
    await t.test(`${path} con token`, () => {
      const response = middleware(request(path, 'GET', { Authorization: 'Bearer superadmin-token' }));
      assert.equal(response.status, 200);
    });
  }
});

test('matriz permite el descubrimiento de tenant sin x-tenant-id', () => {
  for (const path of discoveredTenantRoutes) {
    const response = middleware(request(path, 'GET', { Authorization: 'Bearer test-token' }));
    assert.equal(response.status, 200);
  }
});

test('matriz reconoce únicamente las excepciones públicas documentadas', () => {
  for (const path of publicRoutes) {
    const method = path === '/api/tenants' || path === '/api/auth/login-attempt' || path === '/api/billing/webhook' ? 'POST' : 'GET';
    assert.equal(isPublicApiRoute(path, method), true, `${method} ${path} debe ser pública`);
  }
  assert.equal(isPublicApiRoute('/api/catalog', 'GET'), false);
  assert.equal(isPublicApiRoute('/api/billing/webhook', 'GET'), false);
  assert.equal(isPublicApiRoute('/api/webhooks/whatsapp', 'POST'), true);
  assert.equal(middleware(request('/api/webhooks/whatsapp', 'POST')).status, 200);
});

test('matriz rechaza una ruta no registrada aunque tenga token y tenant', async () => {
  const response = middleware(request('/api/not-registered', 'GET', {
    Authorization: 'Bearer test-token',
    'x-tenant-id': 'tenant-a',
  }));
  assert.equal(response.status, 403);
  assert.equal((await errorBody(response)).error, 'Ruta API no autorizada.');
});

test('la exportación de reportes requiere permiso de exportar, no sólo ver reportes', () => {
  assert.deepEqual(getApiPolicy('/api/reports', 'GET'), { module: 'reports', action: 'view' });
  assert.deepEqual(getApiPolicy('/api/reports/export', 'GET'), { module: 'reports', action: 'export' });
});

test('política API resuelve acciones por método para cada endpoint registrado', () => {
  for (const path of protectedTenantRoutes.filter((item) => item !== '/api/tenants')) {
    assert.ok(getApiPolicy(path, 'GET'), `GET ${path} debe tener política`);
    assert.equal(getApiPolicy(path, 'POST')?.action, 'create', `POST ${path} debe mapear create`);
    assert.equal(getApiPolicy(path, 'PATCH')?.action, 'edit', `PATCH ${path} debe mapear edit`);
    assert.equal(getApiPolicy(path, 'DELETE')?.action, 'delete', `DELETE ${path} debe mapear delete`);
  }
});

test('las subrutas de cada módulo resuelven política y no devuelven 403', async (t) => {
  for (const path of protectedSubRoutes) {
    await t.test(path, async () => {
      assert.ok(getApiPolicy(path, 'GET'), `GET ${path} debe tener política`);
      const response = middleware(request(path, 'GET', {
        Authorization: 'Bearer test-token',
        'x-tenant-id': 'tenant-a',
      }));
      assert.notEqual(response.status, 403, `${path} no debe responder 403`);
      assert.equal(response.status, 200);
    });
  }
});

test('caja: sesiones y movimientos comparten el módulo finance', () => {
  assert.deepEqual(getApiPolicy('/api/cash-sessions', 'GET'), { module: 'finance', action: 'view' });
  assert.deepEqual(getApiPolicy('/api/cash-sessions/movements', 'GET'), { module: 'finance', action: 'view' });
  assert.deepEqual(getApiPolicy('/api/cash-sessions', 'POST'), { module: 'finance', action: 'create' });
});

test('el Excel maestro exige permiso de exportar igual que la exportación de reportes', () => {
  assert.deepEqual(getApiPolicy('/api/reports/workbook', 'GET'), { module: 'reports', action: 'export' });
  assert.deepEqual(getApiPolicy('/api/reports/export', 'GET'), { module: 'reports', action: 'export' });
  // Las subrutas de reportes sin acción propia siguen siendo sólo de lectura.
  assert.deepEqual(getApiPolicy('/api/reports/consolidated', 'GET'), { module: 'reports', action: 'view' });
});

test('las rutas realmente inexistentes siguen devolviendo 403', async () => {
  for (const path of ['/api/not-registered', '/api/cash-sessions-fake', '/api/reportes']) {
    assert.equal(getApiPolicy(path, 'GET'), null, `${path} no debe tener política`);
    const response = middleware(request(path, 'GET', {
      Authorization: 'Bearer test-token',
      'x-tenant-id': 'tenant-a',
    }));
    assert.equal(response.status, 403);
    assert.equal((await errorBody(response)).error, 'Ruta API no autorizada.');
  }
});
