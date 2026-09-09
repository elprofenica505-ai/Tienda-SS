export type TenantCurrency = 'NIO' | 'USD' | string;

export const DEFAULT_TENANT_CURRENCY = 'NIO';
export const DEFAULT_TENANT_SYMBOL = 'C$';
export const DEFAULT_TENANT_LOCALE = 'es-NI';

export function normalizeCurrency(value: unknown): TenantCurrency {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : DEFAULT_TENANT_CURRENCY;
}

export function currencySymbol(currency: unknown): string {
  return normalizeCurrency(currency) === 'NIO' ? DEFAULT_TENANT_SYMBOL : '$';
}

export function formatMoney(value: number, currency: unknown = DEFAULT_TENANT_CURRENCY, locale?: string): string {
  const normalized = normalizeCurrency(currency);
  return new Intl.NumberFormat(locale || (normalized === 'NIO' ? DEFAULT_TENANT_LOCALE : 'en-US'), {
    style: 'currency',
    currency: normalized,
    currencyDisplay: 'symbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}
