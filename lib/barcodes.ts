export function ean13CheckDigit(firstTwelve: string): string {
  const digits = firstTwelve.replace(/\D/g, '').slice(0, 12).padStart(12, '0');
  const sum = digits.split('').reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

export function generateProductBarcode(): string {
  const random = Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, '0');
  const base = `200${random}`;
  return `${base}${ean13CheckDigit(base)}`;
}

export function normalizeBarcode(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[^0-9A-Za-z-]/g, '').trim().slice(0, 32).toUpperCase() : '';
}
