import assert from 'node:assert/strict';
import test from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import {
  calculateFinancialReport,
  createFinancialReportDay,
  createFinancialReportPeriod,
  createFinancialReportRange,
  isValidDateKey,
  localDateKey,
} from '@/lib/financial-reports';
import { createFinancialReportCsv, createFinancialReportWorkbook } from '@/lib/report-workbook';

const TIME_ZONE = 'America/Managua';
const DAY = '2026-10-03';
const CREATED_AT = '2026-10-03T18:00:00.000Z';
const SALE_ID = 'sale-1';
const PRODUCT_ID = 'product-1';
const WAREHOUSE_ID = 'warehouse-1';
const RECEIVABLE_ID = 'receivable-1';

function sampleDataset() {
  const period = createFinancialReportDay(DAY, TIME_ZONE);
  return calculateFinancialReport({
    period,
    currency: 'NIO',
    branchId: null,
    sales: [{
      id: SALE_ID,
      branchId: 'branch-a',
      invoiceNumber: 'F-001',
      status: 'completed',
      total: 100,
      createdAt: CREATED_AT,
      items: [{ id: 'line-1', productId: PRODUCT_ID, warehouseId: WAREHOUSE_ID, productName: 'Café', itemType: 'product', quantity: 2, unitPrice: 50, lineTotal: 100 }],
      payments: [{ paymentMethod: 'credit', amount: 100 }],
    }],
    movements: [{ saleId: SALE_ID, productId: PRODUCT_ID, warehouseId: WAREHOUSE_ID, quantity: -2, unitCost: 30.5 }],
    returns: [],
    expenses: [{ id: 'expense-1', branchId: 'branch-a', description: 'Renta', category: 'Local', paymentMethod: 'transfer', amount: 10, createdAt: CREATED_AT }],
    creditIssues: [{ id: RECEIVABLE_ID, saleId: SALE_ID, saleNumber: 'F-001', customerName: 'Ana', originalAmount: 100, outstandingAmount: 70, status: 'partial', createdAt: CREATED_AT }],
    creditCollections: [{ id: 'payment-1', paymentId: 'payment-1', saleId: SALE_ID, saleNumber: 'F-001', customerName: 'Ana', receiptNumber: 'R-001', paymentMethod: 'cash', amount: 30, createdAt: CREATED_AT }],
    openReceivables: [{ id: RECEIVABLE_ID, saleId: SALE_ID, saleNumber: 'F-001', customerName: 'Ana', originalAmount: 100, outstandingAmount: 70, status: 'partial', createdAt: CREATED_AT }],
  });
}

test('los límites diarios usan la zona horaria de la empresa, no la del servidor', () => {
  assert.equal(localDateKey('2026-10-03T05:59:00.000Z', TIME_ZONE), '2026-10-02');
  assert.equal(localDateKey('2026-10-03T06:00:00.000Z', TIME_ZONE), '2026-10-03');
  assert.equal(localDateKey('2026-11-01T05:59:00.000Z', TIME_ZONE).slice(0, 7), '2026-10');
  const period = createFinancialReportPeriod(7, TIME_ZONE, new Date('2026-10-03T05:59:00.000Z'));
  assert.equal(period.fromDate, '2026-09-26');
  assert.equal(period.toDate, '2026-10-02');
  assert.equal(period.from, '2026-09-26T06:00:00.000Z');
  assert.equal(period.to, '2026-10-03T06:00:00.000Z');
  assert.equal(period.dateKeys.length, 7);
  assert.equal(isValidDateKey('2026-02-29'), false);
  assert.equal(isValidDateKey('2026-10-03'), true);
});

test('los períodos personalizados validan fechas y horas según la zona de la empresa', () => {
  const range = createFinancialReportRange('2026-10-01', DAY, TIME_ZONE, '08:30', '17:45');
  assert.equal(range.days, 3);
  assert.deepEqual(range.dateKeys, ['2026-10-01', '2026-10-02', DAY]);
  assert.equal(range.fromTime, '08:30');
  assert.equal(range.toTime, '17:45');
  assert.throws(() => createFinancialReportDay(DAY, TIME_ZONE, '18:00', '09:00'), /REPORT_TIME_INVALID/);
  assert.throws(() => createFinancialReportRange('2026-10-04', DAY, TIME_ZONE), /REPORT_PERIOD_INVALID/);
});

test('el filtro horario local actualiza los totales, el detalle y las barras por hora', () => {
  const period = createFinancialReportDay(DAY, TIME_ZONE, '09:00', '12:00');
  const sale = (id: string, total: number, createdAt: string) => ({
    id, branchId: 'branch-a', invoiceNumber: id, status: 'completed', total, createdAt,
    items: [], payments: [{ paymentMethod: 'cash', amount: total }],
  });
  const dataset = calculateFinancialReport({
    period,
    sales: [
      sale('before', 100, '2026-10-03T14:59:00.000Z'),
      sale('at-start', 50, '2026-10-03T15:00:00.000Z'),
      sale('at-end', 25, '2026-10-03T18:00:00.000Z'),
      sale('after', 200, '2026-10-03T18:01:00.000Z'),
    ],
    movements: [],
    returns: [{ id: 'return-1', saleId: 'at-start', invoiceNumber: 'at-start', refundMethod: 'cash', amount: 10, status: 'completed', createdAt: '2026-10-03T16:00:00.000Z', items: [] }],
    expenses: [
      { id: 'expense-in', branchId: 'branch-a', description: 'Dentro', category: 'Local', paymentMethod: 'cash', amount: 8, createdAt: '2026-10-03T15:30:00.000Z' },
      { id: 'expense-out', branchId: 'branch-a', description: 'Fuera', category: 'Local', paymentMethod: 'cash', amount: 50, createdAt: '2026-10-03T18:01:00.000Z' },
    ],
    creditIssues: [
      { id: 'credit-out', saleId: 'before', saleNumber: 'before', customerName: 'Ana', originalAmount: 100, outstandingAmount: 100, status: 'open', createdAt: '2026-10-03T14:00:00.000Z' },
      { id: 'credit-in', saleId: 'at-end', saleNumber: 'at-end', customerName: 'Ana', originalAmount: 15, outstandingAmount: 15, status: 'open', createdAt: '2026-10-03T17:00:00.000Z' },
    ],
    creditCollections: [
      { id: 'payment-in', paymentId: 'payment-in', saleId: 'at-end', saleNumber: 'at-end', customerName: 'Ana', receiptNumber: 'R-1', paymentMethod: 'cash', amount: 5, createdAt: '2026-10-03T18:00:00.000Z' },
      { id: 'payment-out', paymentId: 'payment-out', saleId: 'after', saleNumber: 'after', customerName: 'Ana', receiptNumber: 'R-2', paymentMethod: 'cash', amount: 20, createdAt: '2026-10-03T18:01:00.000Z' },
    ],
    openReceivables: [],
  });

  assert.equal(dataset.daily[0].grossSales, 75);
  assert.equal(dataset.daily[0].returns, 10);
  assert.equal(dataset.daily[0].sales, 65);
  assert.equal(dataset.daily[0].expenses, 8);
  assert.equal(dataset.daily[0].creditIssued, 15);
  assert.equal(dataset.daily[0].creditCollected, 5);
  assert.equal(dataset.sales.length, 2);
  assert.equal(dataset.expenses.length, 1);
  assert.equal(dataset.creditIssues.length, 1);
  assert.equal(dataset.creditCollections.length, 1);
  assert.deepEqual(dataset.hourly.map((row) => row.hour), [9, 10, 11, 12]);
  assert.equal(dataset.hourly[0].grossSales, 50);
  assert.equal(dataset.hourly[3].sales, 25);
});

test('la utilidad usa el costo histórico del kardex y la cartera existente', () => {
  const dataset = sampleDataset();
  assert.equal(dataset.daily[0].grossSales, 100);
  assert.equal(dataset.daily[0].costOfGoodsSold, 61);
  assert.equal(dataset.daily[0].sales, 100);
  assert.equal(dataset.daily[0].grossProfit, 39);
  assert.equal(dataset.daily[0].expenses, 10);
  assert.equal(dataset.daily[0].netProfit, 29);
  assert.equal(dataset.daily[0].creditIssued, 100);
  assert.equal(dataset.daily[0].creditCollected, 30);
  assert.equal(dataset.summary.openCredit, 70);
  assert.equal(dataset.sales[0].items[0].historicalUnitCost, 30.5);
  assert.deepEqual(dataset.paymentMethods, [{ method: 'cash', total: 30 }]);
  assert.equal(dataset.summary.costCoverage, 100);
});

test('no sustituye un costo histórico ausente por el costo actual del producto', () => {
  const dataset = calculateFinancialReport({
    period: createFinancialReportDay(DAY, TIME_ZONE),
    sales: [{
      id: SALE_ID, branchId: 'branch-a', invoiceNumber: 'F-001', status: 'completed', total: 80, createdAt: CREATED_AT,
      items: [{ id: 'line-1', productId: PRODUCT_ID, warehouseId: WAREHOUSE_ID, productName: 'Taza', itemType: 'product', quantity: 1, unitPrice: 80, lineTotal: 80 }],
      payments: [],
    }],
    movements: [], returns: [], expenses: [], creditIssues: [], creditCollections: [], openReceivables: [],
  });
  assert.equal(dataset.summary.costOfGoodsSold, 0);
  assert.equal(dataset.summary.uncostedLines, 1);
  assert.equal(dataset.sales[0].items[0].historicalUnitCost, null);
  assert.equal(dataset.sales[0].missingCostLines, 1);
  assert.equal(dataset.summary.costCoverage, 0);
});

test('solo las devoluciones a crédito reducen el crédito en Reportes', () => {
  const period = createFinancialReportPeriod(7, TIME_ZONE, new Date('2026-10-04T12:00:00.000Z'));
  const reportForRefundMethod = (refundMethod: string) => calculateFinancialReport({
    period,
    sales: [],
    movements: [],
    returns: [{ id: `return-${refundMethod}`, saleId: SALE_ID, invoiceNumber: 'F-001', refundMethod, amount: 20, status: 'completed', createdAt: '2026-10-04T18:00:00.000Z', items: [] }],
    expenses: [],
    creditIssues: [{ id: RECEIVABLE_ID, saleId: SALE_ID, saleNumber: 'F-001', customerName: 'Ana', originalAmount: 50, outstandingAmount: 30, status: 'partial', createdAt: '2026-10-03T18:00:00.000Z' }],
    creditCollections: [],
    openReceivables: [],
  });

  const cashRefund = reportForRefundMethod('cash');
  const creditRefund = reportForRefundMethod('credit');
  assert.equal(cashRefund.daily.find((row) => row.date === '2026-10-04')?.creditIssued, 0);
  assert.equal(cashRefund.summary.creditIssued, 50);
  assert.equal(creditRefund.daily.find((row) => row.date === '2026-10-04')?.creditIssued, -20);
  assert.equal(creditRefund.summary.creditIssued, 30);
});

test('las devoluciones revierten el ingreso y recuperan costo con el kardex de la venta original', () => {
  const period = createFinancialReportPeriod(7, TIME_ZONE, new Date('2026-10-04T12:00:00.000Z'));
  const dataset = calculateFinancialReport({
    period,
    sales: [{
      id: SALE_ID, branchId: 'branch-a', invoiceNumber: 'F-001', status: 'returned', total: 100, createdAt: '2026-10-03T18:00:00.000Z',
      items: [{ id: 'line-1', productId: PRODUCT_ID, warehouseId: WAREHOUSE_ID, productName: 'Café', itemType: 'product', quantity: 2, unitPrice: 50, lineTotal: 100 }], payments: [],
    }],
    movements: [{ saleId: SALE_ID, productId: PRODUCT_ID, warehouseId: WAREHOUSE_ID, quantity: -2, unitCost: 30 }],
    returns: [{
      id: 'return-1', saleId: SALE_ID, invoiceNumber: 'F-001', refundMethod: 'cash', amount: 50, status: 'completed', createdAt: '2026-10-04T18:00:00.000Z',
      items: [{ id: 'return-line-1', saleId: SALE_ID, productId: PRODUCT_ID, warehouseId: WAREHOUSE_ID, productName: 'Café', quantity: 1, unitPrice: 50, amount: 50 }],
    }],
    expenses: [], creditIssues: [], creditCollections: [], openReceivables: [],
  });
  const returnDay = dataset.daily.find((row) => row.date === '2026-10-04');
  assert.ok(returnDay);
  assert.equal(returnDay.returns, 50);
  assert.equal(returnDay.costOfGoodsSold, -30);
  assert.equal(returnDay.sales, -50);
  assert.equal(returnDay.grossProfit, -20);
  assert.equal(dataset.returns[0].historicalCostRecovered, 30);
});

test('CSV mantiene negativos numéricos y Excel trae plantilla, filtros y fórmulas de autosuma', () => {
  const dataset = sampleDataset();
  dataset.daily[0].netProfit = -12.5;
  const csv = createFinancialReportCsv(dataset);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /,-12\.5,/);
  assert.doesNotMatch(csv, /,'-12\.5/);

  const bytes = createFinancialReportWorkbook(dataset, { tenantName: 'Tienda & Café', branchLabel: 'Todas', generatedAt: new Date('2026-10-03T00:00:00.000Z') });
  const archive = unzipSync(bytes);
  const workbook = strFromU8(archive['xl/workbook.xml']);
  const dailySheet = strFromU8(archive['xl/worksheets/sheet2.xml']);
  const hourlySheet = strFromU8(archive['xl/worksheets/sheet3.xml']);
  const salesSheet = strFromU8(archive['xl/worksheets/sheet4.xml']);
  const dailyTable = strFromU8(archive['xl/tables/table1.xml']);
  const hourlyTable = strFromU8(archive['xl/tables/table2.xml']);
  const template = strFromU8(archive['xl/worksheets/sheet1.xml']);
  assert.match(workbook, /name="Plantilla"/);
  assert.match(workbook, /name="Diario"/);
  assert.match(workbook, /name="Horas"/);
  assert.match(workbook, /fullCalcOnLoad="1"/);
  assert.match(dailySheet, /SUBTOTAL\(109,\[Ventas netas\]\)/);
  assert.match(dailyTable, /totalsRowFunction="sum"/);
  assert.match(dailyTable, /<autoFilter/);
  assert.match(hourlyTable, /Hora local/);
  assert.match(hourlyTable, /Ganancia neta/);
  assert.match(hourlySheet, /12:00/);
  assert.match(salesSheet, /Hora local/);
  assert.match(template, /SUM\(Diario!D5:D5\)/);
  assert.match(template, /SUM\(Cartera!F5:F5\)/);
  assert.match(template, /Tienda &amp; Café/);
  assert.match(template, /00:00–23:59/);
  const tableFiles = Object.keys(archive).filter((name) => /^xl\/tables\/table\d+\.xml$/.test(name));
  const relationshipFiles = Object.keys(archive).filter((name) => /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(name));
  assert.equal(tableFiles.length, 7);
  assert.equal(relationshipFiles.length, 7);
  for (const relationshipPath of relationshipFiles) {
    const sheetNumber = /sheet(\d+)\.xml\.rels$/.exec(relationshipPath)?.[1];
    assert.ok(sheetNumber);
    const sheetXml = strFromU8(archive[`xl/worksheets/sheet${sheetNumber}.xml`]);
    const relationshipXml = strFromU8(archive[relationshipPath]);
    const partId = /<tablePart r:id="([^"]+)"/.exec(sheetXml)?.[1];
    const relationship = /<Relationship Id="([^"]+)"[^>]*Target="\.\.\/tables\/([^\"]+)"/.exec(relationshipXml);
    assert.ok(relationship);
    assert.equal(partId, relationship[1]);
    assert.ok(archive[`xl/tables/${relationship[2]}`]);
  }
});
