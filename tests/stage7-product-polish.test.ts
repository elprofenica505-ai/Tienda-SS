import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getApiPolicy } from '@/lib/api-policy';

const presales = readFileSync('app/api/presales/route.ts', 'utf8');
const checkout = readFileSync('app/api/presales/checkout/route.ts', 'utf8');
const sales = readFileSync('app/api/sales/route.ts', 'utf8');
const receivables = readFileSync('app/api/receivables/route.ts', 'utf8');
const reports = readFileSync('app/api/reports/route.ts', 'utf8');
const reportService = readFileSync('lib/financial-reports-service.ts', 'utf8');
const exportRoute = readFileSync('app/api/reports/export/route.ts', 'utf8');
const workbookRoute = readFileSync('app/api/reports/workbook/route.ts', 'utf8');
const reportPage = readFileSync('app/workspace/reports/page.tsx', 'utf8');
const reportInsights = readFileSync('components/workspace/FinancialReportInsights.tsx', 'utf8');
const reportChart = readFileSync('components/workspace/FinancialReportChart.tsx', 'utf8');
const reportWorkbook = readFileSync('lib/report-workbook.ts', 'utf8');
const dailyStats = readFileSync('app/api/stats/daily/route.ts', 'utf8');
const tenant = readFileSync('lib/tenant.ts', 'utf8');
const cashier = readFileSync('app/workspace/cashier/page.tsx', 'utf8');
const presalesPage = readFileSync('app/workspace/presales/page.tsx', 'utf8');
const printHelper = readFileSync('lib/print.ts', 'utf8');
const globalStyles = readFileSync('app/globals.css', 'utf8');

test('presales, cobro y créditos exigen guarda de tenant y permisos', () => {
  assert.match(presales, /requireTenantPermission/);
  assert.match(checkout, /requireTenantPermission/);
  assert.match(sales, /requireTenantPermission/);
  assert.match(receivables, /requireTenantPermission/);
  assert.deepEqual(getApiPolicy('/api/presales', 'POST'), { module: 'sales', action: 'create' });
  assert.deepEqual(getApiPolicy('/api/presales/checkout', 'POST'), { module: 'sales', action: 'create' });
  assert.deepEqual(getApiPolicy('/api/sales', 'POST'), { module: 'sales', action: 'create' });
  assert.deepEqual(getApiPolicy('/api/receivables', 'POST'), { module: 'receivables', action: 'create' });
});

test('rate limit permanece centralizado en la guarda de tenant', () => {
  assert.match(tenant, /consumeDistributedRateLimits/);
  assert.match(tenant, /endpoint: request\.nextUrl\.pathname/);
  assert.match(tenant, /tenant: 1_000/);
});

test('reportes incluyen calendario, filtro horario, gráficos y exportaciones', () => {
  assert.match(reportPage, /type="date"/);
  assert.match(reportPage, /type="time"/);
  assert.match(reportPage, /fromDate/);
  assert.match(reportPage, /toDate/);
  assert.match(reportPage, /FinancialReportInsights/);
  assert.match(reportInsights, /conic-gradient/);
  assert.match(reportInsights, /financial-hourly-column/);
  assert.match(reportChart, /Ventas netas/);
  assert.match(reportChart, /Crédito otorgado/);
  assert.match(reportWorkbook, /sheetName: 'Horas'/);
  assert.match(reportWorkbook, /Hora local/);
  assert.match(reportPage, /updateMasterWorkbook/);
  assert.match(workbookRoute, /consume_financial_report_export/);
});

test('tickets y detalles imprimen únicamente el elemento seleccionado sin ocultar otras pantallas', () => {
  assert.match(printHelper, /window\.print\(\)/);
  assert.match(cashier, /printElement\(receiptPrintRef\.current\)/);
  assert.match(cashier, /printElement\(movementPrintRef\.current\)/);
  assert.match(cashier, /navigator\.clipboard/);
  assert.match(cashier, /ticketCode/);
  assert.match(presalesPage, /printElement\(detailPrintRef\.current\)/);
  assert.match(presalesPage, /navigator\.clipboard/);
  assert.match(presalesPage, /lastTicket/);
  assert.match(globalStyles, /body\.printing-specific \[data-print-target="active"\]/);
  assert.doesNotMatch(globalStyles, /@media\s+print\s*\{\s*body\s*\*\s*\{\s*visibility:\s*hidden/);
});

test('los endpoints no exponen secretos en el cliente', () => {
  assert.doesNotMatch(cashier, /STRIPE_SECRET_KEY|FIREBASE_ADMIN|sk_live_/);
  assert.doesNotMatch(presalesPage, /STRIPE_SECRET_KEY|FIREBASE_ADMIN|sk_live_/);
});

test('reportes y exportaciones respetan sucursal y rol administrativo', () => {
  assert.match(reports, /resolveFinancialReportScope/);
  assert.match(reports, /loadFinancialReportDataset/);
  assert.match(reportService, /context\.branchIds\.slice/);
  assert.match(reportService, /branchFiltered\(query, scope\)/);
  assert.match(reportService, /branchField: 'sales\.branch_id'/);
  assert.match(exportRoute, /resolveFinancialReportScope/);
  assert.match(exportRoute, /requireTenantPermission\(request, 'reports', 'export'\)/);
  assert.match(exportRoute, /consume_financial_report_export/);
  assert.match(dailyStats, /Las estadísticas globales requieren un rol administrativo/);
});
