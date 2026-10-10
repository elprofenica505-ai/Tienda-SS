import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { NextRequest } from 'next/server';
import { seedMember, startFakeSupabase, type FakeSupabase } from './helpers/fake-supabase';

/**
 * La UI de miembros envía `legacy_firestore_id || id`. Una sucursal creada directo en Supabase llega como uuid
 * y no tiene legacy id: la asignación debe aceptar ambas formas y rechazar lo que no existe o está inactivo.
 */

type MembersRoute = typeof import('@/app/api/members/route');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_SLUG = 'branch-resolution-shop';
const OWNER_TOKEN = 'resolution-owner-token';
const TARGET_UID = 'target-user';
const TARGET_MEMBER_ID = `member-${TARGET_UID}-${TENANT_ID}`;
const BRANCH_LEGACY_UUID = '22222222-2222-4222-8222-222222222221';
const BRANCH_UUID_ONLY = '22222222-2222-4222-8222-222222222222';
const BRANCH_INACTIVE = '22222222-2222-4222-8222-222222222223';

let fake: FakeSupabase;
let members: MembersRoute;

function resetData() {
  fake.tables.branches = [
    { id: BRANCH_LEGACY_UUID, tenant_id: TENANT_ID, legacy_firestore_id: 'principal', code: 'P', name: 'Principal', active: true },
    { id: BRANCH_UUID_ONLY, tenant_id: TENANT_ID, legacy_firestore_id: null, code: 'U', name: 'Creada en Supabase', active: true },
    { id: BRANCH_INACTIVE, tenant_id: TENANT_ID, legacy_firestore_id: 'vieja', code: 'V', name: 'Vieja', active: false },
  ];
  // Asignación previa: debe reemplazarse solo cuando la nueva lista es válida.
  fake.tables.member_branches = [{ tenant_id: TENANT_ID, member_id: TARGET_MEMBER_ID, branch_id: BRANCH_UUID_ONLY }];
  fake.failTables.clear();
  fake.tableErrors = {};
}

function patch(branchIds: unknown) {
  return new NextRequest('http://localhost/api/members', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${OWNER_TOKEN}`, 'x-tenant-id': TENANT_SLUG, 'content-type': 'application/json' },
    body: JSON.stringify({ uid: TARGET_UID, branchIds }),
  });
}

function assignedBranchIds() {
  return fake.tables.member_branches
    .filter((row) => row.member_id === TARGET_MEMBER_ID)
    .map((row) => String(row.branch_id))
    .sort();
}

before(async () => {
  fake = await startFakeSupabase();
  seedMember(fake, { slug: TENANT_SLUG, tenantUuid: TENANT_ID, role: 'owner', token: OWNER_TOKEN, userId: 'owner-user' });
  seedMember(fake, { slug: TENANT_SLUG, tenantUuid: TENANT_ID, role: 'vendedor', token: 'unused-target-token', userId: TARGET_UID });
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  process.env.RATE_LIMIT_SHARED = 'false';
  members = await import('@/app/api/members/route');
});

after(async () => {
  await fake.close();
});

beforeEach(resetData);

test('acepta el id heredado de Firestore y lo traduce al uuid de la sucursal', async () => {
  const response = await members.PATCH(patch(['principal']));
  assert.equal(response.status, 200);
  assert.deepEqual(assignedBranchIds(), [BRANCH_LEGACY_UUID]);
});

test('acepta el uuid de una sucursal creada directo en Supabase (sin legacy id)', async () => {
  const response = await members.PATCH(patch([BRANCH_UUID_ONLY]));
  assert.equal(response.status, 200);
  assert.deepEqual(assignedBranchIds(), [BRANCH_UUID_ONLY]);
});

test('mezcla uuid e id heredado en la misma asignación y elimina duplicados', async () => {
  const response = await members.PATCH(patch(['principal', BRANCH_UUID_ONLY, BRANCH_LEGACY_UUID, 'principal']));
  assert.equal(response.status, 200);
  assert.deepEqual(assignedBranchIds(), [BRANCH_LEGACY_UUID, BRANCH_UUID_ONLY].sort());
});

test('una referencia inexistente responde 404 BRANCH_NOT_FOUND y no toca la asignación previa', async () => {
  const response = await members.PATCH(patch(['principal', 'no-existe']));
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.code, 'BRANCH_NOT_FOUND');
  assert.deepEqual(assignedBranchIds(), [BRANCH_UUID_ONLY]);
});

test('una sucursal inactiva se trata como inexistente', async () => {
  const response = await members.PATCH(patch(['vieja']));
  assert.equal(response.status, 404);
  assert.deepEqual(assignedBranchIds(), [BRANCH_UUID_ONLY]);
  const byUuid = await members.PATCH(patch([BRANCH_INACTIVE]));
  assert.equal(byUuid.status, 404);
});

test('una lista vacía quita todas las sucursales del miembro', async () => {
  const response = await members.PATCH(patch([]));
  assert.equal(response.status, 200);
  assert.deepEqual(assignedBranchIds(), []);
});
