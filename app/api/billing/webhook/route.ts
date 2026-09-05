import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';
function subscriptionFields(subscription: Stripe.Subscription) { const item = subscription.items.data[0]; const priceId = item?.price.id || ''; const plan = Object.entries({ starter: process.env.STRIPE_PRICE_STARTER, growth: process.env.STRIPE_PRICE_GROWTH, scale: process.env.STRIPE_PRICE_SCALE }).find(([, value]) => value === priceId)?.[0] || 'starter'; return { plan, subscriptionStatus: subscription.status, stripeSubscriptionId: subscription.id, subscriptionCurrentPeriodEnd: new Date(item?.current_period_end ? item.current_period_end * 1000 : Date.now()), cancelAtPeriodEnd: subscription.cancel_at_period_end, updatedAt: new Date() }; }

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature'); const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: 'Webhook no configurado.' }, { status: 400 });
  try {
    const payload = await request.text(); const event = getStripe().webhooks.constructEvent(payload, signature, secret); const db = getAdminDb();
    if (event.type === 'checkout.session.completed') { const session = event.data.object as Stripe.Checkout.Session; const tenantId = session.metadata?.tenantId; if (tenantId && session.subscription) await db.collection('tenants').doc(tenantId).update({ stripeCustomerId: String(session.customer), stripeSubscriptionId: String(session.subscription), plan: session.metadata?.plan || 'starter', subscriptionStatus: 'active', updatedAt: new Date() }); }
    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') { const subscription = event.data.object as Stripe.Subscription; const tenantId = subscription.metadata?.tenantId; if (tenantId) await db.collection('tenants').doc(tenantId).update(subscriptionFields(subscription)); }
    if (event.type === 'customer.subscription.deleted') { const subscription = event.data.object as Stripe.Subscription; const tenantId = subscription.metadata?.tenantId; if (tenantId) await db.collection('tenants').doc(tenantId).update({ subscriptionStatus: 'canceled', cancelAtPeriodEnd: false, updatedAt: new Date() }); }
    if (event.type === 'invoice.payment_failed') { const invoice = event.data.object as Stripe.Invoice; const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id; if (customerId) { const tenantQuery = await db.collection('tenants').where('stripeCustomerId', '==', customerId).limit(1).get(); if (!tenantQuery.empty) await tenantQuery.docs[0].ref.update({ subscriptionStatus: 'past_due', updatedAt: new Date() }); } }
    return NextResponse.json({ received: true });
  } catch (error: unknown) { console.error('stripe_webhook_error', error instanceof Error ? error.message : 'unknown'); return NextResponse.json({ error: 'Firma de webhook inválida.' }, { status: 400 }); }
}
