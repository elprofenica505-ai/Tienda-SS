import { entitlementLabel, getEntitlementLimit, hasCapacity, type EntitlementKey } from '@/lib/entitlements';

export function entitlementErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  if (code.startsWith('ENTITLEMENT_EXCEEDED:')) {
    const [, key, rawLimit] = code.split(':');
    return { status: 402, body: { error: `El plan actual admite hasta ${rawLimit} ${entitlementLabel(key as EntitlementKey)}. Actualiza tu plan para continuar.`, code: 'ENTITLEMENT_EXCEEDED', entitlement: key, limit: Number(rawLimit) } };
  }
  return null;
}
export function assertPlanCapacity(plan: unknown, key: EntitlementKey, currentCount: number, increment = 1) { if (!hasCapacity(plan, key, currentCount, increment)) throw new Error(`ENTITLEMENT_EXCEEDED:${key}:${getEntitlementLimit(plan, key)}`); }
export function assertApiAccess(plan: unknown) { assertPlanCapacity(plan, 'apiAccess', 0, 1); }
export function assertPremiumModuleCapacity(plan: unknown, enabledModules: number, increment = 1) { assertPlanCapacity(plan, 'premiumModules', enabledModules, increment); }
export function subscriptionAllowsWrites(status: unknown): boolean { return status === 'active' || status === 'trialing'; }
