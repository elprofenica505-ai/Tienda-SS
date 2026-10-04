import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { NextRequest } from 'next/server';
import { seedMember, startFakeSupabase, type FakeRow, type FakeSupabase } from './helpers/fake-supabase';

type RouteModule = typeof import('@/app/api/cash-sessions/movements/route');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const REGISTER_ID = '44444444-4444-4444-8444-444444444444';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';
const MOVEMENT_ID = '66666666-6666-4666-8666-666666666666';
const SALE_ID = '77777777-7777-4777-8777-777777777777';
const CUSTOMER_ID = '88888888-8888-4888-8888-888888888888';
const OWNER_TOKEN = 'cash-history-owner-token';

let fake: FakeSupabase;
let route: RouteModule;

function request(branchId = BRANCH_ID) {
  return new NextRequest('http://localhost/api/cash-sessions/movements', {
    headers: {
      Authorization: `Bearer ${OWNER_TOKEN}`,
      'x-tenant-id': 'cash-history-shop',
      'x-branch-id': branchId,
    },
  });
}

function resetData() {
  fake.tables.tenants = [{
    id: TENANT_ID,
    legacy_firestore_id: 'cash-history-shop',
    name: 'Tienda de prueba',
    timezone: 'America/Managua',
    currency: 'NIO',
    status: 'active',
    platform_status: 'active',
    subscription_status: 'active',
  }];
  fake.tables.branches = [
    { id: BRANCH_ID, tenant_id: TENANT_ID, legacy_firestore_id: 'principal', name: 'Principal', active: true },
    { id: OTHER_BRANCH_ID, tenant_id: TENANT_ID, legacy_firestore_id: 'otra', name: 'Otra sucursal', active: true },
  ];
  fake.tables.cash_registers = [{ id: REGISTER_ID, tenant_id: TENANT_ID, branch_id: BRANCH_ID, name: 'Caja 1', code: 'C1', active: true }];
  fake.tables.cash_movements = [{
    id: MOVEMENT_ID,
    tenant_id: TENANT_ID,
    cash_session_id: SESSION_ID,
    movement_type: 'sale',
    amount: 125,
    reference_type: 'sale',
    reference_id: SALE_ID,
    performed_by: 'cashier-user',
    metadata: { paymentMethod: 'cash' },
    created_at: '2026-10-03T16:00:00.000Z',
    cash_sessions: { branch_id: BRANCH_ID, cash_register_id: REGISTER_ID, status: 'closed' },
  }, {
    id: '99999999-9999-4999-8999-999999999999',
    tenant_id: TENANT_ID,
    cash_session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    movement_type: 'deposit',
    amount: 50,
    reference_type: 'manual',
    reference_id: null,
    performed_by: 'cashier-user',
    metadata: { description: 'No debe aparecer en la sucursal solicitada' },
    created_at: '2026-10-03T15:00:00.000Z',
    cash_sessions: { branch_id: OTHER_BRANCH_ID, cash_register_id: REGISTER_ID, status: 'open' },
  }];
  fake.tables.sales = [{
    id: SALE_ID,
    tenant_id: TENANT_ID,
    branch_id: BRANCH_ID,
    invoice_number: 'F-101',
    total: 125,
    status: 'completed',
    customer_id: CUSTOMER_ID,
    sold_by: 'cashier-user',
    metadata: { saleNumber: 'F-101' },
    created_at: '2026-10-03T15:59:00.000Z',
    sale_items: [{
      product_id: 'product-1', quantity: 2, unit_price: 62.5, line_total: 125,
      products: { name: 'Café', sku: 'CAF-1' },
    }],
    sale_payments: [{ payment_method: 'cash', amount: 125, reference: null }],
  }];
  fake.tables.customers = [{ id: CUSTOMER_ID, tenant_id: TENANT_ID, name: 'Ana Pérez', document_id: '001-123' }];
  fake.tables.profiles = [
    { id: 'profile-owner-user', auth_user_id: 'owner-user', email: 'owner@example.test', display_name: 'Dueña' },
    { id: 'profile-cashier-user', auth_user_id: 'cashier-user', email: 'cashier@example.test', display_name: 'Cajera' },
  ];
  fake.failTables.clear();
  fake.requests.length = 0;
}

before(async () => {
  fake = await startFakeSupabase();
  seedMember(fake, { slug: 'cash-history-shop', tenantUuid: TENANT_ID, role: 'owner', token: OWNER_TOKEN, userId: 'owner-user' });
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  process.env.RATE_LIMIT_SHARED = 'false';
  route = await import('@/app/api/cash-sessions/movements/route');
});

after(async () => {
  await fake.close();
});

beforeEach(resetData);

test('GET: entrega el detalle financiero de caja solo para la sucursal seleccionada', async () => {
  const response = await route.GET(request());
  assert.equal(response.status, 200);
  const body = await response.json() as { ok: boolean; branchId: string; movements: Array<Record<string, any>>; nextCursor: string | null };

  assert.equal(body.ok, true);
  assert.equal(body.branchId, BRANCH_ID);
  assert.equal(body.movements.length, 1);
  assert.equal(body.nextCursor, null);
  assert.equal(body.movements[0].movementLabel, 'Cobro de venta');
  assert.equal(body.movements[0].paymentMethod, 'cash');
  assert.equal(body.movements[0].userName, 'Cajera');
  assert.equal(body.movements[0].branchName, 'Principal');
  assert.equal(body.movements[0].registerName, 'Caja 1');
  assert.equal(body.movements[0].sale.saleNumber, 'F-101');
  assert.equal(body.movements[0].sale.customerName, 'Ana Pérez');
  assert.deepEqual(body.movements[0].items, [{
    productId: 'product-1', name: 'Café', sku: 'CAF-1', quantity: 2, unitPrice: 62.5, total: 125,
  }]);
  const movementQuery = fake.requests.find((item) => item.table === 'cash_movements');
  assert.ok(movementQuery);
  assert.match(movementQuery.search, new RegExp(`tenant_id=eq\\.${TENANT_ID}`));
  assert.match(movementQuery.search, new RegExp(`cash_sessions.branch_id=eq\\.${BRANCH_ID}`));
});

test('GET: no permite consultar una sucursal de otra empresa', async () => {
  const response = await route.GET(request('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
  assert.equal(response.status, 404);
  const body = await response.json() as FakeRow;
  assert.equal(body.code, 'BRANCH_NOT_FOUND');
  assert.equal(fake.requests.some((item) => item.table === 'cash_movements'), false);
});
