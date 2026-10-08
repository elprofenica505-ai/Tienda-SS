/**
 * Adaptador entre el contrato financiero real (`/api/reports`, `/api/stats/daily`)
 * y lo que pinta el módulo Resumen del workspace.
 *
 * Por qué existe: `/api/reports` entrega `summary.sales`, `summary.netProfit` y
 * `summary.averageTicket`, mientras que el dashboard antiguo leía `income`, `net`
 * y `averageSale`. Como esas llaves nunca existieron en la respuesta, `Number(undefined)`
 * caía en `NaN`/`0` y el Resumen mostraba todo en cero aun habiendo ventas.
 *
 * Estas funciones son puras y tolerantes: aceptan el contrato financiero actual y
 * también las llaves heredadas, de modo que ningún cambio de nombre vuelva a
 * silenciar los datos. Ninguna toca Caja, Finanzas ni Reportes.
 */

type JsonObject = Record<string, unknown>;

/** Ventas netas = ventas brutas menos devoluciones. Es la cifra del contrato financiero. */
export type DashboardSummary = {
  sales: number;
  grossSales: number;
  returns: number;
  costOfGoodsSold: number;
  grossProfit: number;
  expenses: number;
  /** Utilidad neta = margen bruto menos gastos operativos. */
  netProfit: number;
  averageTicket: number;
  openCredit: number;
  salesCount: number;
};

export type DashboardDailyPoint = {
  date: string;
  /** Ventas netas del día. Se expone como `income` por compatibilidad con la gráfica. */
  income: number;
  expenses: number;
  /** Utilidad neta del día. */
  net: number;
  salesCount: number;
};

export type DashboardDailyStats = {
  salesCount: number;
  salesTotal: number;
};

function record(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

/** Acepta número, número en texto o `null`; todo lo demás se convierte en 0 sin lanzar. */
export function toAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Lee la primera llave presente con un valor numérico finito. Se usa para aceptar
 * el contrato financiero (`sales`) y el heredado (`income`) sin duplicar ramas.
 */
function firstAmount(source: JsonObject, keys: readonly string[]): number | null {
  for (const key of keys) {
    if (!(key in source)) continue;
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

/**
 * Construye el resumen del Resumen a partir del payload de `/api/reports`.
 * Acepta el payload completo (`{ summary: {...} }`) o el objeto `summary` suelto.
 */
export function buildDashboardSummary(payload: unknown): DashboardSummary {
  const root = record(payload);
  const summary = record('summary' in root ? root.summary : root);

  const grossSales = firstAmount(summary, ['grossSales', 'gross_sales']) ?? toAmount(firstAmount(summary, ['sales']));
  const returns = firstAmount(summary, ['returns', 'returnsTotal']) ?? 0;
  const sales = firstAmount(summary, ['sales', 'netSales']) ?? grossSales - returns;
  const costOfGoodsSold = firstAmount(summary, ['costOfGoodsSold', 'cogs']) ?? 0;
  const grossProfit = firstAmount(summary, ['grossProfit']) ?? sales - costOfGoodsSold;
  const expenses = firstAmount(summary, ['expenses']) ?? 0;
  const netProfit = firstAmount(summary, ['netProfit', 'net']) ?? grossProfit - expenses;
  const salesCount = firstAmount(summary, ['salesCount', 'sales_count', 'count']) ?? 0;
  const averageTicket =
    firstAmount(summary, ['averageTicket', 'average_ticket', 'averageSale'])
    ?? (salesCount > 0 ? sales / salesCount : 0);

  return {
    sales,
    grossSales,
    returns,
    costOfGoodsSold,
    grossProfit,
    expenses,
    netProfit,
    averageTicket,
    openCredit: firstAmount(summary, ['openCredit', 'open_credit']) ?? 0,
    salesCount,
  };
}

/**
 * Normaliza las filas diarias para la gráfica de ingresos contra gastos.
 * Las filas financieras traen `sales`/`expenses`/`netProfit`; las heredadas
 * `income`/`expenses`/`net`.
 */
export function buildDashboardDaily(payload: unknown): DashboardDailyPoint[] {
  const root = record(payload);
  const rows = Array.isArray(payload) ? payload : Array.isArray(root.daily) ? root.daily : [];
  return rows
    .map((row) => {
      const item = record(row);
      const expenses = firstAmount(item, ['expenses']) ?? 0;
      const income = firstAmount(item, ['sales', 'income', 'netSales']) ?? 0;
      const salesCount = firstAmount(item, ['salesCount', 'sales_count']) ?? 0;
      return {
        date: typeof item.date === 'string' ? item.date : '',
        income,
        expenses,
        net: firstAmount(item, ['netProfit', 'net']) ?? income - expenses,
        salesCount,
      };
    })
    .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date))
    .sort((left, right) => left.date.localeCompare(right.date));
}

/** Valor máximo de la gráfica; nunca 0 para que las líneas no se dividan entre cero. */
export function dailyChartMax(daily: readonly DashboardDailyPoint[]): number {
  return Math.max(...daily.map((point) => Math.max(point.income, point.expenses)), 1);
}

/** Normaliza `stats` de `/api/stats/daily` sin asumir que venga completo. */
export function normalizeDailyStats(payload: unknown): DashboardDailyStats {
  const root = record(payload);
  const stats = record('stats' in root ? root.stats : root);
  return {
    salesCount: Math.max(0, Math.round(toAmount(firstAmount(stats, ['salesCount', 'sales_count', 'count'])))),
    salesTotal: toAmount(firstAmount(stats, ['salesTotal', 'sales_total', 'total'])),
  };
}

/** `YYYY-MM-DD` del día civil en una zona horaria; por defecto America/Managua. */
export function localDateKeyIn(value: Date | string, timeZone = 'America/Managua'): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  const key = `${part('year')}-${part('month')}-${part('day')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : '';
}

export function isValidLocalDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Offset de la zona horaria respecto a UTC en milisegundos para un instante dado. */
function timeZoneOffsetMs(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value || 0);
  const asUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour') === 24 ? 0 : part('hour'), part('minute'), part('second'));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Límites UTC de un día civil expresado en una zona horaria.
 *
 * El bug original calculaba "hoy" y la ventana del día en UTC. En Managua
 * (UTC-6) eso desplaza el corte seis horas: después de las 18:00 locales el
 * servidor ya estaba pidiendo las ventas del día siguiente y el Resumen
 * mostraba cero ventas de hoy.
 */
export function dayBoundsInTimeZone(dateKey: string, timeZone = 'America/Managua'): { from: string; until: string } {
  const startMs = Date.parse(`${dateKey}T00:00:00Z`);
  const endKey = shiftDateKey(dateKey, 1);
  const endMs = Date.parse(`${endKey}T00:00:00Z`);
  const from = startMs - timeZoneOffsetMs(timeZone, new Date(startMs));
  const until = endMs - timeZoneOffsetMs(timeZone, new Date(endMs));
  return { from: new Date(from).toISOString(), until: new Date(until).toISOString() };
}
