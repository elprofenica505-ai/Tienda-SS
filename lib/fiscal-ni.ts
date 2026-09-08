export const NICARAGUA_CURRENCY = 'NIO';
export const DEFAULT_IVA_RATE = 0.15;

export type FiscalDocumentType = 'invoice' | 'credit_note' | 'debit_note';

export type FiscalSaleFields = {
  documentType: FiscalDocumentType;
  customerName: string;
  customerRuc: string;
  customerAddress: string;
  taxRate: number;
  taxableBase: number;
  exemptAmount: number;
  taxAmount: number;
  total: number;
  currency: typeof NICARAGUA_CURRENCY;
};

export function fiscalText(value: unknown, max = 180): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function fiscalMoney(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value * 100) / 100) : 0;
}

export function normalizeTaxRate(value: unknown, fallback = DEFAULT_IVA_RATE): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return fallback;
  return Math.round(value * 10_000) / 10_000;
}

export function createFiscalSaleFields(input: Record<string, unknown>, subtotal: number, discount: number): FiscalSaleFields {
  const documentType = input.documentType === 'credit_note' || input.documentType === 'debit_note' ? input.documentType : 'invoice';
  const customerName = fiscalText(input.customerName, 120);
  const customerRuc = fiscalText(input.customerRuc, 40).toUpperCase();
  const customerAddress = fiscalText(input.customerAddress, 240);
  const taxRate = normalizeTaxRate(input.taxRate);
  const taxableBase = fiscalMoney(Math.max(0, subtotal - discount));
  const exemptAmount = fiscalMoney(input.exemptAmount);
  const taxAmount = fiscalMoney(taxableBase * taxRate);
  const total = fiscalMoney(taxableBase + taxAmount + exemptAmount);
  return { documentType, customerName, customerRuc, customerAddress, taxRate, taxableBase, exemptAmount, taxAmount, total, currency: NICARAGUA_CURRENCY };
}

export function formatFiscalNumber(prefix: string, sequence: number): string {
  const safePrefix = fiscalText(prefix, 20).replace(/[^A-Z0-9-]/gi, '').toUpperCase() || 'FAC';
  return `${safePrefix}-${String(Math.max(1, sequence)).padStart(8, '0')}`;
}

export function validateFiscalFields(fields: FiscalSaleFields): string | null {
  if (!fields.customerName) return null;
  if (fields.customerRuc && !/^[A-Z0-9-]{4,40}$/.test(fields.customerRuc)) return 'El RUC o identificador fiscal del cliente no es válido.';
  if (fields.taxRate < 0 || fields.taxRate > 1) return 'La tasa fiscal debe estar entre 0 y 1.';
  return null;
}
