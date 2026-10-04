import { strToU8, zipSync } from 'fflate';
import { localDateKey, type FinancialReportDataset } from '@/lib/financial-reports';

const SHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const TABLE_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/table';

type WorkbookOptions = {
  tenantName: string;
  branchLabel: string;
  generatedAt?: Date;
};

type WorkbookCell = string | number | { formula: string; result: number } | null;
type TableColumn = {
  name: string;
  kind?: 'date' | 'money' | 'integer' | 'text';
  sum?: boolean;
};
type TableSheet = {
  sheetName: string;
  tableName: string;
  title: string;
  columns: TableColumn[];
  rows: WorkbookCell[][];
};

type SheetBuild = { xml: string; tableXml?: string };

function escapeXml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character] as string);
}

function columnName(index: number): string {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function excelDate(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000 + 25_569;
}

function cellXml(reference: string, value: WorkbookCell, style = 0): string {
  const styleAttribute = style ? ` s="${style}"` : '';
  if (value === null || value === undefined || value === '') return `<c r="${reference}"${styleAttribute}/>`;
  if (typeof value === 'number') return `<c r="${reference}"${styleAttribute}><v>${Number.isFinite(value) ? value : 0}</v></c>`;
  if (typeof value === 'object' && 'formula' in value) {
    return `<c r="${reference}"${styleAttribute}><f>${escapeXml(value.formula)}</f><v>${Number.isFinite(value.result) ? value.result : 0}</v></c>`;
  }
  return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function formulaCell(reference: string, formula: string, result: number, style = 4): string {
  return cellXml(reference, { formula, result }, style);
}

function rowXml(rowNumber: number, cells: string[], height?: number): string {
  const heightAttribute = height ? ` ht="${height}" customHeight="1"` : '';
  return `<row r="${rowNumber}"${heightAttribute}>${cells.join('')}</row>`;
}

function worksheetXml(input: {
  rows: string[];
  lastColumn: number;
  lastRow: number;
  widths: number[];
  merges?: string[];
  tableCount?: number;
  landscape?: boolean;
}): string {
  const cols = input.widths.length
    ? `<cols>${input.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const merges = input.merges?.length ? `<mergeCells count="${input.merges.length}">${input.merges.map((merge) => `<mergeCell ref="${merge}"/>`).join('')}</mergeCells>` : '';
  const tableParts = input.tableCount ? `<tableParts count="${input.tableCount}">${Array.from({ length: input.tableCount }, (_, index) => `<tablePart r:id="rId${index + 1}"/>`).join('')}</tableParts>` : '';
  const setup = input.landscape ? '<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' : '<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.2" footer="0.2"/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="${SHEET_NS}" xmlns:r="${REL_NS}">` +
    `<dimension ref="A1:${columnName(input.lastColumn - 1)}${Math.max(1, input.lastRow)}"/>` +
    `<sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="19"/>${cols}<sheetData>${input.rows.join('')}</sheetData>${merges}${setup}${tableParts}</worksheet>`;
}

function tableSheetXml(sheet: TableSheet, tableId: number): SheetBuild {
  const headerRow = 4;
  const dataStart = headerRow + 1;
  const bodyRows = sheet.rows.length ? sheet.rows : [sheet.columns.map(() => null)];
  const totalsRow = dataStart + bodyRows.length;
  const lastColumn = sheet.columns.length;
  const lastColumnLetter = columnName(lastColumn - 1);
  const rows: string[] = [];
  rows.push(rowXml(1, [cellXml('A1', sheet.title, 1)], 28));
  rows.push(rowXml(2, [cellXml('A2', 'ConexiaX · Reporte financiero · Ordena y filtra la tabla para explorar el período.', 2)], 22));
  rows.push(rowXml(3, [cellXml('A3', sheet.sheetName, 9)], 20));
  rows.push(rowXml(headerRow, sheet.columns.map((column, index) => cellXml(`${columnName(index)}${headerRow}`, column.name, 3)), 24));
  bodyRows.forEach((values, rowIndex) => {
    const rowNumber = dataStart + rowIndex;
    const cells = sheet.columns.map((column, columnIndex) => {
      let value = values[columnIndex] ?? null;
      let style = 0;
      if (column.kind === 'date') {
        style = 5;
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) value = excelDate(value);
      } else if (column.kind === 'money') style = 4;
      else if (column.kind === 'integer') style = 6;
      else if (column.kind === 'text') style = 10;
      return cellXml(`${columnName(columnIndex)}${rowNumber}`, value, style);
    });
    rows.push(rowXml(rowNumber, cells));
  });
  const totalCells = sheet.columns.map((column, index) => {
    const reference = `${columnName(index)}${totalsRow}`;
    if (index === 0) return cellXml(reference, 'TOTAL', 8);
    if (!column.sum) return cellXml(reference, null, 8);
    const formula = `SUBTOTAL(109,[${column.name}])`;
    const result = bodyRows.reduce((sum, row) => sum + (typeof row[index] === 'number' ? row[index] as number : 0), 0);
    return formulaCell(reference, formula, result, 7);
  });
  rows.push(rowXml(totalsRow, totalCells, 22));

  const tableReference = `A${headerRow}:${lastColumnLetter}${totalsRow}`;
  const filterReference = `A${headerRow}:${lastColumnLetter}${totalsRow - 1}`;
  const tableColumns = sheet.columns.map((column, index) => {
    const totalAttribute = index === 0 ? ' totalsRowLabel="TOTAL"' : column.sum ? ' totalsRowFunction="sum"' : '';
    return `<tableColumn id="${index + 1}" name="${escapeXml(column.name)}"${totalAttribute}/>`;
  }).join('');
  const tableXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<table xmlns="${SHEET_NS}" id="${tableId}" name="${sheet.tableName}" displayName="${sheet.tableName}" ref="${tableReference}" headerRowCount="1" totalsRowCount="1">` +
    `<autoFilter ref="${filterReference}"/><tableColumns count="${sheet.columns.length}">${tableColumns}</tableColumns>` +
    `<tableStyleInfo name="TableStyleMedium4" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`;

  return {
    xml: worksheetXml({ rows, lastColumn, lastRow: totalsRow, widths: sheet.columns.map((column) => column.kind === 'date' ? 14 : column.kind === 'money' ? 18 : column.name.length > 18 ? 27 : 20), tableCount: 1, landscape: true }),
    tableXml,
  };
}

function summarySheetXml(dataset: FinancialReportDataset, options: WorkbookOptions): string {
  const dailyDataStart = 5;
  const dailyDataEnd = dailyDataStart + dataset.daily.length - 1;
  const salesDataEnd = Math.max(5, 4 + dataset.sales.length);
  const expenseDataEnd = Math.max(5, 4 + dataset.expenses.length);
  const creditDataEnd = Math.max(5, 4 + dataset.creditIssues.length + dataset.creditCollections.length);
  const carteraDataEnd = Math.max(5, 4 + dataset.openReceivables.length);
  const reports: Array<[string, string, number]> = [
    ['Ventas netas', `SUM(Diario!D${dailyDataStart}:D${dailyDataEnd})`, dataset.summary.sales],
    ['Costo histórico de ventas', `SUM(Diario!E${dailyDataStart}:E${dailyDataEnd})`, dataset.summary.costOfGoodsSold],
    ['Ganancia bruta', `SUM(Diario!F${dailyDataStart}:F${dailyDataEnd})`, dataset.summary.grossProfit],
    ['Gastos', `SUM(Diario!G${dailyDataStart}:G${dailyDataEnd})`, dataset.summary.expenses],
    ['Ganancia neta', `SUM(Diario!H${dailyDataStart}:H${dailyDataEnd})`, dataset.summary.netProfit],
    ['Crédito otorgado', `SUM(Diario!I${dailyDataStart}:I${dailyDataEnd})`, dataset.summary.creditIssued],
    ['Abonos aplicados a crédito', `SUM(Diario!J${dailyDataStart}:J${dailyDataEnd})`, dataset.summary.creditCollected],
    ['Cartera abierta actual', `SUM(Cartera!E5:E${carteraDataEnd})`, dataset.summary.openCredit],
  ];
  const rows: string[] = [];
  rows.push(rowXml(1, [cellXml('A1', 'Reporte financiero · Plantilla', 1)], 30));
  rows.push(rowXml(2, [cellXml('A2', `${options.tenantName} · ${options.branchLabel} · ${dataset.period.fromDate} a ${dataset.period.toDate} · ${dataset.currency} · Zona horaria ${dataset.period.timeZone}`, 2)], 24));
  rows.push(rowXml(4, [cellXml('A4', 'Indicador', 3), cellXml('B4', 'Total del período', 3)], 24));
  reports.forEach(([label, formula, result], index) => {
    const rowNumber = index + 5;
    rows.push(rowXml(rowNumber, [cellXml(`A${rowNumber}`, label, 10), formulaCell(`B${rowNumber}`, formula, Number(result), 4)]));
  });
  const coverageRow = reports.length + 6;
  rows.push(rowXml(coverageRow, [cellXml(`A${coverageRow}`, 'Líneas con costo histórico faltante', 10), cellXml(`B${coverageRow}`, dataset.summary.uncostedLines, 6)]));
  rows.push(rowXml(coverageRow + 1, [cellXml(`A${coverageRow + 1}`, 'Cobertura de costo histórico', 10), cellXml(`B${coverageRow + 1}`, dataset.summary.costCoverage === null ? 'Sin artículos inventariables' : `${dataset.summary.costCoverage.toFixed(2)}%`, 10)]));
  rows.push(rowXml(coverageRow + 3, [cellXml(`A${coverageRow + 3}`, 'CRITERIOS DE CÁLCULO', 9)], 22));
  rows.push(rowXml(coverageRow + 4, [cellXml(`A${coverageRow + 4}`, 'El costo de venta se obtiene del costo unitario histórico de inventory_movements asociado a cada venta y producto. No se reemplaza por el costo actual del catálogo.', 11)], 44));
  rows.push(rowXml(coverageRow + 5, [cellXml(`A${coverageRow + 5}`, 'Los créditos y abonos provienen de la cartera existente (receivables, receivable_payments y receivable_payment_allocations). El saldo de cartera corresponde al saldo abierto actual.', 11)], 44));
  rows.push(rowXml(coverageRow + 6, [cellXml(`A${coverageRow + 6}`, `Tablas: Ventas ${salesDataEnd - 4} filas; Gastos ${expenseDataEnd - 4} filas; movimientos de crédito ${creditDataEnd - 4} filas. Los totales se recalculan al abrir el libro.`, 11)], 30));
  return worksheetXml({ rows, lastColumn: 2, lastRow: coverageRow + 6, widths: [42, 24], merges: ['A1:B1', 'A2:B2'], landscape: true });
}

function worksheetRelationships(tableId: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId${tableId}" Type="${TABLE_REL_TYPE}" Target="../tables/table${tableId}.xml"/></Relationships>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="${SHEET_NS}">` +
    `<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00;[Red](#,##0.00)"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/></numFmts>` +
    `<fonts count="5"><font><sz val="11"/><name val="Aptos"/><color rgb="FF17231B"/></font><font><b/><sz val="11"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="18"/><name val="Aptos Display"/><color rgb="FF173A27"/></font><font><i/><sz val="10"/><name val="Aptos"/><color rgb="FF68766D"/></font><font><b/><sz val="11"/><name val="Aptos"/><color rgb="FF173A27"/></font></fonts>` +
    `<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173A27"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF3E5"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD6E1D5"/></left><right style="thin"><color rgb="FFD6E1D5"/></right><top style="thin"><color rgb="FFD6E1D5"/></top><bottom style="thin"><color rgb="FFD6E1D5"/></bottom><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="12">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="164" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"/>` +
    `<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>` +
    `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>` +
    `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium4" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`;
}

function contentTypesXml(sheetCount: number, tableCount: number): string {
  const sheets = Array.from({ length: sheetCount }, (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  const tables = Array.from({ length: tableCount }, (_, index) => `<Override PartName="/xl/tables/table${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets}${tables}</Types>`;
}

function workbookXml(sheetNames: string[]): string {
  const sheets = sheetNames.map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="${SHEET_NS}" xmlns:r="${REL_NS}"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="18000" windowHeight="10000"/></bookViews>` +
    `<sheets>${sheets}</sheets><calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`;
}

function workbookRelationships(sheetCount: number): string {
  const sheetRelationships = Array.from({ length: sheetCount }, (_, index) => `<Relationship Id="rId${index + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${PKG_REL_NS}">${sheetRelationships}<Relationship Id="rId${sheetCount + 1}" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`;
}

function cellWithKind(value: string | number | null, kind: TableColumn['kind']): WorkbookCell {
  if (kind === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return excelDate(value);
  return value;
}

function tableSheets(dataset: FinancialReportDataset): TableSheet[] {
  const daily: TableSheet = {
    sheetName: 'Diario', tableName: 'TablaDiaria', title: 'Detalle financiero por fecha',
    columns: [
      { name: 'Fecha', kind: 'date' }, { name: 'Ventas brutas', kind: 'money', sum: true },
      { name: 'Devoluciones', kind: 'money', sum: true }, { name: 'Ventas netas', kind: 'money', sum: true },
      { name: 'Costo histórico', kind: 'money', sum: true }, { name: 'Ganancia bruta', kind: 'money', sum: true },
      { name: 'Gastos', kind: 'money', sum: true }, { name: 'Ganancia neta', kind: 'money', sum: true },
      { name: 'Crédito otorgado', kind: 'money', sum: true }, { name: 'Abonos aplicados', kind: 'money', sum: true },
      { name: 'Ventas', kind: 'integer', sum: true },
    ],
    rows: dataset.daily.map((row) => [row.date, row.grossSales, row.returns, row.sales, row.costOfGoodsSold, row.grossProfit, row.expenses, row.netProfit, row.creditIssued, row.creditCollected, row.salesCount]),
  };
  const sales: TableSheet = {
    sheetName: 'Ventas', tableName: 'TablaVentas', title: 'Ventas y costo histórico por transacción',
    columns: [
      { name: 'Fecha', kind: 'date' }, { name: 'Factura', kind: 'text' }, { name: 'Estado', kind: 'text' },
      { name: 'Venta', kind: 'money', sum: true }, { name: 'Costo histórico', kind: 'money', sum: true },
      { name: 'Ganancia bruta', kind: 'money', sum: true }, { name: 'Líneas sin costo histórico', kind: 'integer', sum: true },
    ],
    rows: dataset.sales.map((row) => [row.date, row.invoiceNumber, row.status, row.total, row.historicalCost, row.grossProfit, row.missingCostLines]),
  };
  const expenses: TableSheet = {
    sheetName: 'Gastos', tableName: 'TablaGastos', title: 'Gastos registrados por fecha',
    columns: [
      { name: 'Fecha', kind: 'date' }, { name: 'Descripción', kind: 'text' }, { name: 'Categoría', kind: 'text' },
      { name: 'Método de pago', kind: 'text' }, { name: 'Importe', kind: 'money', sum: true },
    ],
    rows: dataset.expenses.map((row) => [localDateKey(row.createdAt, dataset.period.timeZone), row.description, row.category, row.paymentMethod, row.amount]),
  };
  const creditEvents: Array<{ date: string; type: string; reference: string; customer: string; method: string; issued: number; collected: number }> = [
    ...dataset.creditIssues.map((row) => ({ date: localDateKey(row.createdAt, dataset.period.timeZone), type: 'Crédito otorgado', reference: row.saleNumber, customer: row.customerName, method: '—', issued: row.originalAmount, collected: 0 })),
    ...dataset.creditCollections.map((row) => ({ date: localDateKey(row.createdAt, dataset.period.timeZone), type: 'Abono aplicado', reference: row.receiptNumber || row.saleNumber, customer: row.customerName, method: row.paymentMethod, issued: 0, collected: row.amount })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));
  const credits: TableSheet = {
    sheetName: 'Crédito', tableName: 'TablaMovimientosCredito', title: 'Movimientos de la cartera de crédito ConexiaX',
    columns: [
      { name: 'Fecha', kind: 'date' }, { name: 'Movimiento', kind: 'text' }, { name: 'Factura o recibo', kind: 'text' },
      { name: 'Cliente', kind: 'text' }, { name: 'Método', kind: 'text' },
      { name: 'Crédito otorgado', kind: 'money', sum: true }, { name: 'Abono aplicado', kind: 'money', sum: true },
    ],
    rows: creditEvents.map((row) => [row.date, row.type, row.reference, row.customer, row.method, row.issued, row.collected]),
  };
  const returns: TableSheet = {
    sheetName: 'Devoluciones', tableName: 'TablaDevoluciones', title: 'Devoluciones y costo histórico recuperado',
    columns: [
      { name: 'Fecha', kind: 'date' }, { name: 'Factura', kind: 'text' }, { name: 'Método de reembolso', kind: 'text' },
      { name: 'Importe devuelto', kind: 'money', sum: true }, { name: 'Costo histórico recuperado', kind: 'money', sum: true },
      { name: 'Líneas sin costo histórico', kind: 'integer', sum: true },
    ],
    rows: dataset.returns.map((row) => [row.date, row.invoiceNumber, row.refundMethod, row.amount, row.historicalCostRecovered, row.missingCostLines]),
  };
  const cartera: TableSheet = {
    sheetName: 'Cartera', tableName: 'TablaCarteraAbierta', title: 'Cartera de crédito abierta al momento de generar el archivo',
    columns: [
      { name: 'Fecha de origen', kind: 'date' }, { name: 'Factura', kind: 'text' }, { name: 'Cliente', kind: 'text' },
      { name: 'Monto original', kind: 'money', sum: true }, { name: 'Saldo abierto actual', kind: 'money', sum: true }, { name: 'Estado', kind: 'text' },
    ],
    rows: [...dataset.openReceivables]
      .sort((a, b) => b.outstandingAmount - a.outstandingAmount || a.createdAt.localeCompare(b.createdAt))
      .map((row) => [localDateKey(row.createdAt, dataset.period.timeZone), row.saleNumber, row.customerName, row.originalAmount, row.outstandingAmount, row.status]),
  };
  return [daily, sales, expenses, credits, returns, cartera].map((sheet) => ({
    ...sheet,
    rows: sheet.rows.map((row) => row.map((value, index) => cellWithKind(value as string | number | null, sheet.columns[index]?.kind))),
  }));
}

function csvSafe(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const text = String(value ?? '');
  const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function createFinancialReportCsv(dataset: FinancialReportDataset): string {
  const header = ['Fecha', 'Ventas brutas', 'Devoluciones', 'Ventas netas', 'Costo histórico', 'Ganancia bruta', 'Gastos', 'Ganancia neta', 'Crédito otorgado', 'Abonos aplicados', 'Cantidad de ventas'];
  const rows = dataset.daily.map((row) => [row.date, row.grossSales, row.returns, row.sales, row.costOfGoodsSold, row.grossProfit, row.expenses, row.netProfit, row.creditIssued, row.creditCollected, row.salesCount]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvSafe).join(',')).join('\r\n')}\r\n`;
}

export function createFinancialReportWorkbook(dataset: FinancialReportDataset, options: WorkbookOptions): Uint8Array {
  const sheets = tableSheets(dataset);
  const fileMap: Record<string, Uint8Array> = {};
  const sheetNames = ['Plantilla', ...sheets.map((sheet) => sheet.sheetName)];
  const sheetBuilds: SheetBuild[] = [{ xml: summarySheetXml(dataset, options) }];

  for (let index = 0; index < sheets.length; index += 1) {
    sheetBuilds.push(tableSheetXml(sheets[index], index + 1));
  }

  fileMap['[Content_Types].xml'] = strToU8(contentTypesXml(sheetBuilds.length, sheets.length));
  fileMap['_rels/.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  fileMap['docProps/app.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>ConexiaX</Application><TitlesOfParts><vt:vector size="${sheetNames.length}" baseType="lpstr">${sheetNames.map((name) => `<vt:lpstr>${escapeXml(name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts></Properties>`);
  const generatedAt = options.generatedAt || new Date();
  fileMap['docProps/core.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>ConexiaX</dc:creator><dc:title>Reporte financiero · ${escapeXml(options.tenantName)}</dc:title><dc:subject>Reportes financieros</dc:subject><dcterms:created xsi:type="dcterms:W3CDTF">${generatedAt.toISOString()}</dcterms:created></cp:coreProperties>`);
  fileMap['xl/workbook.xml'] = strToU8(workbookXml(sheetNames));
  fileMap['xl/_rels/workbook.xml.rels'] = strToU8(workbookRelationships(sheetBuilds.length));
  fileMap['xl/styles.xml'] = strToU8(stylesXml());

  sheetBuilds.forEach((sheet, index) => {
    const number = index + 1;
    fileMap[`xl/worksheets/sheet${number}.xml`] = strToU8(sheet.xml);
    if (sheet.tableXml) {
      const tableId = number - 1;
      fileMap[`xl/tables/table${tableId}.xml`] = strToU8(sheet.tableXml);
      fileMap[`xl/worksheets/_rels/sheet${number}.xml.rels`] = strToU8(worksheetRelationships(tableId));
    }
  });
  return zipSync(fileMap, { level: 6 });
}
