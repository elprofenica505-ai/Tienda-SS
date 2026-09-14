import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DEFAULT_TENANT_CURRENCY, DEFAULT_TENANT_LOCALE, DEFAULT_TENANT_SYMBOL, formatMoney } from '@/lib/currency';

const indexes = JSON.parse(readFileSync('firestore.indexes.json', 'utf8')) as { indexes: Array<{ collectionGroup: string; queryScope: string; fields: Array<{ fieldPath: string; order: string }> }> };
const tenantRoute = readFileSync('app/api/tenants/route.ts', 'utf8');
const meRoute = readFileSync('app/api/tenants/me/route.ts', 'utf8');
const onboarding = readFileSync('app/onboarding/page.tsx', 'utf8');
const organization = readFileSync('lib/repositories/organization-repository.ts', 'utf8');

const signature = (collectionGroup: string, fields: string) => indexes.indexes.some((index) => index.collectionGroup === collectionGroup && index.queryScope === 'COLLECTION_GROUP' && index.fields.map((field) => `${field.fieldPath}:${field.order}`).join(',') === fields);

test('los índices de producción reflejan las queries multi-tenant requeridas', () => {
  assert.equal(indexes.indexes.length, 21);
  assert.equal(signature('products', 'active:ASCENDING,name:ASCENDING,__name__:ASCENDING'), true);
  assert.equal(signature('presales', 'createdAt:DESCENDING,__name__:DESCENDING'), true);
  assert.equal(signature('presales', 'vendedorUid:ASCENDING,createdAt:DESCENDING,__name__:DESCENDING'), true);
  assert.equal(signature('sales', 'paymentMethod:ASCENDING,createdAt:DESCENDING,__name__:DESCENDING'), true);
  assert.equal(signature('sales', 'branchId:ASCENDING,createdAt:DESCENDING,__name__:DESCENDING'), true);
  assert.equal(signature('cashSessions', 'branchId:ASCENDING,status:ASCENDING,openedAt:DESCENDING,__name__:DESCENDING'), true);
  assert.equal(signature('sales', 'cashSessionId:ASCENDING,__name__:ASCENDING'), true);
  assert.equal(signature('cashMovements', 'cashSessionId:ASCENDING,__name__:ASCENDING'), true);
  assert.equal(signature('inventoryStocks', 'warehouseId:ASCENDING,updatedAt:DESCENDING,__name__:DESCENDING'), true);
  assert.equal(signature('deliveries', 'driverUid:ASCENDING,createdAt:DESCENDING,__name__:DESCENDING'), true);
  assert.equal(signature('members', 'email:ASCENDING,status:ASCENDING,__name__:ASCENDING'), true);
  assert.equal(signature('tenantInvitations', 'email:ASCENDING,status:ASCENDING,__name__:ASCENDING'), true);
  assert.equal(signature('branches', 'active:ASCENDING,name:ASCENDING'), true);
  assert.equal(signature('warehouses', 'active:ASCENDING,name:ASCENDING'), true);
  assert.equal(signature('cashRegisters', 'active:ASCENDING,name:ASCENDING'), true);
  assert.equal(signature('members', 'name:ASCENDING'), true);
  const memberUidOverride = (JSON.parse(readFileSync('firestore.indexes.json', 'utf8')) as { fieldOverrides: Array<{ collectionGroup: string; fieldPath: string; indexes: Array<{ queryScope: string }> }> }).fieldOverrides.find((override) => override.collectionGroup === 'members' && override.fieldPath === 'uid');
  assert.deepEqual(memberUidOverride?.indexes.map((index) => index.queryScope).sort(), ['COLLECTION', 'COLLECTION_GROUP']);
});

test('un tenant nuevo usa moneda local de Nicaragua y onboarding explícito', () => {
  assert.match(tenantRoute, /create_initial_tenant/);
  assert.match(meRoute, /currency/);
  assert.match(meRoute, /onboardingCompleted/);
  assert.match(meRoute, /currency/);
  assert.match(onboarding, /tenant\?\.onboardingCompleted/);
  assert.equal(DEFAULT_TENANT_CURRENCY, 'NIO');
  assert.equal(DEFAULT_TENANT_SYMBOL, 'C$');
  assert.equal(DEFAULT_TENANT_LOCALE, 'es-NI');
  assert.match(formatMoney(12.5), /C\$/);
});

test('getOrganization consulta todos los recursos organizativos en Supabase', () => {
  assert.match(organization, /from\('branches'\)/);
  assert.match(organization, /from\('warehouses'\)/);
  assert.match(organization, /from\('cash_registers'\)/);
  assert.match(organization, /from\('members'\)/);
  assert.match(organization, /member_branches/);
});
