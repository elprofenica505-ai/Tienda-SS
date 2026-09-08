export type CsvRow = Record<string, string>;

function stripFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function parseCsv(input: string, maxRows = 500): { headers: string[]; rows: CsvRow[]; errors: string[] } {
  const source = input.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"' && quoted && next === '"') { field += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(field); field = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field); field = '';
      if (row.some((value) => value.trim())) records.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  if (quoted) return { headers: [], rows: [], errors: ['El CSV contiene una comilla sin cerrar.'] };
  if (field || row.length) { row.push(field); if (row.some((value) => value.trim())) records.push(row); }
  if (!records.length) return { headers: [], rows: [], errors: ['El CSV está vacío.'] };
  const headers = records[0].map((value) => value.trim().toLowerCase());
  const errors: string[] = [];
  if (new Set(headers).size !== headers.length) errors.push('El CSV contiene encabezados duplicados.');
  const rows = records.slice(1, maxRows + 1).map((values, rowIndex) => {
    if (values.length !== headers.length) errors.push(`La fila ${rowIndex + 2} tiene un número de columnas inválido.`);
    return headers.reduce<CsvRow>((result, header, index) => { result[header] = stripFormula((values[index] || '').trim()); return result; }, {});
  });
  if (records.length - 1 > maxRows) errors.push(`El archivo supera el máximo de ${maxRows} filas.`);
  return { headers, rows, errors };
}

export function csvNumber(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const normalized = value.replace(/\s/g, '').replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}
