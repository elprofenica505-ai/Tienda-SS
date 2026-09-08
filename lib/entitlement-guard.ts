import type { Firestore } from 'firebase-admin/firestore';
import { entitlementLabel, getEntitlementLimit, hasCapacity, type EntitlementKey } from '@/lib/entitlements';

export function entitlementErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  if (code.startsWith('ENTITLEMENT_EXCEEDED:')) {
    const [, key, rawLimit] = code.split(':');
    return { status: 402, body: { error: `El plan actual admite hasta ${rawLimit} ${entitlementLabel(key as EntitlementKey)}. Actualiza tu plan para continuar.`, code: 'ENTITLEMENT_EXCEEDED', entitlement: key, limit: Number(rawLimit) } };
  }
  return null;
}

export function assertPlanCapacity(plan: unknown, key: EntitlementKey, currentCount: number, increment = 1) {
  if (!hasCapacity(plan, key, currentCount, increment)) {
    throw new Error(`ENTITLEMENT_EXCEEDED:${key}:${getEntitlementLimit(plan, key)}`);
  }
}

export function assertApiAccess(plan: unknown) {
  assertPlanCapacity(plan, 'apiAccess', 0, 1);
}

export function assertPremiumModuleCapacity(plan: unknown, enabledModules: number, increment = 1) {
  assertPlanCapacity(plan, 'premiumModules', enabledModules, increment);
}

/** Atomically consumes a monthly entitlement counter after reading the tenant's current plan. */
export async function consumeMonthlyEntitlement(
  db: Firestore,
  tenantId: string,
  key: 'monthlySales' | 'monthlyExports' | 'apiRequests',
  increment = 1,
  month = new Date().toISOString().slice(0, 7),
) {
  if (!Number.isInteger(increment) || increment <= 0) throw new Error('INVALID_ENTITLEMENT_INCREMENT');
  const tenantRef = db.collection('tenants').doc(tenantId);
  const usageRef = tenantRef.collection('entitlementUsage').doc(month);
  return db.runTransaction(async (transaction) => {
    const [tenantSnapshot, usageSnapshot] = await Promise.all([transaction.get(tenantRef), transaction.get(usageRef)]);
    const plan = tenantSnapshot.data()?.plan;
    const current = Number(usageSnapshot.data()?.[key] || 0);
    assertPlanCapacity(plan, key, current, increment);
    const next = current + increment;
    transaction.set(usageRef, { [key]: next, month, updatedAt: new Date() }, { merge: true });
    return { plan, current, next, limit: getEntitlementLimit(plan, key) };
  });
}

export function subscriptionAllowsWrites(status: unknown): boolean {
  return status === 'active' || status === 'trialing';
}
