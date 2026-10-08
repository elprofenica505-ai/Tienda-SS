import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canUseAiAssistant } from '@/lib/ai/access';
import { buildBusinessAnalysis, buildSystemPrompt, getTenantContextForAI, type TenantAIContext } from '@/lib/ai/context';
import { decryptApiKey, encryptApiKey, maskApiKey } from '@/lib/ai/encryption';
import { managuaLocalDate } from '@/lib/ai/store';
import { buildAssistantVisuals } from '@/lib/ai/visuals';
import { getApiPolicy } from '@/lib/api-policy';
import {
  createFinancialReportPeriod,
  shiftDateKey,
  type FinancialDailyRow,
  type FinancialReportDataset,
} from '@/lib/financial-reports';
import { seedMember, startFakeSupabase } from './helpers/fake-supabase';

const migration = readFileSync('supabase/migrations/20261008000003_ai_assistant.sql', 'utf8');

/** Dataset financiero mínimo pero completo, con los mismos campos que Reportes. */
function dailyRow(date: string, overrides: Partial<FinancialDailyRow> = {}): FinancialDailyRow {
  return {
    date,
    grossSales: 0,
    returns: 0,
    sales: 0,
    costOfGoodsSold: 0,
    grossProfit: 0,
    expenses: 0,
    netProfit: 0,
    creditIssued: 0,
    creditCollected: 0,
    salesCount: 0,
    ...overrides,
  };
}

const reportPeriod = createFinancialReportPeriod(30, 'America/Managua', new Date('2026-10-08T18:00:00.000Z'));
const reportDaily = reportPeriod.dateKeys.map((date) => dailyRow(date));
const reportToday = reportDaily[reportDaily.length - 1];
const reportYesterday = reportDaily[reportDaily.length - 2];
reportYesterday.sales = 800;
reportYesterday.expenses = 600;
reportYesterday.netProfit = 200;
reportYesterday.salesCount = 4;
reportToday.sales = 1000;
reportToday.expenses = 500;
reportToday.netProfit = 500;
reportToday.salesCount = 5;

function financialDataset(overrides: Partial<FinancialReportDataset> = {}): FinancialReportDataset {
  return {
    period: reportPeriod,
    currency: 'NIO',
    branchId: null,
    daily: reportDaily,
    hourly: [],
    summary: {
      grossSales: 1800,
      returns: 0,
      sales: 1800,
      costOfGoodsSold: 1100,
      grossProfit: 700,
      expenses: 1100,
      netProfit: -400,
      creditIssued: 0,
      creditCollected: 0,
      openCredit: 250,
      salesCount: 9,
      averageTicket: 200,
      costCoverage: 100,
      costedLines: 9,
      uncostedLines: 0,
      missingCostQuantity: 0,
    },
    sales: [],
    returns: [],
    expenses: [],
    creditIssues: [],
    creditCollections: [],
    openReceivables: [],
    topProducts: [
      { name: 'Tornillo 2 pulgadas', quantity: 12, revenue: 1200 },
      { name: 'Cemento gris', quantity: 3, revenue: 600 },
    ],
    paymentMethods: [
      { method: 'cash', total: 1500 },
      { method: 'card', total: 300 },
    ],
    ...overrides,
  };
}

const businessAnalysis = buildBusinessAnalysis(financialDataset());

test('Conexia sólo reconoce owner, admin, gerente y jefe como roles de inteligencia', () => {
  for (const role of ['owner', 'admin', 'gerente', 'jefe']) assert.equal(canUseAiAssistant(role), true, `${role} debe poder usar Conexia`);
  for (const role of ['vendedor', 'cajero', 'bodega', 'supervisor_sucursal', 'solo_lectura']) assert.equal(canUseAiAssistant(role), false, `${role} no debe poder usar Conexia`);
  assert.deepEqual(getApiPolicy('/api/ai/chat', 'GET'), { module: 'dashboard', action: 'view' });
});

test('las API keys BYOK se cifran con AES-GCM y se muestran únicamente enmascaradas', () => {
  const previous = process.env.AI_ENCRYPTION_KEY;
  // AES-256-GCM accepts a passphrase that the implementation derives with SHA-256.
  // Deliberately human-readable so secret scanners never treat a fixture as a key.
  process.env.AI_ENCRYPTION_KEY = 'unit test encryption key, not a secret';
  try {
    const encrypted = encryptApiKey('abcd1234wxyz');
    assert.match(encrypted, /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    assert.notEqual(encrypted.includes('abcd1234wxyz'), true);
    assert.equal(decryptApiKey(encrypted), 'abcd1234wxyz');
    assert.equal(maskApiKey('abcd1234wxyz'), 'abcd••••wxyz');
  } finally {
    if (previous === undefined) delete process.env.AI_ENCRYPTION_KEY;
    else process.env.AI_ENCRYPTION_KEY = previous;
  }
});

test('el prompt de Conexia incluye datos reales, nicho y la regla de no inventar', () => {
  const context: TenantAIContext = {
    companyName: 'Ferretería Central',
    businessType: 'ferretería y materiales de construcción',
    currency: 'NIO',
    timezone: 'America/Managua',
    localDate: '2026-10-07',
    range: { from: '2026-10-07T06:00:00.000Z', to: '2026-10-08T06:00:00.000Z' },
    salesToday: { count: 3, total: 1250, paidTotal: 1200, truncated: false },
    lowStock: [{ name: 'Tornillo 2 pulgadas', sku: 'TOR-2', stock: 2, available: 2, minStock: 5 }],
    queriedProducts: [{ name: 'Tornillo 2 pulgadas', sku: 'TOR-2', stock: 2, available: 2, minStock: 5 }],
    finance: { expenses: 100, cashMovementNet: 1100, nonSaleCashAdjustments: 0, netFlow: 1100 },
    branches: [{ id: 'branch-1', name: 'Sucursal Principal', code: 'MAIN', salesCount: 3, salesTotal: 1250 }],
    mainBranch: { id: 'branch-1', name: 'Sucursal Principal', code: 'MAIN', salesCount: 3, salesTotal: 1250 },
    catalog: { activeProducts: 50, stockRowsTruncated: false },
    analysis: businessAnalysis,
    profitability: {
      periodDays: 30,
      revenue: 1800,
      cost: 1100,
      grossProfit: 700,
      marginPct: 38.9,
      uncostedLines: 0,
      missingCostQuantity: 0,
      products: [{ name: 'Tornillo 2 pulgadas', quantity: 12, revenue: 1200, cost: 600, grossProfit: 600, marginPct: 50 }],
      bestSeller: { name: 'Tornillo 2 pulgadas', quantity: 12, revenue: 1200, cost: 600, grossProfit: 600, marginPct: 50 },
      bestMargin: { name: 'Tornillo 2 pulgadas', quantity: 12, revenue: 1200, cost: 600, grossProfit: 600, marginPct: 50 },
    },
  };
  const prompt = buildSystemPrompt(context, { personality: 'inventory', customInstructions: '' });
  assert.match(prompt, /Eres Conexia, asistente de ConexiaX, empresa Ferretería Central/);
  assert.match(prompt, /Tornillo 2 pulgadas/);
  assert.match(prompt, /Ventas hoy: 3 ventas registradas/);
  assert.match(prompt, /Nunca inventes montos/);
  assert.match(prompt, /Experto Inventario|inventario/i);
  // El análisis administrativo de 30 días viaja siempre en el prompt.
  assert.match(prompt, /ANÁLISIS ADMINISTRATIVO/);
  assert.match(prompt, /ÚLTIMOS 30 DÍAS DE REPORTES/);
  assert.match(prompt, /Resumen 30 días/);
  assert.match(prompt, /Hoy vs ayer/);
  assert.match(prompt, /Top productos por ingreso/);
  assert.match(prompt, /Métodos de pago/);
  assert.match(prompt, /PROHIBIDO dar respuestas genéricas/);
  assert.match(prompt, /modelo de venta/);
  assert.match(prompt, /RENTABILIDAD POR PRODUCTO/);
});

test('sin dataset de Reportes el prompt prohíbe estimar tendencias y no inventa métricas', () => {
  const base = (): TenantAIContext => ({
    companyName: 'Tienda de prueba',
    businessType: 'comercio o tienda',
    currency: 'NIO',
    timezone: 'America/Managua',
    localDate: '2026-10-08',
    range: { from: '2026-10-08T06:00:00.000Z', to: '2026-10-09T06:00:00.000Z' },
    salesToday: { count: 0, total: 0, paidTotal: 0, truncated: false },
    lowStock: [],
    queriedProducts: [],
    finance: { expenses: 0, cashMovementNet: 0, nonSaleCashAdjustments: 0, netFlow: 0 },
    branches: [],
    mainBranch: null,
    catalog: { activeProducts: 0, stockRowsTruncated: false },
    analysis: null,
    profitability: null,
  });
  const prompt = buildSystemPrompt(base(), { personality: 'conexia', customInstructions: '' });
  assert.match(prompt, /ANÁLISIS ADMINISTRATIVO: no disponible/);
  assert.match(prompt, /No estimes esas cifras/);
  assert.doesNotMatch(prompt, /RENTABILIDAD POR PRODUCTO \(|Margen bruto consolidado/);
  // Las reglas 7 y 8 siguen presentes aunque falte el dataset.
  assert.match(prompt, /PROHIBIDO dar respuestas genéricas/);
  assert.match(prompt, /modelo de venta/);
});

test('buildBusinessAnalysis compara hoy contra ayer con los totales reales y recorta a 7 días', () => {
  const analysis = buildBusinessAnalysis(financialDataset());
  assert.equal(analysis.periodDays, 30);
  assert.equal(analysis.daily.length, 7, 'el detalle diario expuesto son los últimos 7 días');
  assert.equal(analysis.daily[analysis.daily.length - 1].date, reportToday.date);
  assert.equal(analysis.summary.sales, 1800);
  assert.equal(analysis.summary.grossMarginPct, 38.9);
  const comparison = analysis.todayVsYesterday;
  assert.ok(comparison);
  assert.equal(comparison?.todayDate, reportToday.date);
  assert.equal(comparison?.yesterdayDate, reportYesterday.date);
  assert.equal(comparison?.todaySales, 1000);
  assert.equal(comparison?.yesterdaySales, 800);
  assert.equal(comparison?.salesDelta, 200);
  assert.equal(comparison?.salesDeltaPct, 25);
  assert.equal(comparison?.todayNet, 500);
  assert.equal(comparison?.yesterdayNet, 200);
  assert.equal(comparison?.netDelta, 300);
  assert.equal(comparison?.netDeltaPct, 150);
  // Un solo día no permite comparar: no se inventa el "ayer".
  const singleDay = buildBusinessAnalysis(financialDataset({ daily: [reportToday] }));
  assert.equal(singleDay.todayVsYesterday, null);
  assert.equal(singleDay.daily.length, 1);
});

test('buildAssistantVisuals dibuja barras, pastel y tabla con el análisis real, y null sin análisis', () => {
  const visual = buildAssistantVisuals({ analysis: businessAnalysis });
  assert.ok(visual);
  assert.equal(visual?.bars?.items.length, 7);
  assert.match(String(visual?.bars?.title), /Ventas por día \(7 días\)/);
  assert.match(String(visual?.bars?.items[0].label), /^\d{2}\/\d{2}$/, 'las fechas se muestran como dd/mm');
  assert.equal(visual?.pie?.items[0].label, 'cash');
  assert.equal(visual?.pie?.items[0].value, 1500);
  assert.match(String(visual?.table?.title), /top productos/i);
  assert.deepEqual(visual?.table?.columns, ['Producto', 'Unidades', 'Ingreso', '% del top']);
  assert.deepEqual(visual?.table?.rows[0], ['Tornillo 2 pulgadas', 12, 1200, '67%']);

  // Sin top productos el cuadro comparativo cae a hoy vs ayer.
  const fallback = buildAssistantVisuals({ analysis: buildBusinessAnalysis(financialDataset({ topProducts: [] })) });
  assert.match(String(fallback?.table?.title), /hoy vs ayer/i);
  assert.deepEqual(fallback?.table?.rows, [['Ventas', 1000, 800], ['Utilidad neta', 500, 200]]);

  // Sin análisis no hay gráficas: nunca se inventan series.
  assert.equal(buildAssistantVisuals({ analysis: null }), null);

  // Un dataset vacío no produce bloques vacíos.
  const empty = buildAssistantVisuals({ analysis: buildBusinessAnalysis(financialDataset({ topProducts: [], paymentMethods: [], daily: [] })) });
  assert.equal(empty, null);
});

test('la migración de IA mantiene cuota atómica Managua y tablas sólo de service_role', () => {
  assert.match(migration, /create table if not exists public\.tenant_ai_config/i);
  assert.match(migration, /create table if not exists public\.ai_chat_daily_usage/i);
  assert.match(migration, /create table if not exists public\.ai_chat_history/i);
  assert.match(migration, /target_limit integer default 20/i);
  assert.match(migration, /at time zone 'America\/Managua'/i);
  assert.match(migration, /create or replace function public\.release_ai_chat_quota/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.tenant_ai_config to service_role/i);
  assert.match(migration, /revoke all on table public\.tenant_ai_config from public, anon, authenticated/i);
});

test('Conexia carga siempre el dataset real de 30 días y sólo calcula rentabilidad cuando se la piden', { timeout: 60_000 }, async () => {
  const TENANT = '88888888-8888-4888-8888-888888888888';
  const OWNER = 'ai-context-owner-token';
  const today = managuaLocalDate();
  const yesterday = shiftDateKey(today, -1);
  const fake = await startFakeSupabase();
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    seedMember(fake, { slug: 'tienda-contexto', tenantUuid: TENANT, role: 'owner', token: OWNER, userId: 'ai-context-owner' });
    fake.tables.tenants = [{ id: TENANT, name: 'Ferretería Contexto', currency: 'NIO', timezone: 'America/Managua', plan: 'growth' }];
    fake.tables.tenant_settings = [];
    fake.tables.branches = [{ id: 'branch-1', tenant_id: TENANT, name: 'Sucursal Principal', code: 'MAIN', active: true }];
    fake.tables.products = [{ id: 'prod-1', tenant_id: TENANT, name: 'Tornillo 2 pulgadas', sku: 'TOR-2', item_type: 'product', min_stock: 5, active: true }];
    fake.tables.inventory_stocks = [{ tenant_id: TENANT, product_id: 'prod-1', warehouse_id: 'wh-1', quantity: 40, reserved_quantity: 0 }];
    fake.tables.sales = [
      {
        id: 'sale-hoy',
        tenant_id: TENANT,
        branch_id: 'branch-1',
        invoice_number: 'F-001',
        status: 'completed',
        total: 1200,
        created_at: `${today}T12:00:00-06:00`,
        sale_items: [{ id: 'item-1', product_id: 'prod-1', warehouse_id: 'wh-1', quantity: 2, unit_price: 600, line_total: 1200, products: { name: 'Tornillo 2 pulgadas', item_type: 'product' } }],
        sale_payments: [{ id: 'pay-1', payment_method: 'cash', amount: 1200, created_at: `${today}T12:00:00-06:00` }],
      },
      {
        id: 'sale-ayer',
        tenant_id: TENANT,
        branch_id: 'branch-1',
        invoice_number: 'F-002',
        status: 'completed',
        total: 800,
        created_at: `${yesterday}T12:00:00-06:00`,
        sale_items: [{ id: 'item-2', product_id: 'prod-1', warehouse_id: 'wh-1', quantity: 1, unit_price: 800, line_total: 800, products: { name: 'Tornillo 2 pulgadas', item_type: 'product' } }],
        sale_payments: [{ id: 'pay-2', payment_method: 'cash', amount: 800, created_at: `${yesterday}T12:00:00-06:00` }],
      },
    ];
    fake.tables.inventory_movements = [
      { id: 'mov-1', tenant_id: TENANT, reference_id: 'sale-hoy', reference_type: 'sale', product_id: 'prod-1', warehouse_id: 'wh-1', movement_type: 'sale', quantity: 2, unit_cost: 200 },
      { id: 'mov-2', tenant_id: TENANT, reference_id: 'sale-ayer', reference_type: 'sale', product_id: 'prod-1', warehouse_id: 'wh-1', movement_type: 'sale', quantity: 1, unit_cost: 300 },
    ];
    fake.tables.expenses = [{ id: 'exp-1', tenant_id: TENANT, branch_id: 'branch-1', description: 'Transporte', category: 'Operativo', payment_method: 'cash', amount: 200, created_at: `${today}T09:00:00-06:00` }];
    process.env.SUPABASE_URL = fake.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';

    // Pregunta de stock: el análisis de 30 días viaja igual; la rentabilidad no.
    const stockContext = await getTenantContextForAI(TENANT, '¿Cuánto stock tiene el tornillo de 2 pulgadas?');
    assert.equal(stockContext.currency, 'NIO');
    assert.ok(stockContext.analysis, 'el análisis de 30 días debe cargarse siempre');
    assert.equal(stockContext.analysis?.periodDays, 30);
    assert.equal(stockContext.analysis?.daily.length, 7);
    assert.equal(stockContext.analysis?.summary.salesCount, 2);
    assert.equal(stockContext.analysis?.summary.sales, 2000);
    assert.equal(stockContext.analysis?.topProducts[0].name, 'Tornillo 2 pulgadas');
    assert.deepEqual(stockContext.analysis?.paymentMethods, [{ method: 'cash', total: 2000 }]);
    assert.equal(stockContext.profitability, null, 'la rentabilidad sólo se carga si la pregunta la pide');

    const comparison = stockContext.analysis?.todayVsYesterday;
    assert.equal(comparison?.todaySales, 1200, 'hoy compara contra la venta real de hoy');
    assert.equal(comparison?.yesterdaySales, 800);
    assert.equal(comparison?.salesDelta, 400);
    assert.equal(comparison?.todayNet, 600, 'utilidad neta de hoy = utilidad bruta 800 - gastos 200');
    assert.equal(comparison?.yesterdayNet, 500);

    // Las gráficas salen del mismo análisis real.
    const visual = buildAssistantVisuals(stockContext);
    assert.equal(visual?.bars?.items.length, 7);
    assert.equal(visual?.pie?.items[0].value, 2000);
    assert.match(String(visual?.table?.rows[0][0]), /Tornillo 2 pulgadas/);

    // Pregunta de rentabilidad: margen real con costo histórico (2000 - 700 = 1300).
    const profitabilityContext = await getTenantContextForAI(TENANT, '¿Cuál es la rentabilidad por producto de este mes?');
    assert.equal(profitabilityContext.profitability?.periodDays, 30);
    assert.equal(profitabilityContext.profitability?.revenue, 2000);
    assert.equal(profitabilityContext.profitability?.cost, 700);
    assert.equal(profitabilityContext.profitability?.grossProfit, 1300);
    assert.equal(profitabilityContext.profitability?.marginPct, 65);
    assert.equal(profitabilityContext.profitability?.products[0].name, 'Tornillo 2 pulgadas');

    const prompt = buildSystemPrompt(profitabilityContext, { personality: 'financial', customInstructions: '' });
    assert.match(prompt, /ANÁLISIS ADMINISTRATIVO/);
    assert.match(prompt, /RENTABILIDAD POR PRODUCTO/);
    assert.match(prompt, /NIO 1,300\.00/, 'la rentabilidad usa los montos reales del período');
  } finally {
    await fake.close();
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});
