import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { NextRequest } from 'next/server';
import { seedMember, startFakeSupabase, type FakeRow, type FakeSupabase } from './helpers/fake-supabase';

type InventoryRoute = typeof import('@/app/api/inventory/route');
type WarehousesRoute = typeof import('@/app/api/inventory/warehouses/route');
type ReservationsRoute = typeof import('@/app/api/inventory/reservations/route');
type CashSessionsRoute = typeof import('@/app/api/cash-sessions/route');
type CashMovementsRoute = typeof import('@/app/api/cash-sessions/movements/route');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_SLUG = 'enforce-shop';
const BRANCH_A = '22222222-2222-4222-8222-222222222201';
const BRANCH_B = '22222222-2222-4222-8222-222222222202';
const WAREHOUSE_A = '33333333-3333-4333-8333-333333333301';
const WAREHOUSE_A2 = '33333333-3333-4333-8333-333333333302';
const WAREHOUSE_B = '33333333-3333-4333-8333-333333333303';
const CASH_1 = '44444444-4444-4444-8444-444444444401';
const CASH_2 = '44444444-4444-4444-8444-444444444402';
const PRODUCT_1 = '55555555-5555-4555-8555-555555555501';
const PRODUCT_2 = '55555555-5555-4555-8555-555555555502';
const SESSION_1 = '66666666-6666-4666-8666-666666666601';
const SESSION_2 = '66666666-6666-4666-8666-666666666602';
const TRANSFER_A_TO_A2 = '77777777-7777-4777-8777-777777777701';
const RESERVATION_A = '88888888-8888-4888-8888-888888888801';
const RESERVATION_A2 = '88888888-8888-4888-8888-888888888802';

const OWNER_TOKEN = 'owner-token';
const BODEGA_RESTRICTED_TOKEN = 'bodega-restricted-token';
const BODEGA_FREE_TOKEN = 'bodega-free-token';
const CAJERO_RESTRICTED_TOKEN = 'cajero-restricted-token';
const CAJERO_FREE_TOKEN = 'cajero-free-token';

const BODEGA_RESTRICTED_UID = 'bodega-restricted-user';
const BODEGA_FREE_UID = 'bodega-free-user';
const CAJERO_RESTRICTED_UID = 'cajero-restricted-user';
const CAJERO_FREE_UID = 'cajero-free-user';

const PGRST205 = (table: string) => ({
  status: 404,
  body: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache`, details: null, hint: null },
});

let fake: FakeSupabase;
let inventoryRoute: InventoryRoute;
let warehousesRoute: WarehousesRoute;
let reservationsRoute: ReservationsRoute;
let cashSessionsRoute: CashSessionsRoute;
let cashMovementsRoute: CashMovementsRoute;

function resetData() {
  fake.tableErrors = {};
  fake.failTables.clear();
  fake.requests.length = 0;
  fake.rpcCalls.length = 0;

  fake.tables.tenants = [{
    id: TENANT_ID,
    legacy_firestore_id: TENANT_SLUG,
    name: 'Tienda Enforce',
    status: 'active',
    platform_status: 'active',
    subscription_status: 'active',
  }];

  fake.tables.branches = [
    { id: BRANCH_A, tenant_id: TENANT_ID, legacy_firestore_id: 'principal', code: 'A', name: 'Principal', active: true },
    { id: BRANCH_B, tenant_id: TENANT_ID, legacy_firestore_id: 'secundaria', code: 'B', name: 'Secundaria', active: true },
  ];

  fake.tables.member_branches = [
    { tenant_id: TENANT_ID, member_id: `member-${BODEGA_RESTRICTED_UID}-${TENANT_ID}`, branch_id: BRANCH_A, branches: { legacy_firestore_id: 'principal' } },
    { tenant_id: TENANT_ID, member_id: `member-${BODEGA_FREE_UID}-${TENANT_ID}`, branch_id: BRANCH_A, branches: { legacy_firestore_id: 'principal' } },
    { tenant_id: TENANT_ID, member_id: `member-${CAJERO_RESTRICTED_UID}-${TENANT_ID}`, branch_id: BRANCH_A, branches: { legacy_firestore_id: 'principal' } },
    { tenant_id: TENANT_ID, member_id: `member-${CAJERO_FREE_UID}-${TENANT_ID}`, branch_id: BRANCH_A, branches: { legacy_firestore_id: 'principal' } },
  ];

  fake.tables.warehouses = [
    { id: WAREHOUSE_A, tenant_id: TENANT_ID, branch_id: BRANCH_A, legacy_firestore_id: 'bodega-a', code: 'A', name: 'Bodega A', active: true },
    { id: WAREHOUSE_A2, tenant_id: TENANT_ID, branch_id: BRANCH_A, legacy_firestore_id: 'bodega-a2', code: 'A2', name: 'Bodega A2', active: true },
    { id: WAREHOUSE_B, tenant_id: TENANT_ID, branch_id: BRANCH_B, legacy_firestore_id: 'bodega-b', code: 'B', name: 'Bodega B', active: true },
  ];

  // BODEGA_RESTRICTED only has WAREHOUSE_A
  fake.tables.member_warehouses = [
    { tenant_id: TENANT_ID, member_id: `member-${BODEGA_RESTRICTED_UID}-${TENANT_ID}`, warehouse_id: WAREHOUSE_A },
  ];

  fake.tables.cash_registers = [
    { id: CASH_1, tenant_id: TENANT_ID, branch_id: BRANCH_A, legacy_firestore_id: 'caja-1', code: 'C1', name: 'Caja 1', active: true },
    { id: CASH_2, tenant_id: TENANT_ID, branch_id: BRANCH_A, legacy_firestore_id: 'caja-2', code: 'C2', name: 'Caja 2', active: true },
  ];

  // CAJERO_RESTRICTED only has CASH_1
  fake.tables.member_cash_registers = [
    { tenant_id: TENANT_ID, member_id: `member-${CAJERO_RESTRICTED_UID}-${TENANT_ID}`, cash_register_id: CASH_1 },
  ];

  fake.tables.products = [
    { id: PRODUCT_1, tenant_id: TENANT_ID, name: 'Arroz 1lb', sku: 'ARR-1', item_type: 'physical', min_stock: 5, active: true, cost: 20 },
    { id: PRODUCT_2, tenant_id: TENANT_ID, name: 'Frijol 1lb', sku: 'FRI-1', item_type: 'physical', min_stock: 5, active: true, cost: 30 },
  ];

  fake.tables.inventory_stocks = [
    { id: 'stock-1', tenant_id: TENANT_ID, warehouse_id: WAREHOUSE_A, product_id: PRODUCT_1, quantity: 50, reserved_quantity: 5, in_transit_quantity: 0, reorder_point: 5, average_cost: 20, updated_at: '2026-10-10T12:00:00.000Z' },
    { id: 'stock-2', tenant_id: TENANT_ID, warehouse_id: WAREHOUSE_A2, product_id: PRODUCT_1, quantity: 100, reserved_quantity: 0, in_transit_quantity: 0, reorder_point: 5, average_cost: 20, updated_at: '2026-10-10T12:00:00.000Z' },
  ];

  fake.tables.inventory_movements = [
    { id: 'mov-1', tenant_id: TENANT_ID, warehouse_id: WAREHOUSE_A, product_id: PRODUCT_1, movement_type: 'receive', quantity: 50, unit_cost: 20, reference_type: 'manual', performed_by: 'owner-user', created_at: '2026-10-10T12:00:00.000Z', warehouses: { branch_id: BRANCH_A } },
    { id: 'mov-2', tenant_id: TENANT_ID, warehouse_id: WAREHOUSE_A2, product_id: PRODUCT_1, movement_type: 'receive', quantity: 100, unit_cost: 20, reference_type: 'manual', performed_by: 'owner-user', created_at: '2026-10-10T12:01:00.000Z', warehouses: { branch_id: BRANCH_A } },
  ];

  fake.tables.stock_transfers = [
    {
      id: TRANSFER_A_TO_A2,
      tenant_id: TENANT_ID,
      transfer_number: 'TRF-001',
      status: 'approved',
      origin_branch_id: BRANCH_A,
      origin_warehouse_id: WAREHOUSE_A,
      destination_branch_id: BRANCH_A,
      destination_warehouse_id: WAREHOUSE_A2,
      reason: 'Reabastecimiento',
      created_by: 'owner-user',
      created_at: '2026-10-10T12:00:00.000Z',
      updated_at: '2026-10-10T12:00:00.000Z',
    },
  ];

  fake.tables.stock_transfer_items = [
    { id: 'item-1', tenant_id: TENANT_ID, transfer_id: TRANSFER_A_TO_A2, product_id: PRODUCT_1, requested_quantity: 10, shipped_quantity: 10, received_quantity: 0, unit_cost: 20 },
  ];

  fake.tables.inventory_reservations = [
    { id: RESERVATION_A, tenant_id: TENANT_ID, branch_id: BRANCH_A, warehouse_id: WAREHOUSE_A, status: 'active', items: [{ productId: PRODUCT_1, quantity: 5 }] },
    { id: RESERVATION_A2, tenant_id: TENANT_ID, branch_id: BRANCH_A, warehouse_id: WAREHOUSE_A2, status: 'active', items: [{ productId: PRODUCT_1, quantity: 5 }] },
  ];

  fake.tables.cash_sessions = [
    { id: SESSION_1, tenant_id: TENANT_ID, branch_id: BRANCH_A, cash_register_id: CASH_1, status: 'open', opening_amount: 500, opened_by: 'cajero', opened_at: '2026-10-10T08:00:00.000Z' },
    { id: SESSION_2, tenant_id: TENANT_ID, branch_id: BRANCH_A, cash_register_id: CASH_2, status: 'open', opening_amount: 500, opened_by: 'cajero', opened_at: '2026-10-10T08:05:00.000Z' },
  ];

  fake.tables.cash_movements = [
    { id: 'cm-1', tenant_id: TENANT_ID, cash_session_id: SESSION_1, movement_type: 'deposit', amount: 100, reference_type: 'manual', performed_by: 'cajero', created_at: '2026-10-10T09:00:00.000Z', cash_sessions: { branch_id: BRANCH_A, cash_register_id: CASH_1, status: 'open' } },
    { id: 'cm-2', tenant_id: TENANT_ID, cash_session_id: SESSION_2, movement_type: 'deposit', amount: 200, reference_type: 'manual', performed_by: 'cajero', created_at: '2026-10-10T09:05:00.000Z', cash_sessions: { branch_id: BRANCH_A, cash_register_id: CASH_2, status: 'open' } },
  ];

  fake.rpc = {
    append_audit_log: () => ({ body: 'audit-entry' }),
    adjust_inventory: () => ({ body: { previous_quantity: 50, new_quantity: 55, delta: 5, movement_id: 'mov-new' } }),
    create_stock_transfer: () => ({ body: { transferId: 'trf-new', transferNumber: 'TRF-002', status: 'draft', originWarehouseId: WAREHOUSE_A, destinationWarehouseId: WAREHOUSE_A2 } }),
    approve_stock_transfer: () => ({ body: { transferId: TRANSFER_A_TO_A2, status: 'approved' } }),
    dispatch_stock_transfer: () => ({ body: { transferId: TRANSFER_A_TO_A2, status: 'in_transit' } }),
    receive_stock_transfer: () => ({ body: { transferId: TRANSFER_A_TO_A2, status: 'in_transit' } }),
    cancel_stock_transfer: () => ({ body: { transferId: TRANSFER_A_TO_A2, status: 'cancelled' } }),
    reserve_inventory: () => ({ body: { reservationId: 'res-new', branchId: BRANCH_A, warehouseId: WAREHOUSE_A } }),
    release_inventory_reservation: () => ({ body: { reservationId: RESERVATION_A, status: 'released' } }),
    cash_session_action: () => ({ body: { id: 'session-new', branchId: BRANCH_A, status: 'open' } }),
    cash_session_close_atomic: () => ({ body: { id: SESSION_1, status: 'closed' } }),
  };
}

function req(url: string, token: string, branchId = 'principal', method = 'GET', body?: Record<string, unknown>) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': TENANT_SLUG,
      'x-branch-id': branchId,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

before(async () => {
  fake = await startFakeSupabase();
  seedMember(fake, { slug: TENANT_SLUG, tenantUuid: TENANT_ID, role: 'owner', token: OWNER_TOKEN, userId: 'owner-user' });
  seedMember(fake, { slug: TENANT_SLUG, tenantUuid: TENANT_ID, role: 'bodega', token: BODEGA_RESTRICTED_TOKEN, userId: BODEGA_RESTRICTED_UID });
  seedMember(fake, { slug: TENANT_SLUG, tenantUuid: TENANT_ID, role: 'bodega', token: BODEGA_FREE_TOKEN, userId: BODEGA_FREE_UID });
  seedMember(fake, { slug: TENANT_SLUG, tenantUuid: TENANT_ID, role: 'cajero', token: CAJERO_RESTRICTED_TOKEN, userId: CAJERO_RESTRICTED_UID });
  seedMember(fake, { slug: TENANT_SLUG, tenantUuid: TENANT_ID, role: 'cajero', token: CAJERO_FREE_TOKEN, userId: CAJERO_FREE_UID });

  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  process.env.RATE_LIMIT_SHARED = 'false';

  inventoryRoute = await import('@/app/api/inventory/route');
  warehousesRoute = await import('@/app/api/inventory/warehouses/route');
  reservationsRoute = await import('@/app/api/inventory/reservations/route');
  cashSessionsRoute = await import('@/app/api/cash-sessions/route');
  cashMovementsRoute = await import('@/app/api/cash-sessions/movements/route');
});

after(async () => {
  await fake.close();
});

beforeEach(resetData);

test('GET /api/inventory: miembro restringido a Bodega A sólo recibe stock y movimientos de Bodega A', async () => {
  const response = await inventoryRoute.GET(req('/api/inventory?products=true', BODEGA_RESTRICTED_TOKEN));
  assert.equal(response.status, 200);
  const data = await response.json() as FakeRow;
  assert.equal(data.ok, true);
  const products = data.products as Array<{ id: string; stock: number }>;
  assert.equal(products.find((p) => p.id === PRODUCT_1)?.stock, 50, 'sólo suma los 50 de Bodega A, excluye los 100 de Bodega A2');
  const movements = data.movements as Array<{ warehouseId: string }>;
  assert.equal(movements.length, 1);
  assert.equal(movements[0].warehouseId, WAREHOUSE_A);
});

test('GET /api/inventory: miembro sin asignación explícita recibe stock y movimientos de todos los almacenes de su sucursal', async () => {
  const response = await inventoryRoute.GET(req('/api/inventory?products=true', BODEGA_FREE_TOKEN));
  assert.equal(response.status, 200);
  const data = await response.json() as FakeRow;
  assert.equal(data.ok, true);
  const products = data.products as Array<{ id: string; stock: number }>;
  assert.equal(products.find((p) => p.id === PRODUCT_1)?.stock, 150, 'suma los 50 de Bodega A y los 100 de Bodega A2');
  const movements = data.movements as Array<{ warehouseId: string }>;
  assert.equal(movements.length, 2);
});

test('GET /api/inventory: tabla ausente bloquea a miembro operativo con 503 fail-closed', async () => {
  fake.tableErrors.member_warehouses = PGRST205('member_warehouses');
  const response = await inventoryRoute.GET(req('/api/inventory', BODEGA_RESTRICTED_TOKEN));
  assert.equal(response.status, 503);
  const body = await response.json() as FakeRow;
  assert.equal(body.code, 'DATABASE_MIGRATION_REQUIRED');
});

test('GET /api/inventory: owner pasa aunque falte la tabla member_warehouses', async () => {
  fake.tableErrors.member_warehouses = PGRST205('member_warehouses');
  const response = await inventoryRoute.GET(req('/api/inventory?products=true', OWNER_TOKEN));
  assert.equal(response.status, 200);
  const data = await response.json() as FakeRow;
  assert.equal(data.ok, true);
});

test('POST /api/inventory: miembro ajusta inventario en almacén asignado y es rechazado en no asignado', async () => {
  const okResponse = await inventoryRoute.POST(req('/api/inventory', BODEGA_RESTRICTED_TOKEN, 'principal', 'POST', {
    productId: PRODUCT_1,
    movementType: 'receive',
    quantity: 5,
    warehouseId: WAREHOUSE_A,
    reason: 'Ingreso autorizado',
  }));
  assert.equal(okResponse.status, 201);

  const blockedResponse = await inventoryRoute.POST(req('/api/inventory', BODEGA_RESTRICTED_TOKEN, 'principal', 'POST', {
    productId: PRODUCT_1,
    movementType: 'receive',
    quantity: 5,
    warehouseId: WAREHOUSE_A2,
    reason: 'Intento en almacén ajeno',
  }));
  assert.equal(blockedResponse.status, 403);
  const body = await blockedResponse.json() as FakeRow;
  assert.equal(body.code, 'WAREHOUSE_OUT_OF_SCOPE');
});

test('GET /api/inventory/warehouses: sólo lista almacenes que el usuario tiene asignados', async () => {
  const response = await warehousesRoute.GET(req('/api/inventory/warehouses', BODEGA_RESTRICTED_TOKEN));
  assert.equal(response.status, 200);
  const data = await response.json() as { ok: boolean; warehouses: Array<{ id: string }> };
  assert.equal(data.ok, true);
  assert.deepEqual(data.warehouses.map((w) => w.id), [WAREHOUSE_A]);
});

test('GET /api/inventory/warehouses: parámetro warehouseId hacia almacén no asignado responde 403', async () => {
  const response = await warehousesRoute.GET(req(`/api/inventory/warehouses?warehouseId=${WAREHOUSE_A2}`, BODEGA_RESTRICTED_TOKEN));
  assert.equal(response.status, 403);
});

test('POST /api/inventory/warehouses: conteo físico respeta almacén asignado y bloquea no asignado', async () => {
  const okCount = await warehousesRoute.POST(req('/api/inventory/warehouses', BODEGA_RESTRICTED_TOKEN, 'principal', 'POST', {
    action: 'count',
    warehouseId: WAREHOUSE_A,
    productId: PRODUCT_1,
    countedQuantity: 50,
  }));
  assert.equal(okCount.status, 201);

  const blockedCount = await warehousesRoute.POST(req('/api/inventory/warehouses', BODEGA_RESTRICTED_TOKEN, 'principal', 'POST', {
    action: 'count',
    warehouseId: WAREHOUSE_A2,
    productId: PRODUCT_1,
    countedQuantity: 100,
  }));
  assert.equal(blockedCount.status, 403);
  assert.equal((await blockedCount.json() as FakeRow).code, 'WAREHOUSE_OUT_OF_SCOPE');
});

test('POST /api/inventory/warehouses: transferencias exigen permiso en origen para crear/aprobar y en destino para recibir', async () => {
  // BODEGA_RESTRICTED has WAREHOUSE_A, but not WAREHOUSE_A2
  const okCreate = await warehousesRoute.POST(req('/api/inventory/warehouses', BODEGA_RESTRICTED_TOKEN, 'principal', 'POST', {
    action: 'create-transfer',
    fromWarehouseId: WAREHOUSE_A,
    toWarehouseId: WAREHOUSE_A2,
    items: [{ productId: PRODUCT_1, quantity: 5 }],
  }));
  assert.equal(okCreate.status, 201);

  const blockedCreate = await warehousesRoute.POST(req('/api/inventory/warehouses', BODEGA_RESTRICTED_TOKEN, 'principal', 'POST', {
    action: 'create-transfer',
    fromWarehouseId: WAREHOUSE_A2,
    toWarehouseId: WAREHOUSE_A,
    items: [{ productId: PRODUCT_1, quantity: 5 }],
  }));
  assert.equal(blockedCreate.status, 403);
  assert.equal((await blockedCreate.json() as FakeRow).code, 'WAREHOUSE_OUT_OF_SCOPE');

  // approve-transfer checks origin warehouse (WAREHOUSE_A) -> allowed for BODEGA_RESTRICTED
  const okApprove = await warehousesRoute.POST(req('/api/inventory/warehouses', BODEGA_RESTRICTED_TOKEN, 'principal', 'POST', {
    action: 'approve-transfer',
    transferId: TRANSFER_A_TO_A2,
  }));
  assert.equal(okApprove.status, 200);

  // receive-transfer checks destination warehouse (WAREHOUSE_A2) -> BODEGA_RESTRICTED does NOT operate WAREHOUSE_A2
  const blockedReceive = await warehousesRoute.POST(req('/api/inventory/warehouses', BODEGA_RESTRICTED_TOKEN, 'principal', 'POST', {
    action: 'receive-transfer',
    transferId: TRANSFER_A_TO_A2,
    items: [{ transferItemId: 'item-1', quantity: 10 }],
  }));
  assert.equal(blockedReceive.status, 403);
  assert.equal((await blockedReceive.json() as FakeRow).code, 'WAREHOUSE_OUT_OF_SCOPE');
});

test('POST y DELETE /api/inventory/reservations: valida alcance del almacén en reserva y liberación', async () => {
  const okReserve = await reservationsRoute.POST(req('/api/inventory/reservations', BODEGA_RESTRICTED_TOKEN, 'principal', 'POST', {
    branchId: BRANCH_A,
    warehouseId: WAREHOUSE_A,
    items: [{ productId: PRODUCT_1, quantity: 2 }],
  }));
  assert.equal(okReserve.status, 201);

  const blockedReserve = await reservationsRoute.POST(req('/api/inventory/reservations', BODEGA_RESTRICTED_TOKEN, 'principal', 'POST', {
    branchId: BRANCH_A,
    warehouseId: WAREHOUSE_A2,
    items: [{ productId: PRODUCT_1, quantity: 2 }],
  }));
  assert.equal(blockedReserve.status, 403);
  assert.equal((await blockedReserve.json() as FakeRow).code, 'WAREHOUSE_OUT_OF_SCOPE');

  // DELETE release reservation on WAREHOUSE_A (allowed) vs WAREHOUSE_A2 (blocked)
  const okRelease = await reservationsRoute.DELETE(req(`/api/inventory/reservations?id=${RESERVATION_A}`, BODEGA_RESTRICTED_TOKEN));
  assert.equal(okRelease.status, 200);

  const blockedRelease = await reservationsRoute.DELETE(req(`/api/inventory/reservations?id=${RESERVATION_A2}`, BODEGA_RESTRICTED_TOKEN));
  assert.equal(blockedRelease.status, 403);
  assert.equal((await blockedRelease.json() as FakeRow).code, 'WAREHOUSE_OUT_OF_SCOPE');
});

test('GET /api/cash-sessions: filtra sesiones para mostrar únicamente las de la caja asignada', async () => {
  const response = await cashSessionsRoute.GET(req('/api/cash-sessions', CAJERO_RESTRICTED_TOKEN));
  assert.equal(response.status, 200);
  const data = await response.json() as { ok: boolean; sessions: Array<{ registerId: string }> };
  assert.equal(data.ok, true);
  assert.equal(data.sessions.length, 1);
  assert.equal(data.sessions[0].registerId, CASH_1);

  // Cajero sin asignación explícita ve ambas cajas
  const freeResponse = await cashSessionsRoute.GET(req('/api/cash-sessions', CAJERO_FREE_TOKEN));
  assert.equal(freeResponse.status, 200);
  const freeData = await freeResponse.json() as { ok: boolean; sessions: Array<{ registerId: string }> };
  assert.equal(freeData.sessions.length, 2);
});

test('POST /api/cash-sessions: valida caja asignada al abrir turno y al registrar movimientos', async () => {
  // Abrir turno en caja asignada vs no asignada
  const okOpen = await cashSessionsRoute.POST(req('/api/cash-sessions', CAJERO_RESTRICTED_TOKEN, 'principal', 'POST', {
    action: 'open',
    registerId: CASH_1,
    openingByMethod: { cash: 100 },
  }));
  assert.equal(okOpen.status, 201);

  const blockedOpen = await cashSessionsRoute.POST(req('/api/cash-sessions', CAJERO_RESTRICTED_TOKEN, 'principal', 'POST', {
    action: 'open',
    registerId: CASH_2,
    openingByMethod: { cash: 100 },
  }));
  assert.equal(blockedOpen.status, 403);
  assert.equal((await blockedOpen.json() as FakeRow).code, 'CASH_REGISTER_OUT_OF_SCOPE');

  // Movimiento en sesión de caja asignada (SESSION_1) vs no asignada (SESSION_2)
  const okMovement = await cashSessionsRoute.POST(req('/api/cash-sessions', CAJERO_RESTRICTED_TOKEN, 'principal', 'POST', {
    action: 'movement',
    sessionId: SESSION_1,
    direction: 'in',
    amount: 50,
    paymentMethod: 'cash',
    description: 'Depósito operativo',
  }));
  assert.equal(okMovement.status, 201);

  const blockedMovement = await cashSessionsRoute.POST(req('/api/cash-sessions', CAJERO_RESTRICTED_TOKEN, 'principal', 'POST', {
    action: 'movement',
    sessionId: SESSION_2,
    direction: 'in',
    amount: 50,
    paymentMethod: 'cash',
    description: 'Depósito indebido',
  }));
  assert.equal(blockedMovement.status, 403);
  assert.equal((await blockedMovement.json() as FakeRow).code, 'CASH_REGISTER_OUT_OF_SCOPE');
});

test('GET /api/cash-sessions/movements: sólo devuelve movimientos de sesiones de su caja asignada', async () => {
  const response = await cashMovementsRoute.GET(req('/api/cash-sessions/movements', CAJERO_RESTRICTED_TOKEN));
  assert.equal(response.status, 200);
  const data = await response.json() as { ok: boolean; movements: Array<{ cashSessionId: string }> };
  assert.equal(data.ok, true);
  assert.equal(data.movements.length, 1);
  assert.equal(data.movements[0].cashSessionId, SESSION_1);
});

test('GET /api/cash-sessions y movimientos: tabla ausente responde 503 fail-closed para rol no administrativo', async () => {
  fake.tableErrors.member_cash_registers = PGRST205('member_cash_registers');

  const sessionRes = await cashSessionsRoute.GET(req('/api/cash-sessions', CAJERO_RESTRICTED_TOKEN));
  assert.equal(sessionRes.status, 503);
  assert.equal((await sessionRes.json() as FakeRow).code, 'DATABASE_MIGRATION_REQUIRED');

  const movementRes = await cashMovementsRoute.GET(req('/api/cash-sessions/movements', CAJERO_RESTRICTED_TOKEN));
  assert.equal(movementRes.status, 503);
  assert.equal((await movementRes.json() as FakeRow).code, 'DATABASE_MIGRATION_REQUIRED');

  // Owner no se ve bloqueado
  const ownerRes = await cashSessionsRoute.GET(req('/api/cash-sessions', OWNER_TOKEN));
  assert.equal(ownerRes.status, 200);
});
