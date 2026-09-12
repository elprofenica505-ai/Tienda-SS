import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const protectedRoutes = [
  'app/api/billing/route.ts',
  'app/api/cash-sessions/route.ts',
  'app/api/catalog/route.ts',
  'app/api/contacts/route.ts',
  'app/api/finance/route.ts',
  'app/api/inventory/route.ts',
  'app/api/inventory/warehouses/route.ts',
  'app/api/inventory/reservations/route.ts',
  'app/api/members/route.ts',
  'app/api/notifications/route.ts',
  'app/api/organization/route.ts',
  'app/api/permissions/route.ts',
  'app/api/receivables/route.ts',
  'app/api/receivables/credit-notes/route.ts',
  'app/api/reports/route.ts',
  'app/api/reports/export/route.ts',
  'app/api/sales/route.ts',
  'app/api/sales/returns/route.ts',
  'app/api/sales/void/route.ts',
  'app/api/stats/daily/route.ts',
  'app/api/tenants/me/route.ts',
];

async function source(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

test('todas las rutas tenant críticas aplican autorización server-side', async (t) => {
  for (const path of protectedRoutes) {
    await t.test(path, async () => {
      const code = await source(path);
      assert.match(code, /requireTenant(?:Member|Permission)/, 'debe usar una guarda de tenant');
      assert.match(code, /tenantErrorResponse/, 'debe mapear errores de autenticación y autorización');
    });
  }
});

test('las rutas críticas no dependen de un tenant enviado por el cliente como única autorización', async () => {
  for (const path of protectedRoutes) {
    const code = await source(path);
    assert.doesNotMatch(code, /(?:if|unless)\s*\([^)]*x-tenant-id[^)]*\)\s*\{?\s*return/i, `${path} no debe autorizar solo por x-tenant-id`);
  }
});

test('las rutas públicas permanecen explícitamente separadas', async () => {
  const signup = await source('app/api/tenants/route.ts');
  const webhook = await source('app/api/billing/webhook/route.ts');
  assert.match(signup, /consumeDistributedRateLimits/);
  assert.match(webhook, /stripe-signature|STRIPE_WEBHOOK_SECRET/);
});
