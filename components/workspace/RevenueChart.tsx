type Daily = { date: string; income: number; expenses: number; net: number };

type RevenueChartProps = { daily: Daily[]; maxValue: number; money: (value: number) => string };

function points(values: number[], maxValue: number) {
  return values.map((value, index) => {
    const x = values.length <= 1 ? 50 : (index / (values.length - 1)) * 100;
    const y = 94 - (value / maxValue) * 78;
    return { x, y: Math.max(7, y) };
  });
}

function pointString(values: number[], maxValue: number) {
  return points(values, maxValue).map((point) => `${point.x},${point.y}`).join(' ');
}

export function RevenueChart({ daily, maxValue, money }: RevenueChartProps) {
  const income = daily.map((item) => item.income);
  const expenses = daily.map((item) => item.expenses);
  const incomePoints = points(income, maxValue);
  const expensePoints = points(expenses, maxValue);
  const incomeArea = `0,94 ${pointString(income, maxValue)} 100,94`;
  const expenseArea = `0,94 ${pointString(expenses, maxValue)} 100,94`;
  const last = daily[daily.length - 1];

  return <div className="revenue-chart" role="img" aria-label="Gráfica de ingresos y gastos de los últimos 30 días"><div className="chart-legend-pro"><span><i className="legend-dot income" />Ingresos</span><span><i className="legend-dot expenses" />Gastos</span><b>{last ? `Hoy ${money(last.income)}` : 'Sin datos'}</b></div><div className="chart-visual"><div className="chart-y-labels"><span>{money(maxValue)}</span><span>{money(maxValue / 2)}</span><span>$0</span></div><div className="chart-stage"><div className="chart-grid-lines"><i /><i /><i /><i /></div><svg viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="income-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#b9eb72" stopOpacity=".42" /><stop offset="1" stopColor="#b9eb72" stopOpacity="0" /></linearGradient><linearGradient id="expense-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#e6ae78" stopOpacity=".22" /><stop offset="1" stopColor="#e6ae78" stopOpacity="0" /></linearGradient></defs><polygon points={incomeArea} fill="url(#income-fill)" /><polygon points={expenseArea} fill="url(#expense-fill)" /><polyline className="chart-line income-line" points={pointString(income, maxValue)} /><polyline className="chart-line expenses-line" points={pointString(expenses, maxValue)} />{incomePoints.filter((_, index) => index === incomePoints.length - 1).map((point) => <circle className="chart-point" cx={point.x} cy={point.y} r="2.3" key={`${point.x}-${point.y}`} />)}</svg><div className="chart-x-labels"><span>Hace 30 días</span><span>Hace 15 días</span><span>Hoy</span></div></div></div></div>;
}
