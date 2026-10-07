export type CrmScoreSignal = { label: string; points: number };
export type CrmScoringInput = { purchases: number; spend: number; lastQuoteDays: number | null; hasOpenQuote: boolean; overdue: number; contactComplete: boolean };
export function calculateCrmScore(input: CrmScoringInput) {
  const signals: CrmScoreSignal[] = [];
  if (input.purchases >= 4) signals.push({ label: `Compró ${input.purchases} veces este año`, points: 30 });
  else if (input.purchases > 0) signals.push({ label: `Compró ${input.purchases} ${input.purchases === 1 ? 'vez' : 'veces'} este año`, points: input.purchases * 6 });
  if (input.spend >= 50000) signals.push({ label: 'Volumen de compra alto', points: 20 });
  else if (input.spend >= 15000) signals.push({ label: 'Volumen de compra medio', points: 10 });
  if (input.hasOpenQuote && input.lastQuoteDays !== null) {
    const points = input.lastQuoteDays <= 3 ? 18 : input.lastQuoteDays <= 7 ? 12 : 6;
    signals.push({ label: `Cotización abierta hace ${input.lastQuoteDays} días`, points });
  }
  if (input.overdue === 0 && input.purchases > 0) signals.push({ label: 'Sin cuentas vencidas', points: 10 });
  if (input.contactComplete) signals.push({ label: 'Datos de contacto completos', points: 8 });
  return { total: Math.min(100, signals.reduce((total, signal) => total + signal.points, 0)), signals };
}
export function crmScoreExplanation(score: ReturnType<typeof calculateCrmScore>): string {
  return score.signals.length ? score.signals.map((signal) => `${signal.label} (+${signal.points})`).join(' · ') : 'Sin señales suficientes';
}
