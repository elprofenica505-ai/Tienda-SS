export type WorkbookCell = string | number | boolean | null | undefined;
export type WorkbookSheet = { name: string; rows: WorkbookCell[][]; headerRow?: number; titleRows?: number[] };

export type FinancialWorkbookData = {
  tenant: { id: string; name: string; timezone: string; currency: string; locale?: string };
  period: { fromDate: string; toDate: string; days: number; timezone: string };
  totals: { netSales: number; profit: number; expenses: number; credits: number; salesCount: number; returnsTotal?: number };
  daily: Array<{ date: string; netSales: number; profit: number; expenses: number; credits: number }>;
  sales: Array<Record<string, any>>;
  cashMovements: Array<Record<string, any>>;
  presales: Array<Record<string, any>>;
  expenses: Array<Record<string, any>>;
  returns: Array<Record<string, any>>;
};

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const EXCEL_MAX_ROWS = 1_048_576;

function xml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function columnName(index: number): string {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function cellXml(value: WorkbookCell, address: string, styleId?: number): string {
  const style = styleId ? ` s="${styleId}"` : '';
  if (value === null || value === undefined || value === '') return `<c r="${address}"${style}/>`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${address}"${style}><v>${String(value)}</v></c>`;
  if (typeof value === 'boolean') return `<c r="${address}" t="b"${style}><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${address}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(String(value))}</t></is></c>`;
}

function worksheetXml(sheet: WorkbookSheet): string {
  if (sheet.rows.length > EXCEL_MAX_ROWS) throw new Error('WORKBOOK_SHEET_TOO_LARGE');
  const width = Math.max(1, ...sheet.rows.map((row) => row.length));
  const lastCell = `${columnName(width - 1)}${Math.max(1, sheet.rows.length)}`;
  const headerRow = sheet.headerRow || 0;
  const rowsXml = sheet.rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const styleId = (sheet.titleRows || []).includes(rowIndex) ? 2 : rowIndex === headerRow ? 1 : undefined;
      return cellXml(value, `${columnName(columnIndex)}${rowIndex + 1}`, styleId);
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  const columns = Array.from({ length: width }, (_, index) => `<col min="${index + 1}" max="${index + 1}" width="20" customWidth="1"/>`).join('');
  const filter = sheet.rows.length > headerRow + 1
    ? `<autoFilter ref="A${headerRow + 1}:${columnName(width - 1)}${sheet.rows.length}"/>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastCell}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow + 1}" topLeftCell="A${headerRow + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${columns}</cols><sheetData>${rowsXml}</sheetData>${filter}<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
}

function paymentSummary(payments: unknown): string {
  if (!Array.isArray(payments)) return '';
  return payments.map((payment) => {
    const row = payment as Record<string, unknown>;
    return `${String(row.method || row.paymentMethod || 'Pago')}: ${Number(row.amount || 0).toFixed(2)}`;
  }).join(' · ');
}

function itemRows(value: unknown): Array<Record<string, any>> {
  return Array.isArray(value) ? value as Array<Record<string, any>> : [];
}

function buildSalesSheet(data: FinancialWorkbookData): WorkbookSheet {
  const header = ['Fecha y hora', 'Venta', 'Sucursal', 'Estado', 'Cliente', 'Vendedor', 'Total', 'Ventas netas', 'Cobrado', 'Crédito', 'Pagos', 'Producto', 'SKU', 'Cantidad', 'Precio unitario', 'Total de línea', 'ID de venta'];
  const rows: WorkbookCell[][] = [header];
  for (const sale of data.sales) {
    const items = itemRows(sale.items);
    const rowsForSale = items.length ? items : [{}];
    for (const item of rowsForSale) {
      rows.push([
        sale.createdAt || '', sale.saleNumber || sale.id || '', sale.branchName || '', sale.status || '', sale.customerName || sale.customerId || '', sale.sellerName || sale.sellerEmail || '',
        Number(sale.total || 0), Number(sale.netSales ?? sale.total ?? 0), Number(sale.paidAmount || 0), Number(sale.creditAmount || 0), paymentSummary(sale.payments),
        item.name || '', item.sku || '', Number(item.quantity || 0), Number(item.unitPrice || 0), Number(item.lineTotal ?? item.total ?? 0), sale.id || '',
      ]);
    }
  }
  return { name: 'Ventas', rows, headerRow: 0 };
}

function buildCashSheet(data: FinancialWorkbookData): WorkbookSheet {
  const rows: WorkbookCell[][] = [[
    'Fecha y hora', 'Tipo', 'Dirección', 'Monto', 'Método / pagos', 'Descripción', 'Venta relacionada', 'Total de venta', 'Producto', 'SKU', 'Cantidad', 'Usuario', 'Sucursal', 'Caja', 'Turno', 'Referencia',
  ]];
  for (const movement of data.cashMovements) {
    const items = itemRows(movement.items);
    for (const item of (items.length ? items : [{}])) {
      rows.push([
        movement.createdAt || '', movement.movementLabel || movement.movementType || '', movement.direction || '', Number(movement.amount || 0),
        paymentSummary(movement.payments) || movement.paymentMethod || '', movement.description || '', movement.saleNumber || movement.saleId || '', Number(movement.saleTotal || 0),
        item.name || '', item.sku || '', Number(item.quantity || 0), movement.userName || movement.userEmail || '', movement.branchName || '', movement.registerName || '', movement.cashSessionId || '', movement.referenceType || '',
      ]);
    }
  }
  return { name: 'Caja', rows, headerRow: 0 };
}

function buildPresalesSheet(data: FinancialWorkbookData): WorkbookSheet {
  const rows: WorkbookCell[][] = [[
    'Fecha y hora', 'Ticket', 'Sucursal', 'Estado', 'Responsable / vendedor', 'Correo del vendedor', 'Cliente / identificación', 'Venta relacionada', 'Total', 'Pago sugerido', 'Comprobante', 'Mesa / punto', 'Observaciones', 'Producto', 'SKU', 'Cantidad', 'Precio unitario', 'Total de línea', 'ID de preventa',
  ]];
  for (const presale of data.presales) {
    const items = itemRows(presale.items);
    for (const item of (items.length ? items : [{}])) {
      rows.push([
        presale.createdAt || '', presale.ticketCode || '', presale.branchName || '', presale.status || '', presale.sellerName || presale.sellerEmail || '', presale.sellerEmail || '', presale.customerName || presale.customerId || '',
        presale.saleNumber || presale.saleId || '', Number(presale.total || 0), presale.metadata?.suggestedPayment || '', presale.metadata?.documentType || '', presale.metadata?.servicePoint || '', presale.metadata?.notes || '',
        item.name || '', item.sku || '', Number(item.quantity || 0), Number(item.unitPrice || 0), Number(item.total || 0), presale.id || '',
      ]);
    }
  }
  return { name: 'Preventas', rows, headerRow: 0 };
}

function buildExpensesSheet(data: FinancialWorkbookData): WorkbookSheet {
  const rows: WorkbookCell[][] = [['Fecha y hora', 'Descripción', 'Categoría', 'Monto', 'Método de pago', 'Notas', 'Usuario', 'Sucursal', 'ID de gasto']];
  for (const expense of data.expenses) {
    rows.push([expense.createdAt || '', expense.description || '', expense.category || '', Number(expense.amount || 0), expense.paymentMethod || '', expense.notes || '', expense.userName || expense.userEmail || '', expense.branchName || '', expense.id || '']);
  }
  return { name: 'Gastos', rows, headerRow: 0 };
}

function buildReturnsSheet(data: FinancialWorkbookData): WorkbookSheet {
  const rows: WorkbookCell[][] = [['Fecha y hora', 'Devolución', 'Venta relacionada', 'Sucursal', 'Motivo', 'Método de reembolso', 'Monto devuelto', 'Usuario', 'Producto', 'SKU', 'Cantidad', 'ID de devolución']];
  for (const returnItem of data.returns) {
    const items = itemRows(returnItem.items);
    for (const item of (items.length ? items : [{}])) {
      rows.push([returnItem.createdAt || '', returnItem.id || '', returnItem.saleNumber || returnItem.saleId || '', returnItem.branchName || '', returnItem.reason || '', returnItem.refundMethod || '', Number(returnItem.amount || 0), returnItem.userName || '', item.name || '', item.sku || '', Number(item.quantity || 0), returnItem.id || '']);
    }
  }
  return { name: 'Devoluciones', rows, headerRow: 0 };
}

function dailyEventRows(date: string, data: FinancialWorkbookData): WorkbookCell[][] {
  const rows: WorkbookCell[][] = [
    [`Actividad del ${date}`],
    ['Zona horaria', data.tenant.timezone],
    [],
    ['Ventas netas', Number(data.daily.find((item) => item.date === date)?.netSales || 0), data.tenant.currency],
    ['Ganancia bruta estimada', Number(data.daily.find((item) => item.date === date)?.profit || 0), data.tenant.currency],
    ['Gastos', Number(data.daily.find((item) => item.date === date)?.expenses || 0), data.tenant.currency],
    ['Créditos', Number(data.daily.find((item) => item.date === date)?.credits || 0), data.tenant.currency],
    [],
    ['Tipo', 'Fecha y hora', 'Referencia', 'Estado', 'Persona', 'Método / pagos', 'Producto', 'SKU', 'Cantidad', 'Monto', 'Detalle'],
  ];
  for (const sale of data.sales.filter((item) => item.businessDate === date)) {
    const items = itemRows(sale.items);
    for (const item of (items.length ? items : [{}])) {
      rows.push(['Venta', sale.createdAt || '', sale.saleNumber || sale.id || '', sale.status || '', sale.sellerName || sale.sellerEmail || '', paymentSummary(sale.payments), item.name || '', item.sku || '', Number(item.quantity || 0), Number(item.lineTotal ?? sale.netSales ?? sale.total ?? 0), sale.customerName || sale.customerId || '']);
    }
  }
  for (const movement of data.cashMovements.filter((item) => item.businessDate === date)) {
    const items = itemRows(movement.items);
    for (const item of (items.length ? items : [{}])) {
      rows.push(['Caja', movement.createdAt || '', movement.saleNumber || movement.saleId || movement.id || '', movement.movementLabel || '', movement.userName || movement.userEmail || '', paymentSummary(movement.payments) || movement.paymentMethod || '', item.name || '', item.sku || '', Number(item.quantity || 0), Number(movement.signedAmount ?? movement.amount ?? 0), movement.description || '']);
    }
  }
  for (const expense of data.expenses.filter((item) => item.businessDate === date)) {
    rows.push(['Gasto', expense.createdAt || '', expense.id || '', expense.category || '', expense.userName || expense.userEmail || '', expense.paymentMethod || '', '', '', '', Number(expense.amount || 0), expense.description || '']);
  }
  for (const returnItem of data.returns.filter((item) => item.businessDate === date)) {
    const items = itemRows(returnItem.items);
    for (const item of (items.length ? items : [{}])) {
      rows.push(['Devolución', returnItem.createdAt || '', returnItem.saleNumber || returnItem.saleId || '', 'Completada', returnItem.userName || '', returnItem.refundMethod || '', item.name || '', item.sku || '', Number(item.quantity || 0), -Number(item.total || returnItem.amount || 0), returnItem.reason || '']);
    }
  }
  for (const presale of data.presales.filter((item) => item.businessDate === date)) {
    const items = itemRows(presale.items);
    for (const item of (items.length ? items : [{}])) {
      rows.push(['Preventa', presale.createdAt || '', presale.ticketCode || presale.id || '', presale.status || '', presale.sellerName || presale.sellerEmail || '', presale.metadata?.suggestedPayment || '', item.name || '', item.sku || '', Number(item.quantity || 0), Number(item.total || presale.total || 0), presale.metadata?.notes || presale.customerName || presale.customerId || '']);
    }
  }
  return rows;
}

export function buildFinancialWorkbookSheets(data: FinancialWorkbookData): WorkbookSheet[] {
  const summaryRows: WorkbookCell[][] = [
    ['TIENDA-SS · ARCHIVO MAESTRO'],
    ['Empresa', data.tenant.name],
    ['Período incluido', `${data.period.fromDate} a ${data.period.toDate}`],
    ['Zona horaria de la empresa', data.tenant.timezone],
    ['Moneda', data.tenant.currency],
    [],
    ['Indicador', 'Total', 'Moneda'],
    ['Ventas netas', Number(data.totals.netSales || 0), data.tenant.currency],
    ['Ganancia bruta estimada', Number(data.totals.profit || 0), data.tenant.currency],
    ['Gastos', Number(data.totals.expenses || 0), data.tenant.currency],
    ['Créditos', Number(data.totals.credits || 0), data.tenant.currency],
    ['Devoluciones', Number(data.totals.returnsTotal || 0), data.tenant.currency],
    ['Ventas registradas', Number(data.totals.salesCount || 0), ''],
    [],
    ['El archivo incluye hojas detalladas de Ventas, Caja, Preventas, Gastos y Devoluciones, además de una pestaña por cada día del período.'],
    ['Las hojas diarias usan la zona horaria de la empresa. La ganancia es una estimación: ventas netas menos costo registrado de productos.'],
  ];
  const summary: WorkbookSheet = { name: 'Resumen', rows: summaryRows, headerRow: 6, titleRows: [0] };
  const dailySheets = data.daily.map((item) => ({
    name: item.date,
    rows: dailyEventRows(item.date, data),
    headerRow: 8,
    titleRows: [0],
  }));
  return [summary, buildSalesSheet(data), buildCashSheet(data), buildPresalesSheet(data), buildExpensesSheet(data), buildReturnsSheet(data), ...dailySheets];
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

type ZipEntry = { name: string; data: Uint8Array };

function zipStored(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;
  let centralSize = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const local = new Uint8Array(30 + nameBytes.length + entry.data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 33, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(entry.data, 30 + nameBytes.length);
    localChunks.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 33, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    central.set(nameBytes, 46);
    centralChunks.push(central);
    localOffset += local.length;
    centralSize += central.length;
  }

  const centralOffset = localOffset;
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  endView.setUint16(20, 0, true);

  const totalSize = localChunks.reduce((sum, chunk) => sum + chunk.length, 0) + centralSize + end.length;
  const output = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of localChunks) { output.set(chunk, offset); offset += chunk.length; }
  for (const chunk of centralChunks) { output.set(chunk, offset); offset += chunk.length; }
  output.set(end, offset);
  return output;
}

function workbookXml(sheets: WorkbookSheet[]): string {
  const sheetXml = sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${sheetXml}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
}

function workbookRelationshipsXml(sheets: WorkbookSheet[]): string {
  const sheetRelationships = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRelationships}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function contentTypesXml(sheets: WorkbookSheet[]): string {
  const worksheetTypes = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${worksheetTypes}</Types>`;
}

const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FF21442C"/><sz val="16"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF235339"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

export function createFinancialWorkbook(data: FinancialWorkbookData): Blob {
  const sheets = buildFinancialWorkbookSheets(data);
  if (sheets.length > 500) throw new Error('WORKBOOK_TOO_MANY_SHEETS');
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml(sheets)) },
    { name: '_rels/.rels', data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml(sheets)) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelationshipsXml(sheets)) },
    { name: 'xl/styles.xml', data: encoder.encode(STYLES_XML) },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: encoder.encode(worksheetXml(sheet)) })),
  ];
  const zip = zipStored(entries);
  return new Blob([zip.buffer as ArrayBuffer], { type: XLSX_MIME });
}
