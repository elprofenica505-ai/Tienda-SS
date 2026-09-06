import type { PlanKey } from '@/lib/stripe';

export type EntitlementKey = 'members' | 'products';

type PlanLimits = Record<EntitlementKey, number>;

const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  starter: { members: 3, products: 100 },
  growth: { members: 15, products: 1_000 },
  scale: { members: Number.POSITIVE_INFINITY, products: Number.POSITIVE_INFINITY },
};

export function getPlanLimits(plan: unknown): PlanLimits {
  return PLAN_LIMITS[plan as PlanKey] || PLAN_LIMITS.starter;
}

export function getEntitlementLimit(plan: unknown, key: EntitlementKey): number {
  return getPlanLimits(plan)[key];
}

export function hasCapacity(plan: unknown, key: EntitlementKey, currentCount: number): boolean {
  return currentCount < getEntitlementLimit(plan, key);
}

export function entitlementLabel(key: EntitlementKey): string {
  return key === 'members' ? 'usuarios activos' : 'productos activos';
}
