import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { summarizeFinancialDays } from '@/lib/financial-math';
import { getFinancialPeriod, normalizeFinancialTimeZone } from '@/lib/financial-period';
import { buildFinancialWorkbookSheets, createFinancialWorkbook, type FinancialWorkbookData } from '@/lib/financial-workbook';
import { reportExportQuotaFailure } from '@/lib/report-export-quota';

function sampleWorkbookData(): FinancialWorkbookData {
  const daily = Array.from({ length: 365 }, (_, index) => {
    const day = new Date(Date.UTC(2025, 9, 5 + index));
    return {
      date: day.toISOString().slice(0, 10),
      netSales: index === 364 ? 120 : 0,
      profit: index === 364 ? 45 : 0,
      expenses: index === 364 ? 15 : 0,
      credits: index === 364 ? 20 : 0,
    };
  });
  const businessDate = daily.at(-1)!.date;
  const createdAt = '2026-10-04T18:30:00.000Z';
  return {
    tenant: { id: 'tenant-1', name: 'Tienda de prueba', timezone: 'America/Managua', currency: 'NIO', locale: 'es-NI' },
    period: { fromDate: daily[0].date, toDate: businessDate, days: 365, timezone: 'America/Managua' },
    totals: { netSales: 120, profit: 45, expenses: 15, credits: 20, salesCount: 1, returnsTotal: 0 },
    daily,
    sales: [{ id: 'sale-1', saleNumber: 'F-0001', status: 'completed', total: 120, netSales: 120, paidAmount: 100, creditAmount: 20, createdAt, businessDate, sellerName: 'Ana', payments: [{ method: 'cash', amount: 100 }, { method: 'credit', amount: 20 }], items: [{ productId: 'product-1', name: 'Café', sku: 'CF-1', quantity: 2, unitPrice: 60, lineTotal: 120 }] }],
    cashMovements: [{ id: 'movement-1', movementLabel: 'Cobro de venta', movementType: 'sale', direction: 'Entrada', signedAmount: 100, amount: 100, paymentMethod: 'cash', payments: [{ method: 'cash', amount: 100 }], saleNumber: 'F-0001', saleTotal: 120, createdAt, businessDate, description: 'Venta', userName: 'Luis', branchName: 'Principal', registerName: 'Caja 1', cashSessionId: 'session-1', items: [{ name: 'Café', sku: 'CF-1', quantity: 2, unitPrice: 60, total: 120 }] }],
    presales: [{ id: 'presale-1', ticketCode: 'P-0001', total: 120, status: 'paid', sellerName: 'Ana', sellerEmail: 'ana@example.test', customerName: 'Cliente', branchName: 'Principal', saleNumber: 'F-0001', createdAt, businessDate, metadata: { suggestedPayment: 'cash', documentType: 'ticket', notes: 'Sin azúcar' }, items: [{ name: 'Café', sku: 'CF-1', quantity: 2, unitPrice: 60, total: 120 }] }],
    expenses: [{ id: 'expense-1', description: 'Limpieza', category: 'General', amount: 15, paymentMethod: 'cash', userName: 'Luis', branchName: 'Principal', createdAt, businessDate }],
    returns: [],
  };
}

function unzipStoredEntries(bytes: Uint8Array): Map<string, string> {
  const entries = new Map<string, string>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    assert.equal(view.getUint16(offset + 8, true), 0, 'XLSX ZIP entries use supported stored compression');
    entries.set(name, decoder.decode(bytes.subarray(dataStart, dataStart + compressedSize)));
    offset = dataStart + compressedSize;
  }
  return entries;
}

test('financial period uses midnight and calendar boundaries in the tenant timezone, including DST', () => {
  const period = getFinancialPeriod(7, 'America/New_York', new Date('2026-03-08T12:00:00.000Z'));
  assert.equal(period.days, 7);
  assert.equal(period.fromDate, '2026-03-02');
  assert.equal(period.toDate, '2026-03-08');
  assert.equal(period.from, '2026-03-02T05:00:00.000Z');
  assert.equal(period.to, '2026-03-09T04:00:00.000Z');
  assert.equal(normalizeFinancialTimeZone('Not/A_Zone'), 'America/Managua');
  assert.equal(getFinancialPeriod(999, 'America/Managua', new Date('2026-10-04T12:00:00Z')).days, 365);
});

test('financial summary accounts for returns, returned item cost, expenses and mixed credit payments', () => {
  const result = summarizeFinancialDays({
    dates: ['2026-10-03', '2026-10-04'],
    dateOf: (value) => value.slice(0, 10),
    sales: [{ id: 'sale-1', createdAt: '2026-10-03T12:00:00Z', status: 'completed', total: 100, payments: [{ method: 'cash', amount: 80 }, { method: 'credit', amount: 20 }] }],
    returns: [{ id: 'return-1', saleId: 'sale-1', createdAt: '2026-10-04T12:00:00Z', amount: 50, refundMethod: 'cash' }],
    expenses: [{ createdAt: '2026-10-04T14:00:00Z', amount: 10 }],
    costs: [{ saleId: 'sale-1', productId: 'product-1', quantity: 2, unitCost: 30 }],
    returnedItems: [{ returnId: 'return-1', productId: 'product-1', quantity: 1 }],
  });
  assert.deepEqual(result.daily, [
    { date: '2026-10-03', netSales: 100, profit: 40, expenses: 0, credits: 20 },
    { date: '2026-10-04', netSales: -50, profit: -20, expenses: 10, credits: 0 },
  ]);
  assert.deepEqual(result.totals, { netSales: 50, profit: 20, expenses: 10, credits: 20, salesCount: 1 });

  const creditRefund = summarizeFinancialDays({
    dates: ['2026-10-03', '2026-10-04'],
    dateOf: (value) => value.slice(0, 10),
    sales: [{ id: 'sale-1', createdAt: '2026-10-03T12:00:00Z', status: 'completed', total: 100, payments: [{ method: 'cash', amount: 80 }, { method: 'credit', amount: 20 }] }],
    returns: [{ id: 'return-1', saleId: 'sale-1', createdAt: '2026-10-04T12:00:00Z', amount: 50, refundMethod: 'credit' }],
    expenses: [],
    costs: [],
    returnedItems: [],
  });
  assert.equal(creditRefund.daily[1].credits, -20, 'solo una devolución aplicada al crédito reduce la serie de créditos');
  assert.equal(creditRefund.totals.credits, 0);
});

test('master workbook includes dedicated Ventas, Caja, Preventas sheets and all 365 daily tabs', async () => {
  const data = sampleWorkbookData();
  const sheets = buildFinancialWorkbookSheets(data);
  assert.equal(sheets.length, 371);
  assert.deepEqual(sheets.slice(0, 6).map((sheet) => sheet.name), ['Resumen', 'Ventas', 'Caja', 'Preventas', 'Gastos', 'Devoluciones']);
  assert.equal(sheets.at(-1)?.name, data.period.toDate);
  assert.equal(sheets.at(-1)?.rows[8][0], 'Tipo');

  const blob = createFinancialWorkbook(data);
  assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual(Array.from(bytes.subarray(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
  const entries = unzipStoredEntries(bytes);
  const workbookXml = entries.get('xl/workbook.xml') || '';
  assert.match(workbookXml, /name="Ventas"/);
  assert.match(workbookXml, /name="Caja"/);
  assert.match(workbookXml, /name="Preventas"/);
  assert.match(workbookXml, new RegExp(`name="${data.period.toDate}"`));
  assert.match(entries.get('xl/worksheets/sheet4.xml') || '', /P-0001/);
});

test('shared financial export quota reports company-local reset and monthly plan limits', async () => {
  const daily = reportExportQuotaFailure({ allowed: false, code: 'DAILY_EXPORT_LIMIT', used: 3, resetAt: '2026-10-05T06:00:00.000Z' }, 'Tienda de prueba', 'America/Managua');
  assert.equal(daily?.status, 429);
  const dailyBody = await daily!.json();
  assert.match(dailyBody.error, /3 exportaciones financieras diarias compartidas por Tienda de prueba/);
  assert.match(dailyBody.error, /2026-10-05 a las 00:00/);

  const monthly = reportExportQuotaFailure({ allowed: false, code: 'MONTHLY_EXPORT_LIMIT', used: 10, limit: 10, month: '2026-10' }, 'Tienda de prueba', 'America/Managua');
  assert.equal(monthly?.status, 402);
  assert.equal((await monthly!.json()).entitlement, 'monthlyExports');
  assert.equal(reportExportQuotaFailure({ allowed: true }, 'Tienda', 'America/Managua'), null);
  const unavailable = reportExportQuotaFailure({}, 'Tienda', 'America/Managua');
  assert.equal(unavailable?.status, 503);
  assert.equal((await unavailable!.json()).code, 'EXPORT_QUOTA_UNAVAILABLE');
});

test('the daily quota migration serializes by tenant, resets by local date, and calls the plan quota', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261004000002_atomic_financial_report_exports.sql', import.meta.url), 'utf8');
  assert.match(sql, /for update/i);
  assert.match(sql, /current_instant at time zone tenant_timezone/i);
  assert.match(sql, /daily_limit constant integer := 3/i);
  assert.match(sql, /consume_monthly_report_export\(target_tenant_id, current_instant\)/i);
});
