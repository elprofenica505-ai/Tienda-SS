export const REPORT_PERIODS = [7, 30, 90, 365] as const;
export type ReportPeriodDays = (typeof REPORT_PERIODS)[number];

export type FinancialReportPeriod = {
  days: number;
  fromDate: string;
  toDate: string;
  from: string;
  to: string;
  timeZone: string;
  fromTime: string;
  toTime: string;
  dateKeys: string[];
};

export type FinancialHourlyRow = {
  hour: number;
  label: string;
  grossSales: number;
  returns: number;
  sales: number;
  costOfGoodsSold: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  salesCount: number;
};

export type FinancialSaleItemInput = {
  id: string;
  productId: string;
  warehouseId: string;
  productName: string;
  itemType: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type FinancialSaleInput = {
  id: string;
  branchId: string;
  invoiceNumber: string;
  status: string;
  total: number;
  createdAt: string;
  items: FinancialSaleItemInput[];
  payments: Array<{ paymentMethod: string; amount: number }>;
};

export type HistoricalCostMovementInput = {
  saleId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  unitCost: number;
};

export type FinancialReturnItemInput = {
  id: string;
  saleId: string;
  productId: string;
  warehouseId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type FinancialReturnInput = {
  id: string;
  saleId: string;
  invoiceNumber: string;
  refundMethod: string;
  amount: number;
  status: string;
  createdAt: string;
  items: FinancialReturnItemInput[];
};

export type FinancialExpenseInput = {
  id: string;
  branchId: string;
  description: string;
  category: string;
  paymentMethod: string;
  amount: number;
  createdAt: string;
};

export type FinancialCreditIssueInput = {
  id: string;
  saleId: string;
  saleNumber: string;
  customerName: string;
  originalAmount: number;
  outstandingAmount: number;
  status: string;
  createdAt: string;
};

export type FinancialCreditCollectionInput = {
  id: string;
  paymentId: string;
  saleId: string;
  saleNumber: string;
  customerName: string;
  receiptNumber: string;
  paymentMethod: string;
  amount: number;
  createdAt: string;
};

export type FinancialSaleLine = FinancialSaleItemInput & {
  historicalUnitCost: number | null;
  historicalCost: number;
  costedQuantity: number;
  missingCostQuantity: number;
  grossProfit: number;
};

export type FinancialSaleDetail = Omit<FinancialSaleInput, 'items'> & {
  date: string;
  historicalCost: number;
  grossProfit: number;
  missingCostLines: number;
  missingCostQuantity: number;
  items: FinancialSaleLine[];
};

export type FinancialReturnDetail = Omit<FinancialReturnInput, 'items'> & {
  date: string;
  historicalCostRecovered: number;
  missingCostLines: number;
  items: Array<FinancialReturnItemInput & {
    historicalUnitCost: number | null;
    historicalCostRecovered: number;
    missingCostQuantity: number;
  }>;
};

export type FinancialDailyRow = {
  date: string;
  grossSales: number;
  returns: number;
  sales: number;
  costOfGoodsSold: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  creditIssued: number;
  creditCollected: number;
  salesCount: number;
};

export type FinancialReportDataset = {
  period: FinancialReportPeriod;
  currency: string;
  branchId: string | null;
  daily: FinancialDailyRow[];
  hourly: FinancialHourlyRow[];
  summary: {
    grossSales: number;
    returns: number;
    sales: number;
    costOfGoodsSold: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
    creditIssued: number;
    creditCollected: number;
    openCredit: number;
    salesCount: number;
    averageTicket: number;
    costCoverage: number | null;
    costedLines: number;
    uncostedLines: number;
    missingCostQuantity: number;
  };
  sales: FinancialSaleDetail[];
  returns: FinancialReturnDetail[];
  expenses: FinancialExpenseInput[];
  creditIssues: FinancialCreditIssueInput[];
  creditCollections: FinancialCreditCollectionInput[];
  openReceivables: FinancialCreditIssueInput[];
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  paymentMethods: Array<{ method: string; total: number }>;
};

export type CalculateFinancialReportInput = {
  period: FinancialReportPeriod;
  currency?: string;
  branchId?: string | null;
  sales: FinancialSaleInput[];
  movements: HistoricalCostMovementInput[];
  returns: FinancialReturnInput[];
  expenses: FinancialExpenseInput[];
  creditIssues: FinancialCreditIssueInput[];
  creditCollections: FinancialCreditCollectionInput[];
  openReceivables: FinancialCreditIssueInput[];
};

type MovementCost = { quantity: number; totalCost: number };
type CalculatedLineCost = { unitCost: number | null; cost: number; costedQuantity: number; missingQuantity: number };

const DAY_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  const key = timeZone || 'America/Managua';
  let value = DAY_FORMATTERS.get(key);
  if (!value) {
    value = new Intl.DateTimeFormat('en-CA', {
      timeZone: key,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    DAY_FORMATTERS.set(key, value);
  }
  return value;
}

export function localDateKey(value: Date | string, timeZone = 'America/Managua'): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function localTimeKey(value: Date | string, timeZone = 'America/Managua'): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.hour}:${parts.minute}`;
}

export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function shiftDateKey(value: string, amount: number): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

function timeMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}

function validatedTimeRange(fromTime: string, toTime: string) {
  const start = timeMinutes(fromTime);
  const end = timeMinutes(toTime);
  if (start === null || end === null || start > end) throw new Error('REPORT_TIME_INVALID');
  return { fromTime, toTime, start, end };
}

function utcAtLocalTime(dateKey: string, time: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  const minutes = timeMinutes(time);
  if (minutes === null) throw new Error('REPORT_TIME_INVALID');
  const target = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60, 0);
  let instant = target;
  const partsFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  // Resolve the zone's offset iteratively instead of relying on the server's local TZ.
  for (let pass = 0; pass < 4; pass += 1) {
    const parts = Object.fromEntries(partsFormatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const delta = target - represented;
    if (delta === 0) break;
    instant += delta;
  }
  return new Date(instant);
}

function utcAtLocalMidnight(dateKey: string, timeZone: string): Date {
  return utcAtLocalTime(dateKey, '00:00', timeZone);
}

function dateKeysBetween(fromDate: string, toDate: string): string[] {
  const result: string[] = [];
  for (let key = fromDate; key <= toDate; key = shiftDateKey(key, 1)) result.push(key);
  return result;
}

function createPeriod(fromDate: string, toDate: string, timeZone: string, fromTime: string, toTime: string): FinancialReportPeriod {
  if (!isValidDateKey(fromDate) || !isValidDateKey(toDate)) throw new Error('REPORT_DATE_INVALID');
  if (fromDate > toDate) throw new Error('REPORT_PERIOD_INVALID');
  const times = validatedTimeRange(fromTime, toTime);
  const dateKeys = dateKeysBetween(fromDate, toDate);
  if (dateKeys.length > 365) throw new Error('REPORT_PERIOD_INVALID');
  return {
    days: dateKeys.length,
    fromDate,
    toDate,
    from: utcAtLocalMidnight(fromDate, timeZone).toISOString(),
    to: utcAtLocalMidnight(shiftDateKey(toDate, 1), timeZone).toISOString(),
    timeZone,
    fromTime: times.fromTime,
    toTime: times.toTime,
    dateKeys,
  };
}

export function createFinancialReportPeriod(
  days: number,
  timeZone = 'America/Managua',
  now = new Date(),
  fromTime = '00:00',
  toTime = '23:59',
): FinancialReportPeriod {
  if (!(REPORT_PERIODS as readonly number[]).includes(days)) throw new Error('REPORT_PERIOD_INVALID');
  const toDate = localDateKey(now, timeZone);
  const fromDate = shiftDateKey(toDate, -(days - 1));
  return createPeriod(fromDate, toDate, timeZone, fromTime, toTime);
}

export function createFinancialReportDay(
  date: string,
  timeZone = 'America/Managua',
  fromTime = '00:00',
  toTime = '23:59',
): FinancialReportPeriod {
  return createPeriod(date, date, timeZone, fromTime, toTime);
}

export function createFinancialReportRange(
  fromDate: string,
  toDate: string,
  timeZone = 'America/Managua',
  fromTime = '00:00',
  toTime = '23:59',
): FinancialReportPeriod {
  return createPeriod(fromDate, toDate, timeZone, fromTime, toTime);
}

function finiteNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundDecimal(value: number, precision: number): number {
  const scale = 10 ** precision;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function roundMoney(value: number): number {
  return roundDecimal(value, 2);
}

function movementKey(saleId: string, productId: string, warehouseId: string): string {
  return `${saleId}\u0000${productId}\u0000${warehouseId}`;
}

function createMovementCostIndex(movements: HistoricalCostMovementInput[]): Map<string, MovementCost> {
  const result = new Map<string, MovementCost>();
  for (const movement of movements) {
    const quantity = Math.abs(finiteNumber(movement.quantity));
    if (!quantity) continue;
    const key = movementKey(movement.saleId, movement.productId, movement.warehouseId);
    const current = result.get(key) || { quantity: 0, totalCost: 0 };
    current.quantity += quantity;
    current.totalCost += quantity * Math.max(0, finiteNumber(movement.unitCost));
    result.set(key, current);
  }
  return result;
}

function costForQuantity(
  index: Map<string, MovementCost>,
  saleId: string,
  productId: string,
  warehouseId: string,
  quantity: number,
  itemType = 'product',
): CalculatedLineCost {
  const safeQuantity = Math.max(0, finiteNumber(quantity));
  if (itemType === 'service') return { unitCost: 0, cost: 0, costedQuantity: safeQuantity, missingQuantity: 0 };
  const historical = index.get(movementKey(saleId, productId, warehouseId));
  if (!historical || historical.quantity <= 0) return { unitCost: null, cost: 0, costedQuantity: 0, missingQuantity: safeQuantity };
  const unitCost = historical.totalCost / historical.quantity;
  const costedQuantity = Math.min(safeQuantity, historical.quantity);
  return {
    unitCost,
    cost: roundMoney(costedQuantity * unitCost),
    costedQuantity,
    missingQuantity: Math.max(0, safeQuantity - costedQuantity),
  };
}

function emptyDay(date: string): FinancialDailyRow {
  return { date, grossSales: 0, returns: 0, sales: 0, costOfGoodsSold: 0, grossProfit: 0, expenses: 0, netProfit: 0, creditIssued: 0, creditCollected: 0, salesCount: 0 };
}

type HourAccumulator = FinancialHourlyRow;

function emptyHour(hour: number): HourAccumulator {
  return {
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    grossSales: 0,
    returns: 0,
    sales: 0,
    costOfGoodsSold: 0,
    grossProfit: 0,
    expenses: 0,
    netProfit: 0,
    salesCount: 0,
  };
}

function withinSelectedHours(value: string, period: FinancialReportPeriod): boolean {
  const localTime = localTimeKey(value, period.timeZone);
  const minute = timeMinutes(localTime);
  const start = timeMinutes(period.fromTime);
  const end = timeMinutes(period.toTime);
  return minute !== null && start !== null && end !== null && minute >= start && minute <= end;
}

function localHour(value: string, timeZone: string): number | null {
  const minute = timeMinutes(localTimeKey(value, timeZone));
  return minute === null ? null : Math.floor(minute / 60);
}

export function calculateFinancialReport(input: CalculateFinancialReportInput): FinancialReportDataset {
  const movementCosts = createMovementCostIndex(input.movements);
  const dayByDate = new Map(input.period.dateKeys.map((date) => [date, emptyDay(date)]));
  const startHour = Math.floor(timeMinutes(input.period.fromTime)! / 60);
  const endHour = Math.floor(timeMinutes(input.period.toTime)! / 60);
  const hourByTime = new Map(Array.from({ length: endHour - startHour + 1 }, (_, index) => {
    const hour = startHour + index;
    return [hour, emptyHour(hour)] as const;
  }));
  const sales: FinancialSaleDetail[] = [];
  const returns: FinancialReturnDetail[] = [];
  const productTotals = new Map<string, { name: string; quantity: number; revenue: number }>();
  const paymentTotals = new Map<string, number>();
  let costedLines = 0;
  let uncostedLines = 0;
  let missingCostQuantity = 0;

  for (const sale of input.sales) {
    if (!['completed', 'returned'].includes(sale.status) || !withinSelectedHours(sale.createdAt, input.period)) continue;
    const date = localDateKey(sale.createdAt, input.period.timeZone);
    const day = dayByDate.get(date);
    if (!day) continue;
    const hour = hourByTime.get(localHour(sale.createdAt, input.period.timeZone) ?? -1);
    const lines: FinancialSaleLine[] = sale.items.map((item) => {
      const lineRevenue = roundMoney(finiteNumber(item.lineTotal) || finiteNumber(item.quantity) * finiteNumber(item.unitPrice));
      const cost = costForQuantity(movementCosts, sale.id, item.productId, item.warehouseId, item.quantity, item.itemType);
      if (cost.missingQuantity > 0.00001) {
        uncostedLines += 1;
        missingCostQuantity += cost.missingQuantity;
      } else if (item.itemType !== 'service') {
        costedLines += 1;
      }
      const historicalUnitCost = cost.unitCost === null ? null : roundDecimal(cost.unitCost, 4);
      const historicalCost = cost.cost;
      const grossProfit = roundMoney(lineRevenue - historicalCost);
      const product = productTotals.get(item.productId) || { name: item.productName || 'Producto', quantity: 0, revenue: 0 };
      product.quantity += finiteNumber(item.quantity);
      product.revenue += lineRevenue;
      productTotals.set(item.productId, product);
      return { ...item, historicalUnitCost, historicalCost, costedQuantity: cost.costedQuantity, missingCostQuantity: cost.missingQuantity, grossProfit };
    });
    const historicalCost = roundMoney(lines.reduce((sum, item) => sum + item.historicalCost, 0));
    const grossProfit = roundMoney(finiteNumber(sale.total) - historicalCost);
    day.grossSales += finiteNumber(sale.total);
    day.costOfGoodsSold += historicalCost;
    day.salesCount += 1;
    if (hour) {
      hour.grossSales += finiteNumber(sale.total);
      hour.costOfGoodsSold += historicalCost;
      hour.salesCount += 1;
    }
    for (const payment of sale.payments) {
      const method = (payment.paymentMethod || 'other').toLowerCase();
      const amount = finiteNumber(payment.amount);
      // El crédito otorgado no es dinero recibido: sus abonos se contabilizan por separado abajo.
      if (method === 'credit' || amount <= 0) continue;
      paymentTotals.set(method, (paymentTotals.get(method) || 0) + amount);
    }
    sales.push({ ...sale, date, historicalCost, grossProfit, missingCostLines: lines.filter((item) => item.missingCostQuantity > 0.00001).length, missingCostQuantity: roundMoney(lines.reduce((sum, item) => sum + item.missingCostQuantity, 0)), items: lines });
  }

  for (const item of input.returns) {
    if (item.status !== 'completed' || !withinSelectedHours(item.createdAt, input.period)) continue;
    const date = localDateKey(item.createdAt, input.period.timeZone);
    const day = dayByDate.get(date);
    if (!day) continue;
    const hour = hourByTime.get(localHour(item.createdAt, input.period.timeZone) ?? -1);
    const lines = item.items.map((line) => {
      const cost = costForQuantity(movementCosts, line.saleId, line.productId, line.warehouseId, line.quantity);
      if (cost.missingQuantity > 0.00001) {
        uncostedLines += 1;
        missingCostQuantity += cost.missingQuantity;
      } else if (cost.unitCost !== null) {
        costedLines += 1;
      }
      return {
        ...line,
        historicalUnitCost: cost.unitCost === null ? null : roundDecimal(cost.unitCost, 4),
        historicalCostRecovered: cost.cost,
        missingCostQuantity: cost.missingQuantity,
      };
    });
    const historicalCostRecovered = roundMoney(lines.reduce((sum, line) => sum + line.historicalCostRecovered, 0));
    day.returns += finiteNumber(item.amount);
    day.costOfGoodsSold -= historicalCostRecovered;
    if (hour) {
      hour.returns += finiteNumber(item.amount);
      hour.costOfGoodsSold -= historicalCostRecovered;
    }
    returns.push({ ...item, date, historicalCostRecovered, missingCostLines: lines.filter((line) => line.missingCostQuantity > 0.00001).length, items: lines });
  }

  for (const expense of input.expenses) {
    if (!withinSelectedHours(expense.createdAt, input.period)) continue;
    const date = localDateKey(expense.createdAt, input.period.timeZone);
    const day = dayByDate.get(date);
    if (day) day.expenses += finiteNumber(expense.amount);
    const hour = hourByTime.get(localHour(expense.createdAt, input.period.timeZone) ?? -1);
    if (hour) hour.expenses += finiteNumber(expense.amount);
  }
  for (const issue of input.creditIssues) {
    if (!withinSelectedHours(issue.createdAt, input.period)) continue;
    const date = localDateKey(issue.createdAt, input.period.timeZone);
    const day = dayByDate.get(date);
    if (day) day.creditIssued += finiteNumber(issue.originalAmount);
  }
  for (const collection of input.creditCollections) {
    if (!withinSelectedHours(collection.createdAt, input.period)) continue;
    const date = localDateKey(collection.createdAt, input.period.timeZone);
    const day = dayByDate.get(date);
    const amount = Math.max(0, finiteNumber(collection.amount));
    if (day) day.creditCollected += amount;
    const method = (collection.paymentMethod || 'other').toLowerCase();
    if (amount > 0) paymentTotals.set(method, (paymentTotals.get(method) || 0) + amount);
  }

  const daily = Array.from(dayByDate.values()).map((row) => {
    const grossSales = roundMoney(row.grossSales);
    const returnAmount = roundMoney(row.returns);
    const salesAmount = roundMoney(grossSales - returnAmount);
    const costOfGoodsSold = roundMoney(row.costOfGoodsSold);
    const grossProfit = roundMoney(salesAmount - costOfGoodsSold);
    const expenses = roundMoney(row.expenses);
    return {
      ...row,
      grossSales,
      returns: returnAmount,
      sales: salesAmount,
      costOfGoodsSold,
      grossProfit,
      expenses,
      netProfit: roundMoney(grossProfit - expenses),
      creditIssued: roundMoney(row.creditIssued),
      creditCollected: roundMoney(row.creditCollected),
    };
  });

  const hourly = Array.from(hourByTime.values()).map((row) => {
    const grossSales = roundMoney(row.grossSales);
    const returns = roundMoney(row.returns);
    const sales = roundMoney(grossSales - returns);
    const costOfGoodsSold = roundMoney(row.costOfGoodsSold);
    const grossProfit = roundMoney(sales - costOfGoodsSold);
    const expenses = roundMoney(row.expenses);
    return {
      ...row,
      grossSales,
      returns,
      sales,
      costOfGoodsSold,
      grossProfit,
      expenses,
      netProfit: roundMoney(grossProfit - expenses),
    };
  });

  const sum = (select: (row: FinancialDailyRow) => number) => roundMoney(daily.reduce((total, row) => total + select(row), 0));
  const grossSales = sum((row) => row.grossSales);
  const returnAmount = sum((row) => row.returns);
  const salesAmount = sum((row) => row.sales);
  const costOfGoodsSold = sum((row) => row.costOfGoodsSold);
  const grossProfit = roundMoney(salesAmount - costOfGoodsSold);
  const expensesTotal = sum((row) => row.expenses);
  const openCredit = roundMoney(input.openReceivables.reduce((total, row) => total + Math.max(0, finiteNumber(row.outstandingAmount)), 0));
  const tradedLines = costedLines + uncostedLines;
  const summary = {
    grossSales,
    returns: returnAmount,
    sales: salesAmount,
    costOfGoodsSold,
    grossProfit,
    expenses: expensesTotal,
    netProfit: roundMoney(grossProfit - expensesTotal),
    creditIssued: sum((row) => row.creditIssued),
    creditCollected: sum((row) => row.creditCollected),
    openCredit,
    salesCount: daily.reduce((total, row) => total + row.salesCount, 0),
    averageTicket: daily.reduce((total, row) => total + row.salesCount, 0) ? roundMoney(grossSales / daily.reduce((total, row) => total + row.salesCount, 0)) : 0,
    costCoverage: tradedLines ? roundMoney((costedLines / tradedLines) * 10_000) / 100 : null,
    costedLines,
    uncostedLines,
    missingCostQuantity: roundMoney(missingCostQuantity),
  };

  return {
    period: input.period,
    currency: input.currency || 'NIO',
    branchId: input.branchId || null,
    daily,
    hourly,
    summary,
    sales: sales.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.invoiceNumber.localeCompare(b.invoiceNumber)),
    returns: returns.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    expenses: input.expenses.filter((expense) => withinSelectedHours(expense.createdAt, input.period)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    creditIssues: input.creditIssues.filter((issue) => withinSelectedHours(issue.createdAt, input.period)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    creditCollections: input.creditCollections.filter((collection) => withinSelectedHours(collection.createdAt, input.period)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    openReceivables: [...input.openReceivables],
    topProducts: Array.from(productTotals.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    paymentMethods: Array.from(paymentTotals, ([method, total]) => ({ method, total: roundMoney(total) })).sort((a, b) => b.total - a.total),
  };
}
