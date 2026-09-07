import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export const plans = {
  starter: { name: 'Starter', priceEnv: 'STRIPE_PRICE_STARTER', description: 'Para comenzar a organizar la operación.' },
  growth: { name: 'Growth', priceEnv: 'STRIPE_PRICE_GROWTH', description: 'Para equipos que necesitan más control.' },
  scale: { name: 'Scale', priceEnv: 'STRIPE_PRICE_SCALE', description: 'Para operaciones multiárea en crecimiento.' },
} as const;

export type PlanKey = keyof typeof plans;
export type SubscriptionEventType = 'customer.subscription.created' | 'customer.subscription.updated' | 'customer.subscription.deleted';

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_NOT_CONFIGURED');
  if (!stripeClient) stripeClient = new Stripe(key);
  return stripeClient;
}

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === 'string' && value in plans;
}

export function getPriceId(plan: PlanKey) {
  const value = process.env[plans[plan].priceEnv];
  if (!value) throw new Error(`STRIPE_PRICE_NOT_CONFIGURED:${plan}`);
  return value;
}

export function getAppUrl() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function isSubscriptionEvent(type: string): type is SubscriptionEventType {
  return type === 'customer.subscription.created' || type === 'customer.subscription.updated' || type === 'customer.subscription.deleted';
}

export function shouldApplyEvent(lastAppliedCreated: unknown, incomingCreated: number): boolean {
  const previous = typeof lastAppliedCreated === 'number' ? lastAppliedCreated : 0;
  return incomingCreated >= previous;
}

export function failedEventRetryable(data: { status?: unknown; retryCount?: unknown; processingStartedAt?: unknown }, now = Date.now()): boolean {
  if (data.status === 'failed') return Number(data.retryCount || 0) < 10;
  if (data.status !== 'processing') return true;
  const started = data.processingStartedAt instanceof Date ? data.processingStartedAt.getTime() : Number(data.processingStartedAt || 0);
  return !Number.isFinite(started) || now - started > 10 * 60 * 1000;
}
