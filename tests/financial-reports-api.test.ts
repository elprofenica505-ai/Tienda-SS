import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { NextRequest } from 'next/server';
import { localDateKey } from '@/lib/financial-reports';
import { seedMember, startFakeSupabase, type FakeRow, type FakeSupabase } from './helpers/fake-supabase';

type ReportsRoute = typeof import('@/app/api/reports/route');
type ExportRoute = typeof import('@/app/api/reports/export/route');

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const BRANCH_A = '33333333-3333-4333-8333-333333333333';
const BRANCH_B = '44444444-4444-4444-8444-444444444444';
const SALE_A = '55555555-5555-4555-8555-555555555555';
const SALE_B = '66666666-6666-4666-8666-666666666666';
const RECEIVABLE_A = '77777777-7777-4777-8777-777777777777';
const PAYMENT_A = '88888888-8888-4888-8888-888888888888';
const RECEIVABLE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PAYMENT_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PRODUCT_A = '99999999-9999-4999-8999-999999999999';
const WAREHOUSE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER_A = 'financial-owner-a';
const OWNER_B = 'financial-owner-b';
const SUPERVISOR = 'financial-supervisor';
const TIME_ZONE = 'America/Managua';

let fake: FakeSupabase;
let reportsRoute: ReportsRoute;
let exportRoute: ExportRoute;
let recent: string;
let reportDate: string;

function request(path: string, options: { token?: string; tenant?: string; branch?: string } = {}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.token || OWNER_A}`,
    'x-tenant-id': options.tenant || 'tienda-a',
  };
  if (options.branch) headers['x-branch-id'] = options.branch;
  return new NextRequest(`http://localhost${path}`, { method: 'GET', headers });
}

function saleRow(input: { id: string; tenantId: string; branchId: string; total: number; createdAt: string; invoice: string; withItem?: boolean }): FakeRow {
  const withItem = input.withItem !== false;
  return {
    id: input.id,
    tenant_id: input.tenantId,
    branch_id: input.branchId,
    invoice_number: input.invoice,
    status: 'completed',
    total: input.total,
    created_at: input.createdAt,
    metadata: {},
    sale_items: withItem ? [{ id: `line-${input.id}`, product_id: PRODUCT_A, warehouse_id: WAREHOUSE_A, quantity: 2, unit_price: input.total / 2, line_total: input.total, products: { name: 'Café', item_type: 'product' } }] : [],
    sale_payments: [{ id: `sale-payment-${input.id}`, payment_method: 'cash', amount: input.total, created_at: input.createdAt }],
  };
}

function resetData() {
  recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  reportDate = localDateKey(recent, TIME_ZONE);
  fake.tables.tenants = [
    { id: TENANT_A, legacy_firestore_id: 'tienda-a', name: 'Tienda A', timezone: TIME_ZONE, currency: 'NIO', plan: 'growth', status: 'active', platform_status: 'active', subscription_status: 'active' },
    { id: TENANT_B, legacy_firestore_id: 'tienda-b', name: 'Tienda B', timezone: TIME_ZONE, currency: 'NIO', plan: 'growth', status: 'active', platform_status: 'active', subscription_status: 'active' },
  ];
  fake.tables.branches = [
    { id: BRANCH_A, tenant_id: TENANT_A, legacy_firestore_id: 'branch-a', active: true, name: 'Sucursal Centro' },
    { id: BRANCH_B, tenant_id: TENANT_A, legacy_firestore_id: 'branch-b', active: true, name: 'Sucursal Norte' },
    { id: BRANCH_B, tenant_id: TENANT_B, legacy_firestore_id: 'branch-b-tenant-b', active: true, name: 'Sucursal Ajena' },
  ];
  fake.tables.sales = [
    saleRow({ id: SALE_A, tenantId: TENANT_A, branchId: BRANCH_A, total: 100, createdAt: recent, invoice: 'F-A-001' }),
    saleRow({ id: SALE_B, tenantId: TENANT_A, branchId: BRANCH_B, total: 25, createdAt: recent, invoice: 'F-A-002', withItem: false }),
    saleRow({ id: 'sale-tenant-b', tenantId: TENANT_B, branchId: BRANCH_B, total: 900, createdAt: recent, invoice: 'F-B-001', withItem: false }),
  ];
  fake.tables.inventory_movements = [{
    id: 'movement-sale-a', tenant_id: TENANT_A, reference_type: 'sale', reference_id: SALE_A, movement_type: 'sale',
    product_id: PRODUCT_A, warehouse_id: WAREHOUSE_A, quantity: -2, unit_cost: 30.5,
  }];
  fake.tables.expenses = [{ id: 'expense-a', tenant_id: TENANT_A, branch_id: BRANCH_A, description: 'Renta', amount: 10, category: 'Local', payment_method: 'transfer', created_at: recent }];
  const relatedSaleA = { id: SALE_A, branch_id: BRANCH_A, invoice_number: 'F-A-001', created_at: recent };
  const relatedSaleB = { id: SALE_B, branch_id: BRANCH_B, invoice_number: 'F-A-002', created_at: recent };
  fake.tables.receivables = [
    {
      id: RECEIVABLE_A, tenant_id: TENANT_A, sale_id: SALE_A, original_amount: 100, outstanding_amount: 70, status: 'partial', created_at: recent,
      sales: relatedSaleA, customers: { name: 'Ana Pérez' },
    },
    {
      id: RECEIVABLE_B, tenant_id: TENANT_A, sale_id: SALE_B, original_amount: 50, outstanding_amount: 40, status: 'open', created_at: recent,
      sales: relatedSaleB, customers: { name: 'Cliente sucursal norte' },
    },
  ];
  fake.tables.receivable_payments = [
    { id: PAYMENT_A, tenant_id: TENANT_A, receivable_id: null, customer_id: 'customer-a', receipt_number: 'R-001', amount: 30, payment_method: 'cash', created_at: recent },
    { id: PAYMENT_B, tenant_id: TENANT_A, receivable_id: null, customer_id: 'customer-b', receipt_number: 'R-002', amount: 10, payment_method: 'transfer', created_at: recent },
  ];
  fake.tables.receivable_payment_allocations = [
    { id: 'allocation-a', tenant_id: TENANT_A, payment_id: PAYMENT_A, receivable_id: RECEIVABLE_A, amount: 30 },
    { id: 'allocation-b', tenant_id: TENANT_A, payment_id: PAYMENT_B, receivable_id: RECEIVABLE_B, amount: 10 },
  ];
  fake.tables.sale_returns = [];
  fake.tables.sale_return_items = [];
  fake.tables.entitlement_usage = [];
  fake.tables.financial_report_export_daily_usage = [];
  fake.tables.tenant_settings = [];
  fake.failTables.clear();
  fake.requests.length = 0;
  fake.rpcCalls.length = 0;
  fake.rpc = {
    consume_financial_report_export: (payload) => {
      const input = payload as { target_tenant_id: string; target_user_id: string };
      const tenant = fake.tables.tenants.find((item) => item.id === input.target_tenant_id);
      const timezone = String(tenant?.timezone || TIME_ZONE);
      const date = localDateKey(new Date(), timezone);
      const month = date.slice(0, 7);
      const dailyRow = fake.tables.financial_report_export_daily_usage.find((item) => item.tenant_id === input.target_tenant_id && item.local_date === date);
      const dailyUsed = Number(dailyRow?.export_count || 0);
      if (dailyUsed >= 3) {
        return { body: { allowed: false, code: 'DAILY_EXPORT_LIMIT', used: dailyUsed, limit: 3, resetAt: new Date(Date.now() + 60_000).toISOString(), timezone } };
      }
      const monthlyRow = fake.tables.entitlement_usage.find((item) => item.tenant_id === input.target_tenant_id && item.month === month);
      const monthlyUsed = Number(monthlyRow?.monthly_exports || 0);
      const plan = String(tenant?.plan || 'starter');
      const monthlyLimit = plan === 'growth' ? 100 : plan === 'scale' ? Number.MAX_SAFE_INTEGER : 10;
      if (monthlyUsed >= monthlyLimit) {
        return { body: { allowed: false, code: 'MONTHLY_EXPORT_LIMIT', used: monthlyUsed, limit: monthlyLimit, month, timezone } };
      }
      if (monthlyRow) monthlyRow.monthly_exports = monthlyUsed + 1;
      else fake.tables.entitlement_usage.push({ tenant_id: input.target_tenant_id, month, monthly_exports: 1 });
      if (dailyRow) dailyRow.export_count = dailyUsed + 1;
      else fake.tables.financial_report_export_daily_usage.push({ tenant_id: input.target_tenant_id, local_date: date, export_count: 1 });
      return { body: { allowed: true, used: monthlyUsed + 1, limit: monthlyLimit, dailyUsed: dailyUsed + 1, dailyLimit: 3, month, localDate: date, timezone } };
    },
  };
}

before(async () => {
  fake = await startFakeSupabase();
  seedMember(fake, { slug: 'tienda-a', tenantUuid: TENANT_A, role: 'owner', token: OWNER_A, userId: 'financial-owner-a-user' });
  seedMember(fake, { slug: 'tienda-b', tenantUuid: TENANT_B, role: 'owner', token: OWNER_B, userId: 'financial-owner-b-user' });
  seedMember(fake, { slug: 'tienda-a', tenantUuid: TENANT_A, role: 'supervisor_sucursal', token: SUPERVISOR, userId: 'financial-supervisor-user' });
  fake.tables.member_branches = [{
    id: 'assignment-a', tenant_id: TENANT_A, member_id: `member-financial-supervisor-user-${TENANT_A}`, branch_id: BRANCH_A,
    branches: { legacy_firestore_id: 'branch-a' },
  }];
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  process.env.RATE_LIMIT_SHARED = 'false';
  reportsRoute = await import('@/app/api/reports/route');
  exportRoute = await import('@/app/api/reports/export/route');
});

after(async () => {
  await fake.close();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

beforeEach(resetData);

test('el reporte diario desglosa costo histórico, gasto y cartera ConexiaX', async () => {
  const response = await reportsRoute.GET(request(`/api/reports?date=${reportDate}`, { branch: BRANCH_A }));
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, any>;
  assert.equal(body.day.grossSales, 100);
  assert.equal(body.day.costOfGoodsSold, 61);
  assert.equal(body.day.grossProfit, 39);
  assert.equal(body.day.expenses, 10);
  assert.equal(body.day.netProfit, 29);
  assert.equal(body.day.creditIssued, 100);
  assert.equal(body.day.creditCollected, 30);
  assert.equal(body.details.sales.length, 1);
  assert.equal(body.details.sales[0].historicalCost, 61);
  assert.equal(body.details.expenses[0].description, 'Renta');
  assert.equal(body.details.credit.issued[0].customerName, 'Ana Pérez');
  assert.equal(body.details.credit.collections[0].amount, 30);
  assert.equal(body.details.credit.currentOpenBalanceForDay, 70);
});

test('los calendarios y filtros horarios producen resúmenes y detalles de una fecha exacta', async () => {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(recent));
  const params = new URLSearchParams({ fromDate: reportDate, toDate: reportDate, fromTime: time, toTime: time });
  const summaryResponse = await reportsRoute.GET(request(`/api/reports?${params.toString()}`));
  assert.equal(summaryResponse.status, 200);
  const summary = await summaryResponse.json() as Record<string, any>;
  assert.equal(summary.period.days, 1);
  assert.equal(summary.period.from, reportDate);
  assert.equal(summary.period.to, reportDate);
  assert.equal(summary.period.fromTime, time);
  assert.equal(summary.period.toTime, time);
  assert.equal(summary.summary.sales, 125);
  assert.equal(summary.hourly.length, 1);

  const detailResponse = await reportsRoute.GET(request(`/api/reports?date=${reportDate}&fromTime=${time}&toTime=${time}`, { branch: BRANCH_A }));
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json() as Record<string, any>;
  assert.equal(detail.day.grossSales, 100);
  assert.equal(detail.details.sales.length, 1);
  assert.equal(detail.details.expenses.length, 1);
  assert.equal(detail.hourly.length, 1);

  const invalidTime = await reportsRoute.GET(request('/api/reports?days=7&fromTime=18:00&toTime=09:00'));
  assert.equal(invalidTime.status, 400);
});

test('el resumen limita ventas y costos a la sucursal seleccionada', async () => {
  const response = await reportsRoute.GET(request('/api/reports?days=7', { branch: BRANCH_A }));
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, any>;
  assert.equal(body.summary.sales, 100);
  assert.equal(body.summary.costOfGoodsSold, 61);
  assert.equal(body.summary.creditIssued, 100);
  assert.equal(body.summary.creditCollected, 30);
  assert.equal(body.summary.openCredit, 70);
  const scopedReads = fake.requests.filter((item) => ['sales', 'expenses', 'sale_returns', 'receivables'].includes(item.table));
  assert.ok(scopedReads.length > 0);
  assert.ok(scopedReads.every((read) => {
    const params = new URLSearchParams(read.search);
    return params.get('branch_id')?.includes(BRANCH_A) || params.get('sales.branch_id')?.includes(BRANCH_A);
  }));
});

test('los usuarios de sucursal no pueden consultar otra sucursal ni otra empresa', async () => {
  const allowed = await reportsRoute.GET(request('/api/reports?days=7', { token: SUPERVISOR }));
  assert.equal(allowed.status, 200);
  const allowedBody = await allowed.json() as Record<string, any>;
  assert.equal(allowedBody.summary.sales, 100);

  const forbiddenBranch = await reportsRoute.GET(request('/api/reports?days=7', { token: SUPERVISOR, branch: BRANCH_B }));
  assert.equal(forbiddenBranch.status, 403);

  const otherTenant = await reportsRoute.GET(request('/api/reports?days=7', { token: OWNER_B, tenant: 'tienda-b' }));
  assert.equal(otherTenant.status, 200);
  const otherBody = await otherTenant.json() as Record<string, any>;
  assert.equal(otherBody.summary.sales, 900);
  const reads = fake.requests.filter((item) => item.table === 'sales');
  assert.ok(reads.some((read) => read.search.includes(`tenant_id=eq.${TENANT_B}`)));
});

test('la exportación respeta el permiso reports.export de la empresa', async () => {
  fake.tables.tenant_settings = [{
    id: 'permissions-supervisor', tenant_id: TENANT_A, setting_key: 'permissions',
    value: { supervisor_sucursal: { reports: { view: true, export: false } } },
  }];
  const response = await exportRoute.GET(request('/api/reports/export?days=7&format=csv', { token: SUPERVISOR }));
  assert.equal(response.status, 403);
});

test('CSV y Excel se descargan con la autorización de exportación y plantilla XLSX', async () => {
  const csvResponse = await exportRoute.GET(request('/api/reports/export?days=7&format=csv', { branch: BRANCH_A }));
  assert.equal(csvResponse.status, 200);
  assert.match(csvResponse.headers.get('content-type') || '', /text\/csv/);
  assert.match(await csvResponse.text(), /Ventas netas/);

  const xlsxResponse = await exportRoute.GET(request('/api/reports/export?days=7&format=xlsx', { branch: BRANCH_A }));
  assert.equal(xlsxResponse.status, 200);
  assert.match(xlsxResponse.headers.get('content-type') || '', /spreadsheetml\.sheet/);
  const bytes = new Uint8Array(await xlsxResponse.arrayBuffer());
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.match(xlsxResponse.headers.get('content-disposition') || '', /\.xlsx/);
  assert.equal(fake.tables.entitlement_usage[0].monthly_exports, 2);
  assert.equal(fake.tables.financial_report_export_daily_usage[0].export_count, 2);
  const quotaCalls = fake.rpcCalls.filter((call) => call.name === 'consume_financial_report_export');
  assert.equal(quotaCalls.length, 2);
  assert.equal((quotaCalls[0].body as Record<string, unknown>).target_tenant_id, TENANT_A);
});

test('la exportación respeta la fecha y el horario seleccionados en el calendario', async () => {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(recent));
  const params = new URLSearchParams({ format: 'xlsx', fromDate: reportDate, toDate: reportDate, fromTime: time, toTime: time });
  const response = await exportRoute.GET(request(`/api/reports/export?${params.toString()}`, { branch: BRANCH_A }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition') || '', new RegExp(`reporte-financiero-${reportDate}\\.xlsx`));
  assert.equal(response.headers.get('x-report-period'), '1');
  assert.equal(fake.tables.entitlement_usage[0].monthly_exports, 1);
  assert.equal(fake.tables.financial_report_export_daily_usage[0].export_count, 1);
});

test('exportaciones simultáneas no pueden rebasar la cuota mensual del plan', async () => {
  const tenantRow = fake.tables.tenants.find((row) => row.id === TENANT_A);
  assert.ok(tenantRow);
  tenantRow.plan = 'starter';
  const month = localDateKey(new Date(), TIME_ZONE).slice(0, 7);
  fake.tables.entitlement_usage = [{ tenant_id: TENANT_A, month, monthly_exports: 9 }];

  const responses = await Promise.all([
    exportRoute.GET(request('/api/reports/export?days=7&format=csv')),
    exportRoute.GET(request('/api/reports/export?days=7&format=xlsx')),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort((a, b) => a - b), [200, 402]);
  assert.equal(fake.tables.entitlement_usage[0].monthly_exports, 10);
  assert.equal(fake.tables.financial_report_export_daily_usage[0].export_count, 1);
});

test('las exportaciones comparten tres permisos diarios por empresa y zona horaria local', async () => {
  const localDate = localDateKey(new Date(), TIME_ZONE);
  fake.tables.financial_report_export_daily_usage = [{ tenant_id: TENANT_A, local_date: localDate, export_count: 3 }];

  const response = await exportRoute.GET(request('/api/reports/export?days=7&format=csv'));
  assert.equal(response.status, 429);
  const body = await response.json() as Record<string, unknown>;
  assert.equal(body.code, 'DAILY_EXPORT_LIMIT');
  assert.equal(fake.tables.entitlement_usage.length, 0, 'si se agota la cuota diaria no consume la mensual');
  assert.equal(fake.tables.financial_report_export_daily_usage[0].export_count, 3);
});
