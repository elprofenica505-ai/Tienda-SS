import type { TenantAIContext } from '@/lib/ai/context';

export type VisualBar = { label: string; value: number };

export type VisualPie = { label: string; value: number };

export type AssistantVisual = {
  bars: { title: string; items: VisualBar[] } | null;
  pie: { title: string; items: VisualPie[] } | null;
  table: { title: string; columns: string[]; rows: Array<Array<string | number>> } | null;
};

function shortDate(date: string): string {
  const match = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-') : null;
  return match ? `${match[2]}/${match[1]}` : date;
}

export function buildAssistantVisuals(context: Pick<TenantAIContext, 'analysis'>): AssistantVisual | null {
  const analysis = context.analysis;
  if (!analysis) return null;
  const bars = analysis.daily.length ? { title: `Ventas por día (${analysis.daily.length} días)`, items: analysis.daily.map((row) => ({ label: shortDate(row.date), value: row.sales })) } : null;
  const pieItems = analysis.paymentMethods.filter((item) => item.total > 0).map((item) => ({ label: item.method, value: item.total }));
  const pie = pieItems.length ? { title: 'Ingresos por método de pago', items: pieItems } : null;
  let table: AssistantVisual['table'] = null;
  if (analysis.topProducts.length) {
    const totalRevenue = analysis.topProducts.reduce((sum, item) => sum + item.revenue, 0);
    table = { title: 'Cuadro comparativo — top productos (30 días)', columns: ['Producto', 'Unidades', 'Ingreso', '% del top'], rows: analysis.topProducts.map((item) => [item.name, item.quantity, item.revenue, totalRevenue > 0 ? `${Math.round((item.revenue / totalRevenue) * 100)}%` : '—']) };
  } else if (analysis.todayVsYesterday) {
    const t = analysis.todayVsYesterday;
    table = { title: 'Cuadro comparativo — hoy vs ayer', columns: ['Concepto', 'Hoy', 'Ayer'], rows: [['Ventas', t.todaySales, t.yesterdaySales], ['Utilidad neta', t.todayNet, t.yesterdayNet]] };
  }
  if (!bars && !pie && !table) return null;
  return { bars, pie, table };
}
