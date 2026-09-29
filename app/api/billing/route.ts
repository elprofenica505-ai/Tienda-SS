import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantMember, tenantErrorResponse, TenantRole } from '@/lib/tenant';
import { getAppUrl, getPriceId, getStripe, isPlanKey, plans } from '@/lib/stripe';
import { getPlanLimits } from '@/lib/entitlements';

export const runtime = 'nodejs';
const billingRoles: TenantRole[] = ['owner', 'admin'];
function errorResponse(error: unknown) { const response = tenantErrorResponse(error); if (error instanceof Error && error.message.startsWith('STRIPE_')) return NextResponse.json({ error: 'La facturación todavía no está configurada en el servidor.' }, { status: 503 }); return NextResponse.json(response.body, { status: response.status }); }
export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantMember(request); const supabase = getSupabaseServer();
    const tenant = await supabase.from('tenants').select('plan,subscription_status,subscription_current_period_end,cancel_at_period_end,stripe_customer_id').eq('id', context.tenantId).single(); if (tenant.error) throw new Error(tenant.error.message);
    const [members, products] = await Promise.all([supabase.from('members').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).eq('status', 'active'), supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).eq('active', true)]);
    if (members.error || products.error) throw new Error(members.error?.message || products.error?.message);
    const data = tenant.data; const plan = data.plan || 'starter';
    return NextResponse.json({ ok: true, plans, usage: { members: members.count || 0, products: products.count || 0 }, subscription: { plan, limits: getPlanLimits(plan), status: data.subscription_status || 'inactive', currentPeriodEnd: data.subscription_current_period_end || null, cancelAtPeriodEnd: Boolean(data.cancel_at_period_end), hasPaymentCustomer: Boolean(data.stripe_customer_id) } });
  } catch (error: unknown) { return errorResponse(error); }
}
export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantMember(request, billingRoles); const body = await request.json(); const action = body.action; const supabase = getSupabaseServer();
    const tenantResult = await supabase.from('tenants').select('name,stripe_customer_id').eq('id', context.tenantId).single(); if (tenantResult.error) throw new Error(tenantResult.error.message); const tenant = tenantResult.data; const stripe = getStripe();
    if (action === 'checkout') {
      if (!isPlanKey(body.plan)) return NextResponse.json({ error: 'Plan inválido.' }, { status: 400 });
      let customerId = tenant.stripe_customer_id || '';
      if (!customerId) { const customer = await stripe.customers.create({ name: tenant.name, metadata: { tenantId: context.tenantId } }); customerId = customer.id; const update = await supabase.from('tenants').update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() }).eq('id', context.tenantId); if (update.error) throw new Error(update.error.message); }
      const idempotencyKey = request.headers.get('idempotency-key')?.trim().slice(0, 255) || request.headers.get('x-correlation-id')?.trim().slice(0, 255);
      const session = await stripe.checkout.sessions.create({ mode: 'subscription', customer: customerId, line_items: [{ price: getPriceId(body.plan), quantity: 1 }], success_url: `${getAppUrl()}/workspace/billing?success=1`, cancel_url: `${getAppUrl()}/workspace/billing?canceled=1`, metadata: { tenantId: context.tenantId, plan: body.plan }, subscription_data: { metadata: { tenantId: context.tenantId, plan: body.plan } } }, idempotencyKey ? { idempotencyKey } : undefined);
      return NextResponse.json({ ok: true, url: session.url });
    }
    if (action === 'portal') { if (!tenant.stripe_customer_id) return NextResponse.json({ error: 'Todavía no existe un cliente de facturación.' }, { status: 400 }); const session = await stripe.billingPortal.sessions.create({ customer: tenant.stripe_customer_id, return_url: `${getAppUrl()}/workspace/billing` }); return NextResponse.json({ ok: true, url: session.url }); }
    return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 });
  } catch (error: unknown) { return errorResponse(error); }
}
