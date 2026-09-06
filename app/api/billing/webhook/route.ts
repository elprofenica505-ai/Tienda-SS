import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import type { DocumentReference } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getStripe } from '@/lib/stripe';
import { notifyTenant } from '@/lib/notifications';
import { logEvent } from '@/lib/observability';

export const runtime = 'nodejs';
function subscriptionFields(subscription: Stripe.Subscription) { const item = subscription.items.data[0]; const priceId = item?.price.id || ''; const plan = Object.entries({ starter: process.env.STRIPE_PRICE_STARTER, growth: process.env.STRIPE_PRICE_GROWTH, scale: process.env.STRIPE_PRICE_SCALE }).find(([, value]) => value === priceId)?.[0] || 'starter'; return { plan, subscriptionStatus: subscription.status, stripeSubscriptionId: subscription.id, subscriptionCurrentPeriodEnd: new Date(item?.current_period_end ? item.current_period_end * 1000 : Date.now()), cancelAtPeriodEnd: subscription.cancel_at_period_end, updatedAt: new Date() }; }
async function tenantByCustomer(customer: string) { const snapshot = await getAdminDb().collection('tenants').where('stripeCustomerId', '==', customer).limit(1).get(); return snapshot.empty ? null : snapshot.docs[0].ref; }
function currencyAmount(value: number | null | undefined) { return typeof value === 'number' ? (value / 100).toFixed(2) : '0.00'; }

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature'); const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: 'Webhook no configurado.' }, { status: 400 });
  let eventRef: DocumentReference | undefined;
  try {
    const payload = await request.text(); const event = getStripe().webhooks.constructEvent(payload, signature, secret); const db = getAdminDb(); eventRef = db.collection('billingEvents').doc(event.id); const existing = await eventRef.get();
    if (existing.exists && existing.data()?.status === 'processed') return NextResponse.json({ received: true, duplicate: true });
    if (existing.exists && existing.data()?.status === 'processing') return NextResponse.json({ received: true, duplicate: true });
    if (existing.exists) await eventRef.update({ type: event.type, status: 'processing', retryCount: Number(existing.data()?.retryCount || 0) + 1, processingStartedAt: new Date(), updatedAt: new Date() });
    else await eventRef.create({ eventId: event.id, type: event.type, status: 'processing', retryCount: 0, receivedAt: new Date(), processingStartedAt: new Date() });
    if (event.type === 'checkout.session.completed') { const session = event.data.object as Stripe.Checkout.Session; const tenantId = session.metadata?.tenantId; if (tenantId && session.subscription) await db.collection('tenants').doc(tenantId).update({ stripeCustomerId: String(session.customer), stripeSubscriptionId: String(session.subscription), plan: session.metadata?.plan || 'starter', subscriptionStatus: 'active', updatedAt: new Date() }); }
    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') { const subscription = event.data.object as Stripe.Subscription; const tenantId = subscription.metadata?.tenantId; if (tenantId) await db.collection('tenants').doc(tenantId).update(subscriptionFields(subscription)); }
    if (event.type === 'customer.subscription.deleted') { const subscription = event.data.object as Stripe.Subscription; const tenantId = subscription.metadata?.tenantId; if (tenantId) { await db.collection('tenants').doc(tenantId).update({ subscriptionStatus: 'canceled', cancelAtPeriodEnd: false, updatedAt: new Date() }); await notifyTenant(tenantId, 'subscription_updated', 'Suscripción cancelada', 'La suscripción de tu empresa fue cancelada. Revisa el plan y la facturación para reactivarla.', { eventId: event.id }); } }
    if (event.type === 'invoice.payment_failed') { const invoice = event.data.object as Stripe.Invoice; const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id; if (customerId) { const tenantRef = await tenantByCustomer(customerId); if (tenantRef) { await tenantRef.update({ subscriptionStatus: 'past_due', lastPaymentFailureAt: new Date(), updatedAt: new Date() }); await notifyTenant(tenantRef.id, 'payment_failed', 'Pago de suscripción fallido', `No pudimos procesar el cobro de tu suscripción por $${currencyAmount(invoice.amount_due)}. Actualiza tu método de pago para evitar una interrupción.`, { eventId: event.id, invoiceId: invoice.id }); } } }
    if (event.type === 'invoice.upcoming') { const invoice = event.data.object as Stripe.Invoice; const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id; if (customerId) { const tenantRef = await tenantByCustomer(customerId); if (tenantRef) { await notifyTenant(tenantRef.id, 'renewal_upcoming', 'Próxima renovación de suscripción', `Tu suscripción se renovará próximamente por $${currencyAmount(invoice.amount_due)}. Verifica que tu método de pago esté actualizado.`, { eventId: event.id, invoiceId: invoice.id, dueDate: invoice.due_date || null }); } } }
    await eventRef.update({ type: event.type, status: 'processed', processedAt: new Date(), updatedAt: new Date() }); return NextResponse.json({ received: true });
  } catch (error: unknown) { if (eventRef) { try { await eventRef.update({ status: 'failed', failedAt: new Date(), error: error instanceof Error ? error.message.slice(0, 500) : 'unknown', updatedAt: new Date() }); } catch { logEvent('error', 'stripe_webhook_event_update_failed', { eventId: eventRef.id }); } } logEvent('error', 'stripe_webhook_error', { message: error instanceof Error ? error.message : 'unknown' }); return NextResponse.json({ error: 'No se pudo procesar el webhook.' }, { status: 500 }); }
}
