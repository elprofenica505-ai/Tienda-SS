import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { NextRequest } from 'next/server';
import {
  parseReceiptItems,
  parseTransferItems,
  transferErrorResponse,
  transferTotals,
} from '@/lib/inventory-transfers';
import { seedMember, startFakeSupabase, type FakeRow, type FakeSupabase } from './helpers/fake-supabase';

type RouteModule = typeof import('@/app/api/inventory/warehouses/route');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const ORIGIN_WAREHOUSE_ID = '44444444-4444-4444-8444-444444444441';
const DESTINATION_WAREHOUSE_ID = '44444444-4444-4444-8444-444444444442';
const FOREIGN_WAREHOUSE_ID = '44444444-4444-4444-8444-444444444443';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555551';
const TRANSFER_ID = '66666666-6666-4666-8666-666666666661';
const TRANSFER_ITEM_ID = '77777777-7777-4777-8777-777777777771';
const FOREIGN_TRANSFER_ID = '66666666-6666-4666-8666-666666666662';
const OWNER_TOKEN = 'warehouse-owner-token';
const STAFF_TOKEN = 'warehouse-staff-token';

let fake: FakeSupabase;
let route: RouteModule;
const auditCalls: Array<Record<string, unknown>> = [];

function sqlError(code: string, status = 400) {
  return { status, body: { code: 'P0001', message: code, details: null, hint: null } };
}

function resetData() {
  fake.tables.tenants = [{ id: TENANT_ID, legacy_firestore_id: 'transfer-shop', status: 'active', platform_status: 'active', subscription_status: 'active' }];
  fake.tables.branches = [
    { id: BRANCH_ID, tenant_id: TENANT_ID, legacy_firestore_id: 'principal', name: 'Principal', active: true },
    { id: OTHER_BRANCH_ID, tenant_id: TENANT_ID, legacy_firestore_id: 'otra', name: 'Otra sucursal', active: true },
  ];
  fake.tables.member_branches = [{ tenant_id: TENANT_ID, member_id: 'member-staff-user-' + TENANT_ID, branch_id: BRANCH_ID, branches: { legacy_firestore_id: 'principal' } }];
  fake.tables.warehouses = [
    { id: ORIGIN_WAREHOUSE_ID, tenant_id: TENANT_ID, branch_id: BRANCH_ID, legacy_firestore_id: 'bodega-a', code: 'A', name: 'Bodega A', active: true },
    { id: DESTINATION_WAREHOUSE_ID, tenant_id: TENANT_ID, branch_id: BRANCH_ID, legacy_firestore_id: 'bodega-b', code: 'B', name: 'Bodega B', active: true },
    { id: FOREIGN_WAREHOUSE_ID, tenant_id: TENANT_ID, branch_id: OTHER_BRANCH_ID, legacy_firestore_id: 'bodega-c', code: 'C', name: 'Bodega C', active: true },
  ];
  fake.tables.products = [{ id: PRODUCT_ID, tenant_id: TENANT_ID, name: 'Frijoles 1lb', sku: 'FRI-1', item_type: 'physical', cost: 18.5, active: true }];
  fake.tables.inventory_stocks = [{
    id: '88888888-8888-4888-8888-888888888881',
    tenant_id: TENANT_ID,
    warehouse_id: ORIGIN_WAREHOUSE_ID,
    product_id: PRODUCT_ID,
    quantity: 100,
    reserved_quantity: 20,
    in_transit_quantity: 5,
    reorder_point: 10,
    average_cost: 18.5,
    updated_at: '2026-10-10T12:00:00.000Z',
    products: { id: PRODUCT_ID, name: 'Frijoles 1lb', sku: 'FRI-1', cost: 18.5 },
  }];
  fake.tables.stock_transfers = [
    {
      id: TRANSFER_ID,
      tenant_id: TENANT_ID,
      transfer_number: 'TRF-2026-000001',
      status: 'in_transit',
      origin_branch_id: BRANCH_ID,
      origin_warehouse_id: ORIGIN_WAREHOUSE_ID,
      destination_branch_id: BRANCH_ID,
      destination_warehouse_id: DESTINATION_WAREHOUSE_ID,
      reason: 'Reabastecimiento',
      created_by: 'owner-user',
      created_at: '2026-10-10T12:00:00.000Z',
      updated_at: '2026-10-10T12:05:00.000Z',
    },
    {
      id: FOREIGN_TRANSFER_ID,
      tenant_id: TENANT_ID,
      transfer_number: 'TRF-2026-000002',
      status: 'draft',
      origin_branch_id: OTHER_BRANCH_ID,
      origin_warehouse_id: FOREIGN_WAREHOUSE_ID,
      destination_branch_id: OTHER_BRANCH_ID,
      destination_warehouse_id: FOREIGN_WAREHOUSE_ID,
      reason: 'No debe verse',
      created_by: 'owner-user',
      created_at: '2026-10-10T12:10:00.000Z',
      updated_at: '2026-10-10T12:10:00.000Z',
    },
  ];
  fake.tables.stock_transfer_items = [{
    id: TRANSFER_ITEM_ID,
    tenant_id: TENANT_ID,
    transfer_id: TRANSFER_ID,
    product_id: PRODUCT_ID,
    requested_quantity: 40,
    shipped_quantity: 40,
    received_quantity: 15,
    unit_cost: 18.5,
  }];
  fake.tables.profiles = [
    { id: 'profile-owner-user', auth_user_id: 'owner-user', email: 'owner@example.test', display_name: 'Dueña' },
    { id: 'profile-staff-user', auth_user_id: 'staff-user', email: 'bodega@example.test', display_name: 'Bodega' },
  ];
  fake.failTables.clear();
  fake.requests.length = 0;
  fake.rpcCalls.length = 0;
  auditCalls.length = 0;
  fake.rpc = {
    append_audit_log: (body) => { auditCalls.push(body as Record<string, unknown>); return { body: 'audit-entry' }; },
    create_stock_transfer: () => ({ body: { transferId: TRANSFER_ID, transferNumber: 'TRF-2026-000003', status: 'draft', originWarehouseId: ORIGIN_WAREHOUSE_ID, destinationWarehouseId: DESTINATION_WAREHOUSE_ID, items: [{ productId: PRODUCT_ID, quantity: 40, unitCost: 18.5 }] } }),
    approve_stock_transfer: () => ({ body: { transferId: TRANSFER_ID, transferNumber: 'TRF-2026-000001', status: 'approved', reservedQuantity: 40 } }),
    dispatch_stock_transfer: () => ({ body: { transferId: TRANSFER_ID, transferNumber: 'TRF-2026-000001', status: 'in_transit', shippedQuantity: 40 } }),
    receive_stock_transfer: () => ({ body: { transferId: TRANSFER_ID, transferNumber: 'TRF-2026-000001', status: 'in_transit', receivedQuantity: 10, pendingLines: 1 } }),
    cancel_stock_transfer: () => ({ body: { transferId: TRANSFER_ID, transferNumber: 'TRF-2026-000001', status: 'cancelled', previousStatus: 'draft', returnedQuantity: 0, reason: 'Cancelada' } }),
    adjust_inventory: () => ({ body: { previous_quantity: 100, new_quantity: 96, delta: -4, movement_id: 'movement-1' } }),
  };
}

function request(token = OWNER_TOKEN, branchId = 'principal', method: 'GET' | 'POST' = 'GET', body?: Record<string, unknown>, search = '') {
  return new NextRequest(`http://localhost/api/inventory/warehouses${search}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': 'transfer-shop',
      'x-branch-id': branchId,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function rpcCall(name: string) {
  return fake.rpcCalls.filter((call) => call.name === name);
}

before(async () => {
  fake = await startFakeSupabase();
  seedMember(fake, { slug: 'transfer-shop', tenantUuid: TENANT_ID, role: 'owner', token: OWNER_TOKEN, userId: 'owner-user' });
  seedMember(fake, { slug: 'transfer-shop', tenantUuid: TENANT_ID, role: 'bodega', token: STAFF_TOKEN, userId: 'staff-user' });
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  process.env.RATE_LIMIT_SHARED = 'false';
  route = await import('@/app/api/inventory/warehouses/route');
});

after(async () => {
  await fake.close();
});

beforeEach(resetData);

test('los códigos del SQL de transferencias se traducen a 400, 404 y 409', () => {
  assert.equal(transferErrorResponse(new Error('WAREHOUSE_REQUIRED'))?.status, 400);
  assert.equal(transferErrorResponse(new Error('TRANSFER_SAME_WAREHOUSE'))?.status, 400);
  assert.equal(transferErrorResponse(new Error('INVALID_TRANSFER_QUANTITY'))?.status, 400);
  assert.equal(transferErrorResponse(new Error('SERVICE_NOT_TRANSFERABLE:' + PRODUCT_ID))?.status, 400);
  assert.equal(transferErrorResponse(new Error('TRANSFER_NOT_FOUND'))?.status, 404);
  assert.equal(transferErrorResponse(new Error('ORIGIN_WAREHOUSE_NOT_FOUND'))?.status, 404);
  assert.equal(transferErrorResponse(new Error('PRODUCT_NOT_FOUND:' + PRODUCT_ID))?.status, 404);
  assert.equal(transferErrorResponse(new Error('INVALID_TRANSFER_STATUS:approved'))?.status, 409);
  assert.equal(transferErrorResponse(new Error('INSUFFICIENT_WAREHOUSE_STOCK:' + PRODUCT_ID))?.status, 409);
  assert.equal(transferErrorResponse(new Error('RECEIPT_EXCEEDS_PENDING:' + PRODUCT_ID))?.status, 409);
  assert.equal(transferErrorResponse(new Error('INSUFFICIENT_STOCK:RESERVED'))?.status, 409);
  const body = transferErrorResponse(new Error('RECEIPT_EXCEEDS_PENDING:' + PRODUCT_ID))?.body;
  assert.equal(body?.code, 'RECEIPT_EXCEEDS_PENDING:' + PRODUCT_ID, 'el código original viaja en la respuesta');
  assert.equal(transferErrorResponse(new Error('FORBIDDEN')), null, 'los códigos ajenos los resuelve tenantErrorResponse');
  assert.equal(transferErrorResponse(new Error('')), null);
});

test('las líneas de una transferencia se normalizan antes de llamar al SQL', () => {
  assert.deepEqual(parseTransferItems({ items: [{ productId: PRODUCT_ID, quantity: 40, unitCost: 18.5 }] }), [{ productId: PRODUCT_ID, quantity: 40, unitCost: 18.5 }]);
  assert.deepEqual(parseTransferItems({ productId: PRODUCT_ID, quantity: 3 }), [{ productId: PRODUCT_ID, quantity: 3 }], 'el atajo de una línea no inventa costo: el SQL usa el del producto');
  assert.deepEqual(parseTransferItems({ items: [{ productId: PRODUCT_ID, quantity: 3, unitCost: -9 }] }), [{ productId: PRODUCT_ID, quantity: 3 }]);
  assert.throws(() => parseTransferItems({}), /TRANSFER_ITEMS_REQUIRED/);
  assert.throws(() => parseTransferItems({ items: [{ productId: '', quantity: 3 }] }), /INVALID_TRANSFER_ITEM/);
  assert.throws(() => parseTransferItems({ items: [{ productId: PRODUCT_ID, quantity: 2.5 }] }), /INVALID_TRANSFER_QUANTITY/);
  assert.throws(() => parseTransferItems({ items: [{ productId: PRODUCT_ID, quantity: 1 }, { productId: PRODUCT_ID, quantity: 2 }] }), /TRANSFER_DUPLICATE_PRODUCT/);
  assert.throws(() => parseTransferItems({ items: Array.from({ length: 51 }, (_, index) => ({ productId: `p-${index}`, quantity: 1 })) }), /TRANSFER_TOO_MANY_ITEMS/);
});

test('la recepción parcial admite transferItemId o productId con quantity o receivedQuantity', () => {
  assert.deepEqual(parseReceiptItems({ items: [{ transferItemId: TRANSFER_ITEM_ID, quantity: 10 }] }), [{ transferItemId: TRANSFER_ITEM_ID, quantity: 10 }]);
  assert.deepEqual(parseReceiptItems({ items: [{ productId: PRODUCT_ID, receivedQuantity: 7 }] }), [{ productId: PRODUCT_ID, quantity: 7 }]);
  assert.deepEqual(parseReceiptItems({ transferItemId: TRANSFER_ITEM_ID, receivedQuantity: 4 }), [{ transferItemId: TRANSFER_ITEM_ID, quantity: 4 }]);
  assert.throws(() => parseReceiptItems({}), /TRANSFER_ITEMS_REQUIRED/);
  assert.throws(() => parseReceiptItems({ items: [{ quantity: 4 }] }), /INVALID_TRANSFER_ITEM/);
  assert.throws(() => parseReceiptItems({ items: [{ transferItemId: TRANSFER_ITEM_ID, quantity: 0 }] }), /INVALID_TRANSFER_QUANTITY/);
  assert.throws(() => parseReceiptItems({ items: [{ transferItemId: TRANSFER_ITEM_ID, quantity: 2 }, { transferItemId: TRANSFER_ITEM_ID, quantity: 3 }] }), /TRANSFER_DUPLICATE_PRODUCT/);
});

test('los totales de la transferencia salen de sus líneas', () => {
  assert.deepEqual(transferTotals([
    { productId: 'p1', requested: 40, shipped: 40, received: 15 },
    { productId: 'p2', requested: 10, shipped: 10, received: 10 },
  ]), { requested: 50, shipped: 50, received: 25, pending: 25 });
  assert.deepEqual(transferTotals([]), { requested: 0, shipped: 0, received: 0, pending: 0 });
});

test('GET: entrega existencias canónicas y las transferencias reales con sus líneas', async () => {
  const response = await route.GET(request(OWNER_TOKEN, 'principal', 'GET', undefined, `?warehouseId=${ORIGIN_WAREHOUSE_ID}`));
  assert.equal(response.status, 200);
  const body = await response.json() as { warehouses: FakeRow[]; stocks: FakeRow[]; transfers: Array<Record<string, any>> };

  assert.equal(body.warehouses.length, 2, 'sólo los almacenes de la sucursal activa');
  assert.deepEqual(body.stocks[0], {
    id: '88888888-8888-4888-8888-888888888881',
    warehouseId: ORIGIN_WAREHOUSE_ID,
    productId: PRODUCT_ID,
    quantity: 100,
    reservedQuantity: 20,
    inTransitQuantity: 5,
    available: 80,
    averageCost: 18.5,
    reorderPoint: 10,
    updatedAt: '2026-10-10T12:00:00.000Z',
  });

  assert.equal(body.transfers.length, 1, 'la transferencia de otra sucursal no se expone');
  const transfer = body.transfers[0];
  assert.equal(transfer.transferNumber, 'TRF-2026-000001');
  assert.equal(transfer.status, 'in_transit');
  assert.equal(transfer.originWarehouseId, ORIGIN_WAREHOUSE_ID);
  assert.equal(transfer.destinationWarehouseId, DESTINATION_WAREHOUSE_ID);
  assert.deepEqual({ requested: transfer.requested, shipped: transfer.shipped, received: transfer.received, pending: transfer.pending }, { requested: 40, shipped: 40, received: 15, pending: 25 });
  assert.deepEqual(transfer.items[0], { transferItemId: TRANSFER_ITEM_ID, productId: PRODUCT_ID, productName: 'Frijoles 1lb', productSku: 'FRI-1', requested: 40, shipped: 40, received: 15, pending: 25, unitCost: 18.5 });
});

test('GET: rechaza un almacén que no pertenece a la sucursal del usuario', async () => {
  const response = await route.GET(new NextRequest(`http://localhost/api/inventory/warehouses?warehouseId=${FOREIGN_WAREHOUSE_ID}`, {
    headers: { Authorization: `Bearer ${OWNER_TOKEN}`, 'x-tenant-id': 'transfer-shop', 'x-branch-id': 'principal' },
  }));
  assert.equal(response.status, 403);
});

test('GET: la sucursal ajena no ve la transferencia de la sucursal principal', async () => {
  const response = await route.GET(request(OWNER_TOKEN, 'otra', 'GET'));
  assert.equal(response.status, 200);
  const body = await response.json() as { transfers: Array<{ transferNumber: string }> };
  assert.deepEqual(body.transfers.map((item) => item.transferNumber), ['TRF-2026-000002']);
});

test('POST create-transfer: crea el borrador con la RPC y deja auditoría', async () => {
  const response = await route.POST(request(OWNER_TOKEN, 'principal', 'POST', {
    action: 'create-transfer',
    fromWarehouseId: ORIGIN_WAREHOUSE_ID,
    toWarehouseId: DESTINATION_WAREHOUSE_ID,
    items: [{ productId: PRODUCT_ID, quantity: 40 }],
    reason: 'Reabastecimiento',
  }));
  assert.equal(response.status, 201);
  const body = await response.json() as FakeRow;
  assert.equal(body.ok, true);
  assert.equal(body.transferNumber, 'TRF-2026-000003');

  const calls = rpcCall('create_stock_transfer');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, {
    target_tenant_id: TENANT_ID,
    target_origin_warehouse_id: ORIGIN_WAREHOUSE_ID,
    target_destination_warehouse_id: DESTINATION_WAREHOUSE_ID,
    target_user_id: 'owner-user',
    target_items: [{ productId: PRODUCT_ID, quantity: 40 }],
    target_reason: 'Reabastecimiento',
  });
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].target_action, 'inventory.transfer_created');
  assert.equal(auditCalls[0].target_resource_type, 'stock_transfer');
});

test('POST create-transfer: acepta el atajo de una sola línea y el id heredado del almacén', async () => {
  const response = await route.POST(request(OWNER_TOKEN, 'principal', 'POST', {
    action: 'create-transfer',
    fromWarehouseId: 'bodega-a',
    toWarehouseId: 'bodega-b',
    productId: PRODUCT_ID,
    quantity: 12,
  }));
  assert.equal(response.status, 201);
  const calls = rpcCall('create_stock_transfer');
  assert.equal(calls.length, 1);
  assert.deepEqual((calls[0].body as Record<string, unknown>).target_items, [{ productId: PRODUCT_ID, quantity: 12 }]);
  assert.equal((calls[0].body as Record<string, unknown>).target_origin_warehouse_id, ORIGIN_WAREHOUSE_ID);
  assert.equal((calls[0].body as Record<string, unknown>).target_destination_warehouse_id, DESTINATION_WAREHOUSE_ID);
});

test('POST create-transfer: valida las líneas antes de tocar la base', async () => {
  const response = await route.POST(request(OWNER_TOKEN, 'principal', 'POST', {
    action: 'create-transfer',
    fromWarehouseId: ORIGIN_WAREHOUSE_ID,
    toWarehouseId: DESTINATION_WAREHOUSE_ID,
  }));
  assert.equal(response.status, 400);
  const body = await response.json() as FakeRow;
  assert.equal(body.code, 'TRANSFER_ITEMS_REQUIRED');
  assert.equal(rpcCall('create_stock_transfer').length, 0, 'no se llama a la RPC con líneas inválidas');
});

test('POST approve-transfer: traduce el 409 del SQL cuando no hay existencia disponible', async () => {
  fake.rpc.approve_stock_transfer = () => sqlError('INSUFFICIENT_WAREHOUSE_STOCK:' + PRODUCT_ID, 409);
  const response = await route.POST(request(OWNER_TOKEN, 'principal', 'POST', { action: 'approve-transfer', transferId: TRANSFER_ID }));
  assert.equal(response.status, 409);
  const body = await response.json() as FakeRow;
  assert.equal(body.code, 'INSUFFICIENT_WAREHOUSE_STOCK:' + PRODUCT_ID);
  assert.match(String(body.error), /existencia disponible/i);
  assert.equal(auditCalls.length, 0, 'una transferencia rechazada no se audita como exitosa');
});

test('POST create-transfer: no deja apuntar a un almacén de otra sucursal', async () => {
  const response = await route.POST(request(STAFF_TOKEN, 'principal', 'POST', {
    action: 'create-transfer',
    fromWarehouseId: ORIGIN_WAREHOUSE_ID,
    toWarehouseId: FOREIGN_WAREHOUSE_ID,
    items: [{ productId: PRODUCT_ID, quantity: 5 }],
  }));
  assert.equal(response.status, 403);
  const body = await response.json() as FakeRow;
  assert.equal(body.code, 'BRANCH_OUT_OF_SCOPE');
  assert.equal(rpcCall('create_stock_transfer').length, 0);
});

test('POST create-transfer: exige los dos almacenes', async () => {
  const response = await route.POST(request(OWNER_TOKEN, 'principal', 'POST', {
    action: 'create-transfer',
    fromWarehouseId: ORIGIN_WAREHOUSE_ID,
    items: [{ productId: PRODUCT_ID, quantity: 5 }],
  }));
  assert.equal(response.status, 400);
  assert.equal((await response.json() as FakeRow).code, 'WAREHOUSE_REQUIRED');
});

test('POST: el ciclo approve, dispatch, receive y cancel usa su propia RPC', async () => {
  const approve = await route.POST(request(OWNER_TOKEN, 'principal', 'POST', { action: 'approve-transfer', transferId: TRANSFER_ID }));
  assert.equal(approve.status, 200);
  assert.equal((await approve.json() as FakeRow).status, 'approved');

  const dispatch = await route.POST(request(OWNER_TOKEN, 'principal', 'POST', { action: 'dispatch-transfer', transferId: TRANSFER_ID }));
  assert.equal(dispatch.status, 200);
  assert.equal((await dispatch.json() as FakeRow).status, 'in_transit');

  const receive = await route.POST(request(OWNER_TOKEN, 'principal', 'POST', { action: 'receive-transfer', transferId: TRANSFER_ID, items: [{ transferItemId: TRANSFER_ITEM_ID, quantity: 10 }] }));
  assert.equal(receive.status, 200);
  assert.equal((await receive.json() as FakeRow).status, 'in_transit');

  const cancel = await route.POST(request(OWNER_TOKEN, 'principal', 'POST', { action: 'cancel-transfer', transferId: TRANSFER_ID, reason: 'Cliente canceló' }));
  assert.equal(cancel.status, 200);
  assert.equal((await cancel.json() as FakeRow).status, 'cancelled');

  assert.deepEqual(rpcCall('approve_stock_transfer')[0].body, { target_tenant_id: TENANT_ID, target_transfer_id: TRANSFER_ID, target_user_id: 'owner-user' });
  assert.deepEqual(rpcCall('dispatch_stock_transfer')[0].body, { target_tenant_id: TENANT_ID, target_transfer_id: TRANSFER_ID, target_user_id: 'owner-user' });
  assert.deepEqual(rpcCall('receive_stock_transfer')[0].body, { target_tenant_id: TENANT_ID, target_transfer_id: TRANSFER_ID, target_user_id: 'owner-user', target_items: [{ transferItemId: TRANSFER_ITEM_ID, quantity: 10 }] });
  assert.deepEqual(rpcCall('cancel_stock_transfer')[0].body, { target_tenant_id: TENANT_ID, target_transfer_id: TRANSFER_ID, target_user_id: 'owner-user', target_reason: 'Cliente canceló' });
  assert.deepEqual(auditCalls.map((call) => call.target_action), ['inventory.transfer_approved', 'inventory.transfer_dispatched', 'inventory.transfer_received', 'inventory.transfer_cancelled']);
});

test('POST receive-transfer: rechaza recibir más de lo que sigue en tránsito', async () => {
  fake.rpc.receive_stock_transfer = () => sqlError('RECEIPT_EXCEEDS_PENDING:' + PRODUCT_ID, 409);
  const response = await route.POST(request(OWNER_TOKEN, 'principal', 'POST', { action: 'receive-transfer', transferId: TRANSFER_ID, items: [{ transferItemId: TRANSFER_ITEM_ID, quantity: 900 }] }));
  assert.equal(response.status, 409);
  assert.equal((await response.json() as FakeRow).code, 'RECEIPT_EXCEEDS_PENDING:' + PRODUCT_ID);
});

test('POST receive-transfer: exige líneas para recibir', async () => {
  const response = await route.POST(request(OWNER_TOKEN, 'principal', 'POST', { action: 'receive-transfer', transferId: TRANSFER_ID }));
  assert.equal(response.status, 400);
  assert.equal((await response.json() as FakeRow).code, 'TRANSFER_ITEMS_REQUIRED');
  assert.equal(rpcCall('receive_stock_transfer').length, 0);
});

test('POST: una transferencia inexistente responde 404 y una sin id responde 400', async () => {
  const missing = await route.POST(request(OWNER_TOKEN, 'principal', 'POST', { action: 'approve-transfer', transferId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }));
  assert.equal(missing.status, 404);
  assert.equal((await missing.json() as FakeRow).code, 'TRANSFER_NOT_FOUND');

  const noId = await route.POST(request(OWNER_TOKEN, 'principal', 'POST', { action: 'dispatch-transfer' }));
  assert.equal(noId.status, 400);
  assert.equal((await noId.json() as FakeRow).code, 'TRANSFER_REQUIRED');
  assert.equal(rpcCall('dispatch_stock_transfer').length, 0);
});

test('POST: una transferencia de otra sucursal no se puede operar', async () => {
  const response = await route.POST(request(STAFF_TOKEN, 'principal', 'POST', { action: 'approve-transfer', transferId: FOREIGN_TRANSFER_ID }));
  assert.equal(response.status, 403);
  assert.equal((await response.json() as FakeRow).code, 'BRANCH_OUT_OF_SCOPE');
  assert.equal(rpcCall('approve_stock_transfer').length, 0);
});

test('POST: un estado inválido se reporta como conflicto con el código del SQL', async () => {
  fake.rpc.dispatch_stock_transfer = () => sqlError('INVALID_TRANSFER_STATUS:draft', 409);
  const response = await route.POST(request(OWNER_TOKEN, 'principal', 'POST', { action: 'dispatch-transfer', transferId: TRANSFER_ID }));
  assert.equal(response.status, 409);
  assert.equal((await response.json() as FakeRow).code, 'INVALID_TRANSFER_STATUS:draft');
});

test('POST: el conteo físico sigue usando adjust_inventory y su aprobación exige jefatura', async () => {
  const count = await route.POST(request(OWNER_TOKEN, 'principal', 'POST', { action: 'count', warehouseId: ORIGIN_WAREHOUSE_ID, productId: PRODUCT_ID, countedQuantity: 96, reason: 'Conteo físico' }));
  assert.equal(count.status, 201);
  const calls = rpcCall('adjust_inventory');
  assert.equal(calls.length, 1);
  assert.equal((calls[0].body as Record<string, unknown>).target_movement_type, 'set');

  const forbidden = await route.POST(request(STAFF_TOKEN, 'principal', 'POST', { action: 'approve-count', warehouseId: ORIGIN_WAREHOUSE_ID, productId: PRODUCT_ID, countedQuantity: 96 }));
  assert.equal(forbidden.status, 403);
});

test('POST: una acción desconocida responde 400', async () => {
  const response = await route.POST(request(OWNER_TOKEN, 'principal', 'POST', { action: 'moon-transfer' }));
  assert.equal(response.status, 400);
});
