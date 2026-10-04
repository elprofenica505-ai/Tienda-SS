export type FinancialSaleFact = {
  id: string;
  createdAt: string;
  status: string;
  total: number;
  creditAmount?: number;
  paymentMethod?: string;
  payments?: Array<{ method: string; amount: number }>;
};

export type FinancialReturnFact = {
  id: string;
  saleId: string;
  createdAt: string;
  amount: number;
  refundMethod?: string;
};

export type FinancialExpenseFact = {
  createdAt: string;
  amount: number;
};

export type FinancialCostFact = {
  saleId: string;
  productId: string;
  quantity: number;
  unitCost: number;
};

export type FinancialReturnItemFact = {
  returnId: string;
  productId: string;
  quantity: number;
};

export type FinancialDay = {
  date: string;
  netSales: number;
  profit: number;
  expenses: number;
  credits: number;
};

export type FinancialTotals = {
  netSales: number;
  profit: number;
  expenses: number;
  credits: number;
  salesCount: number;
};

export type FinancialSummary = {
  daily: FinancialDay[];
  totals: FinancialTotals;
};

function amount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function creditAmount(sale: FinancialSaleFact): number {
  const fromPayments = (sale.payments || [])
    .filter((payment) => payment.method === 'credit')
    .reduce((sum, payment) => sum + Math.max(0, amount(payment.amount)), 0);
  if (sale.payments?.length) return fromPayments;
  if (Number.isFinite(sale.creditAmount)) return Math.max(0, amount(sale.creditAmount));
  return sale.paymentMethod === 'credit' ? Math.max(0, amount(sale.total)) : 0;
}

/** Builds daily net sales, estimated gross profit, expenses and credit sales. */
export function summarizeFinancialDays(input: {
  dates: string[];
  sales: FinancialSaleFact[];
  returns: FinancialReturnFact[];
  expenses: FinancialExpenseFact[];
  costs: FinancialCostFact[];
  returnedItems: FinancialReturnItemFact[];
  dateOf: (instant: string) => string;
}): FinancialSummary {
  const dailyByDate = new Map<string, FinancialDay>();
  for (const date of input.dates) {
    dailyByDate.set(date, { date, netSales: 0, profit: 0, expenses: 0, credits: 0 });
  }

  const costBySale = new Map<string, number>();
  const unitCostBySaleProduct = new Map<string, { cost: number; quantity: number }>();
  for (const cost of input.costs) {
    const quantity = Math.abs(amount(cost.quantity));
    const unitCost = Math.max(0, amount(cost.unitCost));
    if (!cost.saleId || !cost.productId || quantity <= 0 || unitCost <= 0) continue;
    costBySale.set(cost.saleId, (costBySale.get(cost.saleId) || 0) + quantity * unitCost);
    const key = `${cost.saleId}:${cost.productId}`;
    const previous = unitCostBySaleProduct.get(key) || { cost: 0, quantity: 0 };
    unitCostBySaleProduct.set(key, {
      cost: previous.cost + quantity * unitCost,
      quantity: previous.quantity + quantity,
    });
  }

  const saleById = new Map(input.sales.map((sale) => [sale.id, sale]));
  const remainingCreditBySale = new Map(input.sales.map((sale) => [sale.id, creditAmount(sale)]));
  const saleCounted = new Set<string>();

  for (const sale of input.sales) {
    if (sale.status === 'voided') continue;
    const row = dailyByDate.get(input.dateOf(sale.createdAt));
    if (!row) continue;
    const net = amount(sale.total);
    row.netSales += net;
    row.profit += net - (costBySale.get(sale.id) || 0);
    row.credits += creditAmount(sale);
    saleCounted.add(sale.id);
  }

  const returnById = new Map(input.returns.map((item) => [item.id, item]));
  for (const item of input.returnedItems) {
    const relatedReturn = returnById.get(item.returnId);
    if (!relatedReturn) continue;
    const sale = saleById.get(relatedReturn.saleId);
    if (!sale || sale.status === 'voided') continue;
    const returnedQuantity = Math.max(0, amount(item.quantity));
    if (returnedQuantity <= 0) continue;
    const key = `${sale.id}:${item.productId}`;
    const originalCost = unitCostBySaleProduct.get(key);
    if (!originalCost || originalCost.quantity <= 0) continue;
    const averageUnitCost = originalCost.cost / originalCost.quantity;
    const row = dailyByDate.get(input.dateOf(relatedReturn.createdAt));
    if (row) row.profit += returnedQuantity * averageUnitCost;
  }

  for (const returned of input.returns) {
    const sale = saleById.get(returned.saleId);
    if (sale?.status === 'voided') continue;
    const row = dailyByDate.get(input.dateOf(returned.createdAt));
    if (!row) continue;
    const refund = Math.max(0, amount(returned.amount));
    row.netSales -= refund;
    row.profit -= refund;
    if (returned.refundMethod === 'credit') {
      const remainingCredit = Math.max(0, remainingCreditBySale.get(returned.saleId) || 0);
      const creditReduction = Math.min(refund, remainingCredit);
      row.credits -= creditReduction;
      remainingCreditBySale.set(returned.saleId, remainingCredit - creditReduction);
    }
  }

  for (const expense of input.expenses) {
    const row = dailyByDate.get(input.dateOf(expense.createdAt));
    if (row) row.expenses += Math.max(0, amount(expense.amount));
  }

  const daily = Array.from(dailyByDate.values()).map((row) => ({
    date: row.date,
    netSales: roundMoney(row.netSales),
    profit: roundMoney(row.profit),
    expenses: roundMoney(row.expenses),
    credits: roundMoney(row.credits),
  }));

  return {
    daily,
    totals: {
      netSales: roundMoney(daily.reduce((sum, row) => sum + row.netSales, 0)),
      profit: roundMoney(daily.reduce((sum, row) => sum + row.profit, 0)),
      expenses: roundMoney(daily.reduce((sum, row) => sum + row.expenses, 0)),
      credits: roundMoney(daily.reduce((sum, row) => sum + row.credits, 0)),
      salesCount: saleCounted.size,
    },
  };
}
