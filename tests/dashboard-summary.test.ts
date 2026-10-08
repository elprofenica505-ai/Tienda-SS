import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { NextRequest } from 'next/server';
import {
  buildDashboardDaily,
  buildDashboardSummary,
  dailyChartMax,
  dayBoundsInTimeZone,
  isValidLocalDateKey,
  localDateKeyIn,
  normalizeDailyStats,
} from '@/lib/dashboard-summary';
import { seedMember, startFakeSupabase, type FakeRow, type FakeSupabase } from './helpers/fake-supabase';

const TENANT = '11111111-1111-4111-8111-111111111111';
const BRANCH_MAIN = '33333333-3333-4333-8333-333333333333';
const BRANCH_EAST = '44444444-4444-4444-8444-444444444444';
const OWNER = 'dashboard-owner-token';
const CASHIER = 'dashboard-cashier-token';
const TIME_ZONE = 'America/Managua';

/**
 * Payload con la forma real de `/api/reports?days=30`. Es el contrato financiero
 * de `lib/financial-reports.ts`: `sales`, `netProfit` y `averageTicket`.
 */
const realReportPayload = {
  ok: true,
  period: { days: 30, from: '2026-09-09', to: '2026-10-08', timeZone: TIME_ZONE, fromTime: '00:00', toTime: '23:59' },
  currency: 'NIO',
  branchId: null,
  summary: {
    grossSales: 120000,
    returns: 5000,
    sales: 115000,
    costOfGoodsSold: 70000,
    grossProfit: 45000,
    expenses: 12500,
    netProfit: 32500,
    creditIssued: 8000,
    creditCollected: 3000,
    openCredit: 17800,
    salesCount: 46,
    averageTicket: 2608.7,
    costCoverage: 92.5,
    costedLines: 37,
    uncostedLines: 3,
    missingCostQuantity: 4,
  },
  daily: [
    { date: '2026-10-08', grossSales: 6000, returns: 0, sales: 6000, costOfGoodsSold: 3600, grossProfit: 2400, expenses: 500, netProfit: 1900, creditIssued: 0, creditCollected: 0, salesCount: 3 },
    { date: '2026-10-07', grossSales: 4200, returns: 200, sales: 4000, costOfGoodsSold: 2400, grossProfit: 1600, expenses: 300, netProfit: 1300, creditIssued: 0, creditCollected: 0, salesCount: 2 },
  ],
  topProducts: [{ name: 'Cemento', quantity: 40, revenue: 12000 }],
};

test('el Resumen lee ventas netas, utilidad neta y ticket promedio del contrato financiero', () => {
  const summary = buildDashboardSummary(realReportPayload);
  assert.equal(summary.sales, 115000);
  assert.equal(summary.netProfit, 32500);
  assert.equal(summary.averageTicket, 2608.7);
  assert.equal(summary.expenses, 12500);
  assert.equal(summary.openCredit, 17800);
  assert.equal(summary.salesCount, 46);

  // La causa raíz del bug: el dashboard viejo leía llaves que la API nunca envió.
  assert.equal('income' in realReportPayload.summary, false);
  assert.equal('net' in realReportPayload.summary, false);
  assert.equal('averageSale' in realReportPayload.summary, false);
  assert.notEqual(summary.sales, 0, 'las ventas reales no pueden pintarse en cero');
  assert.notEqual(summary.netProfit, 0, 'la utilidad real no puede pintarse en cero');
});

test('el adaptador sigue entendiendo las llaves heredadas y un payload vacío', () => {
  const legacy = buildDashboardSummary({ summary: { income: 9000, net: 2100, averageSale: 450, sales: 9000, openCredit: 700 } });
  assert.equal(legacy.sales, 9000);
  assert.equal(legacy.netProfit, 2100);
  assert.equal(legacy.averageTicket, 450);

  const empty = buildDashboardSummary(undefined);
  assert.deepEqual(empty, {
    sales: 0, grossSales: 0, returns: 0, costOfGoodsSold: 0, grossProfit: 0,
    expenses: 0, netProfit: 0, averageTicket: 0, openCredit: 0, salesCount: 0,
  });

  // Sin `averageTicket` se deriva de ventas y conteo en vez de mostrar cero.
  const derived = buildDashboardSummary({ summary: { sales: 1000, salesCount: 4, expenses: 100, costOfGoodsSold: 400 } });
  assert.equal(derived.averageTicket, 250);
  assert.equal(derived.netProfit, 500);
});

test('la serie diaria se normaliza, se ordena y nunca divide la gráfica entre cero', () => {
  const daily = buildDashboardDaily(realReportPayload);
  assert.deepEqual(daily.map((row) => row.date), ['2026-10-07', '2026-10-08']);
  assert.deepEqual(daily[0], { date: '2026-10-07', income: 4000, expenses: 300, net: 1300, salesCount: 2 });
  assert.equal(dailyChartMax(daily), 6000);
  assert.equal(dailyChartMax([]), 1);
  assert.deepEqual(buildDashboardDaily({ daily: 'no-es-una-lista' }), []);
  assert.deepEqual(normalizeDailyStats({ stats: { salesCount: 3, salesTotal: 1250.5 } }), { salesCount: 3, salesTotal: 1250.5 });
  assert.deepEqual(normalizeDailyStats(undefined), { salesCount: 0, salesTotal: 0 });
});

test('"hoy" y la ventana del día se calculan en America/Managua, no en UTC', () => {
  // 21:00 del 8 de octubre en Managua son las 03:00 UTC del 9 de octubre.
  const evening = new Date('2026-10-09T03:00:00.000Z');
  assert.equal(localDateKeyIn(evening, TIME_ZONE), '2026-10-08');
  assert.equal(evening.toISOString().slice(0, 10), '2026-10-09', 'UTC ya cambió de día; ese era el fallo');

  const bounds = dayBoundsInTimeZone('2026-10-08', TIME_ZONE);
  assert.equal(bounds.from, '2026-10-08T06:00:00.000Z');
  assert.equal(bounds.until, '2026-10-09T06:00:00.000Z');

  assert.equal(isValidLocalDateKey('2026-10-08'), true);
  assert.equal(isValidLocalDateKey('2026-13-40'), false);
  assert.equal(isValidLocalDateKey('08/10/2026'), false);
});

let fake: FakeSupabase;
let dailyRoute: typeof import('@/app/api/stats/daily/route');

/**
 * Días locales relativos al momento de correr la prueba. Se anclan al mediodía
 * UTC para que el resultado no dependa de la hora en que se ejecute el suite.
 */
function localDayOffset(days: number): string {
  const anchor = Date.parse(`${localDateKeyIn(new Date(), TIME_ZONE)}T12:00:00Z`);
  return new Date(anchor + days * 86_400_000).toISOString().slice(0, 10);
}
const DAY = localDayOffset(-2);
const NEXT_DAY = localDayOffset(-1);
const PREV_DAY = localDayOffset(-3);

function salesRow(input: { id: string; branchId: string; total: number; createdAt: string; status?: string }): FakeRow {
  return {
    id: input.id,
    tenant_id: TENANT,
    branch_id: input.branchId,
    total: input.total,
    status: input.status || 'completed',
    created_at: input.createdAt,
  };
}

function request(path: string, options: { token?: string; branch?: string } = {}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.token || OWNER}`,
    'x-tenant-id': 'tienda-conexia',
  };
  if (options.branch) headers['x-branch-id'] = options.branch;
  return new NextRequest(`http://localhost${path}`, { method: 'GET', headers });
}

before(async () => {
  fake = await startFakeSupabase();
  seedMember(fake, { slug: 'tienda-conexia', tenantUuid: TENANT, role: 'owner', token: OWNER, userId: 'dashboard-owner' });
  seedMember(fake, { slug: 'tienda-conexia', tenantUuid: TENANT, role: 'cajero', token: CASHIER, userId: 'dashboard-cashier' });
  fake.tables.tenants[0].timezone = TIME_ZONE;
  fake.tables.tenants[0].currency = 'NIO';
  fake.tables.branches = [
    { id: BRANCH_MAIN, tenant_id: TENANT, name: 'Sucursal Principal', code: 'MAIN', active: true, legacy_firestore_id: 'branch-main' },
    { id: BRANCH_EAST, tenant_id: TENANT, name: 'Sucursal Este', code: 'EAST', active: true, legacy_firestore_id: 'branch-east' },
  ];
  fake.tables.sales = [
    // 17:30 del día de prueba en Managua: dentro del día local y también del UTC.
    salesRow({ id: 'sale-1', branchId: BRANCH_MAIN, total: 1500, createdAt: `${DAY}T23:30:00.000Z` }),
    // 21:00 del día de prueba en Managua, pero ya el día siguiente en UTC. Esta
    // venta es la que desaparecía del Resumen después de las 18:00 locales.
    salesRow({ id: 'sale-2', branchId: BRANCH_MAIN, total: 2500, createdAt: `${NEXT_DAY}T03:00:00.000Z` }),
    salesRow({ id: 'sale-3', branchId: BRANCH_EAST, total: 900, createdAt: `${DAY}T20:00:00.000Z` }),
    salesRow({ id: 'sale-4', branchId: BRANCH_MAIN, total: 5000, createdAt: `${DAY}T18:00:00.000Z`, status: 'voided' }),
    salesRow({ id: 'sale-5', branchId: BRANCH_MAIN, total: 700, createdAt: `${PREV_DAY}T18:00:00.000Z` }),
  ];
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  process.env.RATE_LIMIT_SHARED = 'false';
  dailyRoute = await import('@/app/api/stats/daily/route');
});

after(async () => {
  await fake.close();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

test('las estadísticas diarias cuentan el día local y excluyen ventas anuladas', async () => {
  const response = await dailyRoute.GET(request(`/api/stats/daily?date=${DAY}`));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.date, DAY);
  assert.equal(body.timeZone, TIME_ZONE);
  // Sin cabecera de sucursal cuenta todo el negocio: sale-1 (1500) + sale-2
  // (2500) + sale-3 (900). Quedan fuera sale-4 por anulada y sale-5 por ser del
  // día local anterior; el total 4900 confirma ambas exclusiones.
  assert.equal(body.stats.salesCount, 3);
  assert.equal(body.stats.salesTotal, 4900);
});

test('la sucursal activa filtra las estadísticas diarias', async () => {
  const response = await dailyRoute.GET(request(`/api/stats/daily?date=${DAY}`, { branch: BRANCH_EAST }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.branchId, BRANCH_EAST);
  assert.equal(body.stats.salesCount, 1);
  assert.equal(body.stats.salesTotal, 900);

  const notFound = await dailyRoute.GET(request(`/api/stats/daily?date=${DAY}`, { branch: '55555555-5555-4555-8555-555555555555' }));
  assert.equal(notFound.status, 404);
});

test('sin fecha usa el día local del negocio y rechaza fechas inválidas o futuras', async () => {
  const expectedToday = localDateKeyIn(new Date(), TIME_ZONE);
  const today = await dailyRoute.GET(request('/api/stats/daily'));
  assert.equal(today.status, 200);
  assert.equal((await today.json()).date, expectedToday);

  const invalid = await dailyRoute.GET(request('/api/stats/daily?date=2026-13-40'));
  assert.equal(invalid.status, 400);

  const future = await dailyRoute.GET(request('/api/stats/daily?date=2999-01-01'));
  assert.equal(future.status, 400);
});

test('las estadísticas globales siguen reservadas a roles administrativos', async () => {
  const response = await dailyRoute.GET(request('/api/stats/daily', { token: CASHIER }));
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /rol administrativo/);
});
