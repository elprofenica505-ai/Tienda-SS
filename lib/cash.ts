import { getAdminDb } from '@/lib/firebaseAdmin';

export const CASH_METHODS = ['cash', 'card', 'transfer'] as const;
export type CashMethod = typeof CASH_METHODS[number];
export type CashSessionStatus = 'open' | 'counting' | 'pending_review' | 'closed';

export function cashMoney(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(0, value) * 100) / 100 : 0;
}

function signedMoney(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

export function validCashMethod(value: unknown): value is CashMethod {
  return typeof value === 'string' && (CASH_METHODS as readonly string[]).includes(value);
}

export async function findOpenCashSession(tenantId: string, branchId: string, registerId?: string) {
  const snapshot = await getAdminDb().collection('tenants').doc(tenantId).collection('cashSessions')
    .where('branchId', '==', branchId).where('status', '==', 'open').orderBy('openedAt', 'desc').limit(20).get();
  const doc = snapshot.docs.find((item) => !registerId || item.data()?.registerId === registerId);
  return doc ? { id: doc.id, ...doc.data() } : null;
}

export function expectedByMethod(rows: readonly Record<string, unknown>[]): Record<CashMethod, number> {
  return rows.reduce<Record<CashMethod, number>>((result, row) => {
    const method = validCashMethod(row.paymentMethod) ? row.paymentMethod : null;
    if (!method) return result;
    const direction = row.direction === 'out' || row.type === 'expense' ? -1 : 1;
    result[method] = signedMoney(Number(result[method]) + direction * cashMoney(row.amount));
    return result;
  }, { cash: 0, card: 0, transfer: 0 } as Record<CashMethod, number>);
}

export function cashDifference(expected: Record<CashMethod, number>, counted: Record<CashMethod, number>) {
  const signed = (value: number) => Math.round(value * 100) / 100;
  return signed((counted.cash || 0) - (expected.cash || 0)) + signed((counted.card || 0) - (expected.card || 0)) + signed((counted.transfer || 0) - (expected.transfer || 0));
}
