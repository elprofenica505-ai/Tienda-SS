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

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function ean13Pattern(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 13 || ean13CheckDigit(digits.slice(0, 12)) !== digits[12]) return null;
  const parity = EAN_PARITY[Number(digits[0])];
  let pattern = '101';
  for (let index = 1; index <= 6; index += 1) pattern += (parity[index - 1] === 'L' ? EAN_L : EAN_G)[Number(digits[index])];
  pattern += '01010';
  for (let index = 7; index <= 12; index += 1) pattern += EAN_R[Number(digits[index])];
  return `${pattern}101`;
}

export function ean13Svg(value: string, productName: string, price: string): string {
  const pattern = ean13Pattern(value);
  if (!pattern) return `<div class="text-only"><strong>${productName}</strong><span>${value}</span><b>${price}</b></div>`;
  const bars = Array.from(pattern).map((bit, index) => `<rect x="${index * 2}" y="0" width="2" height="62" fill="${bit === '1' ? '#111' : '#fff'}"/>`).join('');
  return `<div><strong>${productName}</strong><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pattern.length * 2} 62" role="img" aria-label="Código ${value}">${bars}</svg><span>${value}</span><b>${price}</b></div>`;
}
