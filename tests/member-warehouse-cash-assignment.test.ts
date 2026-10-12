import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { NextRequest } from 'next/server';
import {
  assertCashRegisterAccess,
  assertWarehouseAccess,
  canAccessWarehouse,
  filterAuthorizedIds,
  type ScopeContext,
} from '@/lib/data-scope';
import { tenantErrorResponse } from '@/lib/tenant';
import { seedMember, startFakeSupabase, type FakeSupabase } from './helpers/fake-supabase';

/** FASE 2B-1: asignación de almacenes y cajas por miembro, alcance del admin y fail-closed sin tablas. */

type MembersRoute = typeof import('@/app/api/members/route');
type Repository = typeof import('@/lib/repositories/organization-repository');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_SLUG = 'assign-shop';
const OWNER_TOKEN = 'assign-owner-token';
const SUPERVISOR_TOKEN = 'assign-supervisor-token';
const TARGET_UID = 'target-user';
const TARGET_MEMBER_ID = `member-${TARGET_UID}-${TENANT_ID}`;
const SUPERVISOR_MEMBER_ID = `member-supervisor-user-${TENANT_ID}`;

const BRANCH_A = '22222222-2222-4222-8222-222222222201';
const BRANCH_B = '22222222-2222-4222-8222-222222222202';
const WAREHOUSE_A = '33333333-3333-4333-8333-333333333301';
const WAREHOUSE_A2 = '33333333-3333-4333-8333-333333333302';
const WAREHOUSE_B = '33333333-3333-4333-8333-333333333303';
const WAREHOUSE_INACTIVE = '33333333-3333-4333-8333-333333333304';
const CASH_A = '55555555-5555-4555-8555-555555555501';
const CASH_B = '55555555-5555-4555-8555-555555555502';

const PGRST205 = (table: string) => ({
  status: 404,
  body: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache`, details: null, hint: null },
});

let fake: FakeSupabase;
let members: MembersRoute;
let repository: Repository;

function resetData() {
  fake.tableErrors = {};
  fake.failTables.clear();
  fake.requests.length = 0;
  fake.tables.branches = [
    { id: BRANCH_A, tenant_id: TENANT_ID, legacy_firestore_id: 'sucursal-a', code: 'A', name: 'Sucursal A', active: true },
    { id: BRANCH_B, tenant_id: TENANT_ID, legacy_firestore_id: null, code: 'B', name: 'Sucursal B', active: true },
  ];
  fake.tables.warehouses = [
    { id: WAREHOUSE_A, tenant_id: TENANT_ID, legacy_firestore_id: 'alm-a', branch_id: BRANCH_A, code: 'AL-A', name: 'Almacén A', active: true },
    { id: WAREHOUSE_A2, tenant_id: TENANT_ID, legacy_firestore_id: null, branch_id: BRANCH_A, code: 'AL-A2', name: 'Almacén A2', active: true },
    { id: WAREHOUSE_B, tenant_id: TENANT_ID, legacy_firestore_id: null, branch_id: BRANCH_B, code: 'AL-B', name: 'Almacén B', active: true },
    { id: WAREHOUSE_INACTIVE, tenant_id: TENANT_ID, legacy_firestore_id: 'alm-vieja', branch_id: BRANCH_A, code: 'AL-X', name: 'Almacén viejo', active: false },
  ];
  fake.tables.cash_registers = [
    { id: CASH_A, tenant_id: TENANT_ID, legacy_firestore_id: 'caja-a', branch_id: BRANCH_A, code: 'C-A', name: 'Caja A', active: true },
    { id: CASH_B, tenant_id: TENANT_ID, legacy_firestore_id: null, branch_id: BRANCH_B, code: 'C-B', name: 'Caja B', active: true },
  ];
  // El servidor simulado no resuelve selects embebidos: las sucursales del miembro se siembran como lo haría PostgREST.
  const branchEmbed = { legacy_firestore_id: 'sucursal-a' };
  fake.tables.member_branches = [
    { tenant_id: TENANT_ID, member_id: TARGET_MEMBER_ID, branch_id: BRANCH_A, branches: branchEmbed },
    { tenant_id: TENANT_ID, member_id: SUPERVISOR_MEMBER_ID, branch_id: BRANCH_A, branches: branchEmbed },
  ];
  const targetRow = fake.tables.members.find((row) => row.id === TARGET_MEMBER_ID);
  if (targetRow) targetRow.member_branches = [{ branch_id: BRANCH_A, branches: branchEmbed }];
  fake.tables.member_warehouses = [];
  fake.tables.member_cash_registers = [];
}

function patch(body: Record<string, unknown>, token = OWNER_TOKEN) {
  return new NextRequest('http://localhost/api/members', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': TENANT_SLUG, 'content-type': 'application/json' },
    body: JSON.stringify({ uid: TARGET_UID, ...body }),
  });
}

function listRequest() {
  return new NextRequest('http://localhost/api/members', {
    method: 'GET',
    headers: { Authorization: `Bearer ${OWNER_TOKEN}`, 'x-tenant-id': TENANT_SLUG },
  });
}

function assigned(table: 'member_warehouses' | 'member_cash_registers', column: 'warehouse_id' | 'cash_register_id') {
  return fake.tables[table]
    .filter((row) => row.member_id === TARGET_MEMBER_ID)
    .map((row) => String(row[column]))
    .sort();
}

before(async () => {
  fake = await startFakeSupabase();
  seedMember(fake, { slug: TENANT_SLUG, tenantUuid: TENANT_ID, role: 'owner', token: OWNER_TOKEN, userId: 'owner-user' });
  seedMember(fake, { slug: TENANT_SLUG, tenantUuid: TENANT_ID, role: 'supervisor_sucursal', token: SUPERVISOR_TOKEN, userId: 'supervisor-user' });
  seedMember(fake, { slug: TENANT_SLUG, tenantUuid: TENANT_ID, role: 'vendedor', token: 'unused-target-token', userId: TARGET_UID });
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

// --- Asignación por API (referencias legacy o uuid) ----------------------------------------------

test('acepta el id heredado de almacén y lo guarda como uuid', async () => {
  const response = await members.PATCH(patch({ warehouseIds: ['alm-a'] }));
  assert.equal(response.status, 200);
  assert.deepEqual(assigned('member_warehouses', 'warehouse_id'), [WAREHOUSE_A]);
});

test('acepta el uuid de almacén y de caja creados directo en Supabase', async () => {
  const response = await members.PATCH(patch({ warehouseIds: [WAREHOUSE_B], cashRegisterIds: [CASH_B] }));
  assert.equal(response.status, 200);
  assert.deepEqual(assigned('member_warehouses', 'warehouse_id'), [WAREHOUSE_B]);
  assert.deepEqual(assigned('member_cash_registers', 'cash_register_id'), [CASH_B]);
});

test('una caja con id heredado se guarda como uuid y se deduplica con el uuid', async () => {
  const response = await members.PATCH(patch({ cashRegisterIds: ['caja-a', CASH_A, 'caja-a'] }));
  assert.equal(response.status, 200);
  assert.deepEqual(assigned('member_cash_registers', 'cash_register_id'), [CASH_A]);
});

test('una lista vacía quita las asignaciones (vuelve a acceso total de sus sucursales)', async () => {
  fake.tables.member_warehouses.push({ tenant_id: TENANT_ID, member_id: TARGET_MEMBER_ID, warehouse_id: WAREHOUSE_A });
  const response = await members.PATCH(patch({ warehouseIds: [] }));
  assert.equal(response.status, 200);
  assert.deepEqual(assigned('member_warehouses', 'warehouse_id'), []);
});

test('una referencia de almacén inexistente responde 404 y no toca la asignación previa', async () => {
  fake.tables.member_warehouses.push({ tenant_id: TENANT_ID, member_id: TARGET_MEMBER_ID, warehouse_id: WAREHOUSE_A });
  const response = await members.PATCH(patch({ warehouseIds: ['alm-a', 'no-existe'] }));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, 'WAREHOUSE_NOT_FOUND');
  assert.deepEqual(assigned('member_warehouses', 'warehouse_id'), [WAREHOUSE_A]);
});

test('un almacén inactivo se trata como inexistente', async () => {
  const byLegacy = await members.PATCH(patch({ warehouseIds: ['alm-vieja'] }));
  assert.equal(byLegacy.status, 404);
  const byUuid = await members.PATCH(patch({ warehouseIds: [WAREHOUSE_INACTIVE] }));
  assert.equal(byUuid.status, 404);
  assert.deepEqual(assigned('member_warehouses', 'warehouse_id'), []);
});

test('una caja inexistente responde 404 CASH_REGISTER_NOT_FOUND', async () => {
  const response = await members.PATCH(patch({ cashRegisterIds: ['no-existe'] }));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, 'CASH_REGISTER_NOT_FOUND');
});

test('sucursales y recursos pueden guardarse en la misma solicitud', async () => {
  const response = await members.PATCH(patch({ branchIds: ['sucursal-a'], warehouseIds: ['alm-a'], cashRegisterIds: ['caja-a'] }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.changes.warehouseIds, [WAREHOUSE_A]);
  assert.deepEqual(body.changes.cashRegisterIds, [CASH_A]);
  assert.deepEqual(assigned('member_warehouses', 'warehouse_id'), [WAREHOUSE_A]);
  assert.deepEqual(assigned('member_cash_registers', 'cash_register_id'), [CASH_A]);
});

test('un error que no es de tabla ausente en la asignación sigue fallando con 500', async () => {
  fake.failTables.add('member_cash_registers');
  const response = await members.PATCH(patch({ cashRegisterIds: ['caja-a'] }));
  assert.equal(response.status, 500);
});

// --- Tabla ausente: fail-closed ----------------------------------------------------------------

test('asignar almacenes sin la tabla responde 503 y no escribe nada', async () => {
  fake.tableErrors.member_warehouses = PGRST205('member_warehouses');
  const response = await members.PATCH(patch({ warehouseIds: ['alm-a'] }));
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, 'DATABASE_MIGRATION_REQUIRED');
  assert.deepEqual(assigned('member_warehouses', 'warehouse_id'), []);
});

test('asignar cajas sin la tabla responde 503', async () => {
  fake.tableErrors.member_cash_registers = PGRST205('member_cash_registers');
  const response = await members.PATCH(patch({ cashRegisterIds: ['caja-a'] }));
  assert.equal(response.status, 503);
});

test('findMembership marca el recurso como no disponible y el contexto de un vendedor queda bloqueado', async () => {
  fake.tableErrors.member_warehouses = PGRST205('member_warehouses');
  const membership = await repository.findMembership(TENANT_SLUG, TARGET_UID);
  assert.ok(membership);
  assert.deepEqual(membership.unavailableResources, ['warehouses']);
  const context = repository.toTenantContext(TENANT_SLUG, TARGET_UID, membership);
  assert.deepEqual(context.unavailableResources, ['warehouses']);
  assert.throws(() => assertWarehouseAccess(context, WAREHOUSE_A), { message: 'RESOURCE_ASSIGNMENTS_UNAVAILABLE' });
  assert.equal(canAccessWarehouse(context, WAREHOUSE_A), false);
  assert.deepEqual(filterAuthorizedIds(context, [WAREHOUSE_A], undefined, 'warehouses'), []);
  assert.doesNotThrow(() => assertCashRegisterAccess(context, CASH_A));
});

test('con las tablas presentes no hay recursos no disponibles (sin regresión)', async () => {
  const membership = await repository.findMembership(TENANT_SLUG, TARGET_UID);
  assert.ok(membership);
  assert.deepEqual(membership.unavailableResources, []);
});

test('la tabla ausente nunca bloquea a administradores', () => {
  const owner: ScopeContext = { role: 'owner', branchIds: [], unavailableResources: ['warehouses', 'cashRegisters'] };
  assert.equal(canAccessWarehouse(owner, WAREHOUSE_A), true);
  assert.doesNotThrow(() => assertWarehouseAccess(owner, WAREHOUSE_A));
  assert.deepEqual(filterAuthorizedIds(owner, [WAREHOUSE_A], undefined, 'warehouses'), [WAREHOUSE_A]);
});

test('RESOURCE_ASSIGNMENTS_UNAVAILABLE se traduce a 503 con mensaje en español', () => {
  const response = tenantErrorResponse(new Error('RESOURCE_ASSIGNMENTS_UNAVAILABLE'));
  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'DATABASE_MIGRATION_REQUIRED');
  assert.match(response.body.error, /migración/);
});

test('WAREHOUSE_NOT_FOUND y CASH_REGISTER_NOT_FOUND se traducen a 404', () => {
  assert.equal(tenantErrorResponse(new Error('WAREHOUSE_NOT_FOUND')).status, 404);
  assert.equal(tenantErrorResponse(new Error('CASH_REGISTER_NOT_FOUND')).status, 404);
});

// --- Alcance del admin que asigna ---------------------------------------------------------------

test('un supervisor puede asignar almacenes de su sucursal', async () => {
  const response = await members.PATCH(patch({ warehouseIds: ['alm-a'] }, SUPERVISOR_TOKEN));
  assert.equal(response.status, 200);
  assert.deepEqual(assigned('member_warehouses', 'warehouse_id'), [WAREHOUSE_A]);
});

test('un supervisor no puede asignar un almacén de otra sucursal', async () => {
  const response = await members.PATCH(patch({ warehouseIds: [WAREHOUSE_B] }, SUPERVISOR_TOKEN));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'BRANCH_OUT_OF_SCOPE');
  assert.deepEqual(assigned('member_warehouses', 'warehouse_id'), []);
});

test('un supervisor con almacenes restringidos no puede otorgar un almacén que no opera', async () => {
  fake.tables.member_warehouses.push({ tenant_id: TENANT_ID, member_id: SUPERVISOR_MEMBER_ID, warehouse_id: WAREHOUSE_A });
  const denied = await members.PATCH(patch({ warehouseIds: [WAREHOUSE_A2] }, SUPERVISOR_TOKEN));
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, 'WAREHOUSE_OUT_OF_SCOPE');
  const allowed = await members.PATCH(patch({ warehouseIds: [WAREHOUSE_A] }, SUPERVISOR_TOKEN));
  assert.equal(allowed.status, 200);
});

test('un supervisor no puede otorgar una caja de otra sucursal', async () => {
  const response = await members.PATCH(patch({ cashRegisterIds: [CASH_B] }, SUPERVISOR_TOKEN));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'BRANCH_OUT_OF_SCOPE');
});

// --- Lectura: el listado devuelve las asignaciones con las mismas referencias de la UI ----------

test('GET /api/members devuelve warehouseIds y cashRegisterIds como referencias legacy o uuid', async () => {
  fake.tables.member_warehouses.push({ tenant_id: TENANT_ID, member_id: TARGET_MEMBER_ID, warehouse_id: WAREHOUSE_A });
  fake.tables.member_warehouses.push({ tenant_id: TENANT_ID, member_id: TARGET_MEMBER_ID, warehouse_id: WAREHOUSE_B });
  fake.tables.member_cash_registers.push({ tenant_id: TENANT_ID, member_id: TARGET_MEMBER_ID, cash_register_id: CASH_B });
  const response = await members.GET(listRequest());
  assert.equal(response.status, 200);
  const body = await response.json();
  const target = body.members.find((item: { role: string }) => item.role === 'vendedor');
  assert.ok(target);
  assert.deepEqual([...target.warehouseIds].sort(), ['alm-a', WAREHOUSE_B].sort());
  assert.deepEqual(target.cashRegisterIds, [CASH_B]);
});

test('GET /api/members sin tablas nuevas devuelve listas vacías y responde 200', async () => {
  fake.tableErrors.member_warehouses = PGRST205('member_warehouses');
  fake.tableErrors.member_cash_registers = PGRST205('member_cash_registers');
  const response = await members.GET(listRequest());
  assert.equal(response.status, 200);
  const body = await response.json();
  const target = body.members.find((item: { role: string }) => item.role === 'vendedor');
  assert.deepEqual(target.warehouseIds, []);
  assert.deepEqual(target.cashRegisterIds, []);
});
