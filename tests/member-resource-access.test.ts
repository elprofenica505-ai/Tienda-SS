import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { NextRequest } from 'next/server';
import {
  assertCashRegisterAccess,
  assertWarehouseAccess,
  canAccessCashRegister,
  canAccessWarehouse,
  filterAuthorizedIds,
  type ScopeContext,
} from '@/lib/data-scope';
import { tenantErrorResponse } from '@/lib/tenant';
import { seedMember, startFakeSupabase, type FakeSupabase } from './helpers/fake-supabase';

/** FASE 2A: asignación por almacén y por caja. Esta fase es inerte: los tests fijan la semántica y la carga en el contexto. */

type MembersRoute = typeof import('@/app/api/members/route');
type Repository = typeof import('@/lib/repositories/organization-repository');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_SLUG = 'access-shop';
const OWNER_TOKEN = 'access-owner-token';
const RESTRICTED_TOKEN = 'access-restricted-token';
const WAREHOUSE_ID = '44444444-4444-4444-8444-444444444441';
const OTHER_WAREHOUSE_ID = '44444444-4444-4444-8444-444444444442';
const RESTRICTED_MEMBER_ID = `member-restricted-user-${TENANT_ID}`;

const PGRST205 = {
  status: 404,
  body: { code: 'PGRST205', message: "Could not find the table 'public.member_warehouses' in the schema cache", details: null, hint: null },
};

let fake: FakeSupabase;
let members: MembersRoute;
let repository: Repository;

function resetData() {
  fake.tableErrors = {};
  fake.failTables.clear();
  fake.requests.length = 0;
  fake.tables.member_warehouses = [];
  fake.tables.member_cash_registers = [];
}

function listRequest(token = OWNER_TOKEN) {
  return new NextRequest('http://localhost/api/members', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': TENANT_SLUG },
  });
}

before(async () => {
  fake = await startFakeSupabase();
  seedMember(fake, { slug: TENANT_SLUG, tenantUuid: TENANT_ID, role: 'owner', token: OWNER_TOKEN, userId: 'owner-user' });
  seedMember(fake, { slug: TENANT_SLUG, tenantUuid: TENANT_ID, role: 'vendedor', token: RESTRICTED_TOKEN, userId: 'restricted-user' });
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  process.env.RATE_LIMIT_SHARED = 'false';
  members = await import('@/app/api/members/route');
  repository = await import('@/lib/repositories/organization-repository');
});

after(async () => {
  await fake.close();
});

beforeEach(resetData);

// --- (a)(b)(c)(d): semántica de alcance ---------------------------------------------------------

const seller: ScopeContext = { role: 'vendedor', branchIds: ['branch-a'] };

test('(a) sin asignación explícita el miembro accede a todos los almacenes y cajas de sus sucursales', () => {
  assert.equal(canAccessWarehouse(seller, WAREHOUSE_ID), true);
  assert.equal(canAccessWarehouse({ ...seller, warehouseIds: [] }, WAREHOUSE_ID), true);
  assert.equal(canAccessCashRegister({ ...seller, cashRegisterIds: undefined }, 'caja-1'), true);
  assert.doesNotThrow(() => assertWarehouseAccess(seller, WAREHOUSE_ID));
  assert.doesNotThrow(() => assertCashRegisterAccess(seller, 'caja-1'));
});

test('(b) con asignación explícita se rechazan los almacenes y cajas que no están asignados', () => {
  const scoped: ScopeContext = { role: 'cajero', branchIds: ['branch-a'], warehouseIds: [WAREHOUSE_ID], cashRegisterIds: ['caja-1'] };
  assert.equal(canAccessWarehouse(scoped, WAREHOUSE_ID), true);
  assert.equal(canAccessWarehouse(scoped, OTHER_WAREHOUSE_ID), false);
  assert.equal(canAccessWarehouse(scoped, undefined), false);
  assert.throws(() => assertWarehouseAccess(scoped, OTHER_WAREHOUSE_ID), { message: 'WAREHOUSE_OUT_OF_SCOPE' });
  assert.equal(canAccessCashRegister(scoped, 'caja-2'), false);
  assert.throws(() => assertCashRegisterAccess(scoped, 'caja-2'), { message: 'CASH_REGISTER_OUT_OF_SCOPE' });
});

test('(c) los roles administrativos siempre pasan, aunque tengan asignaciones explícitas', () => {
  for (const role of ['owner', 'admin', 'gerente', 'jefe'] as const) {
    const manager: ScopeContext = { role, branchIds: [], warehouseIds: [WAREHOUSE_ID], cashRegisterIds: ['caja-1'] };
    assert.equal(canAccessWarehouse(manager, OTHER_WAREHOUSE_ID), true, `${role} almacén`);
    assert.equal(canAccessCashRegister(manager, 'caja-9'), true, `${role} caja`);
  }
});

test('(d) filterAuthorizedIds conserva todo sin asignación y filtra con asignación explícita', () => {
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(filterAuthorizedIds(seller, ids), ['a', 'b', 'c']);
  assert.deepEqual(filterAuthorizedIds(seller, ids, []), ['a', 'b', 'c']);
  assert.deepEqual(filterAuthorizedIds(seller, ids, ['b', 'z']), ['b']);
  assert.deepEqual(filterAuthorizedIds({ role: 'gerente', branchIds: [] }, ids, ['b']), ['a', 'b', 'c']);
  assert.deepEqual(filterAuthorizedIds(seller, ids, ['z']), []);
});

test('los códigos nuevos se traducen a 403 con mensaje en español', () => {
  assert.deepEqual(tenantErrorResponse(new Error('WAREHOUSE_OUT_OF_SCOPE')), {
    status: 403,
    body: { error: 'No tienes permisos para ese almacén.', code: 'WAREHOUSE_OUT_OF_SCOPE' },
  });
  assert.deepEqual(tenantErrorResponse(new Error('CASH_REGISTER_OUT_OF_SCOPE')), {
    status: 403,
    body: { error: 'No tienes permisos para esa caja.', code: 'CASH_REGISTER_OUT_OF_SCOPE' },
  });
});

// --- Carga de asignaciones en el contexto ----------------------------------------------------------

test('findMembership carga warehouseIds y cashRegisterIds y toTenantContext los propaga', async () => {
  fake.tables.member_warehouses.push({ tenant_id: TENANT_ID, member_id: RESTRICTED_MEMBER_ID, warehouse_id: WAREHOUSE_ID });
  const membership = await repository.findMembership(TENANT_SLUG, 'restricted-user');
  assert.ok(membership);
  assert.deepEqual(membership.warehouseIds, [WAREHOUSE_ID]);
  assert.deepEqual(membership.cashRegisterIds, []);
  const context = repository.toTenantContext(TENANT_SLUG, 'restricted-user', membership);
  assert.deepEqual(context.warehouseIds, [WAREHOUSE_ID]);
  assert.deepEqual(context.cashRegisterIds, []);
});

test('sin filas de asignación el contexto queda con listas vacías (acceso total)', async () => {
  const membership = await repository.findMembership(TENANT_SLUG, 'restricted-user');
  assert.ok(membership);
  assert.deepEqual(membership.warehouseIds, []);
  assert.deepEqual(membership.cashRegisterIds, []);
});

// --- (e): tolerancia a tablas que aún no existen -------------------------------------------------------

test('(e) GET /api/members responde 200 aunque las tablas nuevas respondan PGRST205', async () => {
  fake.tableErrors.member_warehouses = PGRST205;
  fake.tableErrors.member_cash_registers = { ...PGRST205, body: { ...PGRST205.body, message: "Could not find the table 'public.member_cash_registers' in the schema cache" } };
  const response = await members.GET(listRequest());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.members));
});

test('un error que no es de tabla ausente sigue fallando (no se ignora la asignación)', async () => {
  fake.failTables.add('member_cash_registers');
  const response = await members.GET(listRequest());
  assert.notEqual(response.status, 200);
  assert.equal(response.status, 500);
});
