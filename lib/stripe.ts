import Stripe from 'stripe';

let stripeClient: Stripe | null = null;
export const plans = {
  starter: { name: 'Starter', priceEnv: 'STRIPE_PRICE_STARTER', description: 'Para comenzar a organizar la operación.' },
  growth: { name: 'Growth', priceEnv: 'STRIPE_PRICE_GROWTH', description: 'Para equipos que necesitan más control.' },
  scale: { name: 'Scale', priceEnv: 'STRIPE_PRICE_SCALE', description: 'Para operaciones multiárea en crecimiento.' }
} as const;
export type PlanKey = keyof typeof plans;
export function getStripe() { const key = process.env.STRIPE_SECRET_KEY; if (!key) throw new Error('STRIPE_NOT_CONFIGURED'); if (!stripeClient) stripeClient = new Stripe(key); return stripeClient; }
export function isPlanKey(value: unknown): value is PlanKey { return typeof value === 'string' && value in plans; }
export function getPriceId(plan: PlanKey) { const value = process.env[plans[plan].priceEnv]; if (!value) throw new Error(`STRIPE_PRICE_NOT_CONFIGURED:${plan}`); return value; }
export function getAppUrl() { return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, ''); }
