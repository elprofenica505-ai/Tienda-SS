import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantMember, tenantErrorResponse, TenantRole } from '@/lib/tenant';
import { getAppUrl, getPriceId, getStripe, isPlanKey, plans } from '@/lib/stripe';

export const runtime = 'nodejs';
const billingRoles: TenantRole[] = ['owner', 'admin'];
function errorResponse(error: unknown) { const response = tenantErrorResponse(error); if (error instanceof Error && error.message.startsWith('STRIPE_')) return NextResponse.json({ error: 'La facturación todavía no está configurada en el servidor.' }, { status: 503 }); return NextResponse.json(response.body, { status: response.status }); }

export async function GET(request: NextRequest) {
  try { const context = await requireTenantMember(request); const tenant = await getAdminDb().collection('tenants').doc(context.tenantId).get(); const data = tenant.data() || {}; return NextResponse.json({ ok: true, plans, subscription: { plan: data.plan || 'starter', status: data.subscriptionStatus || 'inactive', currentPeriodEnd: data.subscriptionCurrentPeriodEnd || null, cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd), hasPaymentCustomer: Boolean(data.stripeCustomerId) } }); }
  catch (error: unknown) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantMember(request, billingRoles); const body = await request.json(); const action = body.action; const tenantRef = getAdminDb().collection('tenants').doc(context.tenantId); const tenantSnapshot = await tenantRef.get(); const tenant = tenantSnapshot.data() || {}; const stripe = getStripe();
    if (action === 'checkout') {
      if (!isPlanKey(body.plan)) return NextResponse.json({ error: 'Plan inválido.' }, { status: 400 });
      let customerId = typeof tenant.stripeCustomerId === 'string' ? tenant.stripeCustomerId : '';
      if (!customerId) { const customer = await stripe.customers.create({ name: tenant.name, metadata: { tenantId: context.tenantId } }); customerId = customer.id; await tenantRef.update({ stripeCustomerId: customerId, updatedAt: new Date() }); }
      const session = await stripe.checkout.sessions.create({ mode: 'subscription', customer: customerId, line_items: [{ price: getPriceId(body.plan), quantity: 1 }], success_url: `${getAppUrl()}/workspace/billing?success=1`, cancel_url: `${getAppUrl()}/workspace/billing?canceled=1`, metadata: { tenantId: context.tenantId, plan: body.plan }, subscription_data: { metadata: { tenantId: context.tenantId, plan: body.plan } } });
      return NextResponse.json({ ok: true, url: session.url });
    }
    if (action === 'portal') { if (!tenant.stripeCustomerId) return NextResponse.json({ error: 'Todavía no existe un cliente de facturación.' }, { status: 400 }); const session = await stripe.billingPortal.sessions.create({ customer: tenant.stripeCustomerId, return_url: `${getAppUrl()}/workspace/billing` }); return NextResponse.json({ ok: true, url: session.url }); }
    return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 });
  } catch (error: unknown) { return errorResponse(error); }
}
