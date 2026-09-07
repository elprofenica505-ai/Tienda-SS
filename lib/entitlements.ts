export type PlanKey = 'starter' | 'growth' | 'scale';

export type EntitlementKey =
  | 'members'
  | 'products'
  | 'branches'
  | 'monthlySales'
  | 'storageBytes'
  | 'monthlyExports'
  | 'apiRequests'
  | 'premiumModules';

export type PlanLimits = Readonly<Record<EntitlementKey, number>>;

const GB = 1024 ** 3;

const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  starter: {
    members: 3,
    products: 100,
    branches: 1,
    monthlySales: 500,
    storageBytes: 2 * GB,
    monthlyExports: 10,
    apiRequests: 1_000,
    premiumModules: 0,
  },
  growth: {
    members: 15,
    products: 1_000,
    branches: 5,
    monthlySales: 5_000,
    storageBytes: 20 * GB,
    monthlyExports: 100,
    apiRequests: 25_000,
    premiumModules: 3,
  },
  scale: {
    members: Number.POSITIVE_INFINITY,
    products: Number.POSITIVE_INFINITY,
    branches: Number.POSITIVE_INFINITY,
    monthlySales: Number.POSITIVE_INFINITY,
    storageBytes: Number.POSITIVE_INFINITY,
    monthlyExports: Number.POSITIVE_INFINITY,
    apiRequests: Number.POSITIVE_INFINITY,
    premiumModules: Number.POSITIVE_INFINITY,
  },
};

const LABELS: Record<EntitlementKey, string> = {
  members: 'usuarios activos',
  products: 'productos activos',
  branches: 'sucursales',
  monthlySales: 'ventas mensuales',
  storageBytes: 'bytes de almacenamiento',
  monthlyExports: 'exportaciones mensuales',
  apiRequests: 'solicitudes API mensuales',
  premiumModules: 'módulos premium',
};

export function isPlanKey(value: unknown): value is PlanKey {
  return value === 'starter' || value === 'growth' || value === 'scale';
}

export function getPlanLimits(plan: unknown): PlanLimits {
  return isPlanKey(plan) ? PLAN_LIMITS[plan] : PLAN_LIMITS.starter;
}

export function getEntitlementLimit(plan: unknown, key: EntitlementKey): number {
  return getPlanLimits(plan)[key];
}

export function hasCapacity(plan: unknown, key: EntitlementKey, currentCount: number, increment = 1): boolean {
  if (!Number.isFinite(currentCount) || currentCount < 0 || !Number.isFinite(increment) || increment < 0) return false;
  return currentCount + increment <= getEntitlementLimit(plan, key);
}

export function entitlementLabel(key: EntitlementKey): string {
  return LABELS[key];
}

export function assertEntitlementCapacity(
  plan: unknown,
  key: EntitlementKey,
  currentCount: number,
  increment = 1,
): void {
  if (!hasCapacity(plan, key, currentCount, increment)) {
    const limit = getEntitlementLimit(plan, key);
    throw new Error(`ENTITLEMENT_EXCEEDED:${key}:${limit}`);
  }
}

export function planAllowsModule(plan: unknown, enabledPremiumModules: number): boolean {
  return hasCapacity(plan, 'premiumModules', enabledPremiumModules, 0);
}
