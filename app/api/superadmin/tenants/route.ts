import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireSuperadmin, superadminErrorResponse } from '@/lib/superadmin';
import { getPriceId, getStripe, isPlanKey, PlanKey } from '@/lib/stripe';
import { notifyTenant } from '@/lib/notifications';

export const runtime = 'nodejs';
function text(value: unknown, max = 120) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
async function audit(uid: string, tenantId: string, action: string, details: Record<string, unknown>) { await getAdminDb().collection('platformAudit').add({ actorUid: uid, tenantId, action, details, createdAt: new Date() }); }

export async function GET(request: NextRequest) {
  try { await requireSuperadmin(request); const snapshot = await getAdminDb().collection('tenants').orderBy('createdAt', 'desc').limit(200).get(); return NextResponse.json({ ok: true, tenants: snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>) })) }); }
  catch (error: unknown) { const response = superadminErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireSuperadmin(request); const body = await request.json(); const tenantId = text(body.tenantId); const action = text(body.action); if (!tenantId) return NextResponse.json({ error: 'Tenant inválido.' }, { status: 400 });
    const tenantRef = getAdminDb().collection('tenants').doc(tenantId); const snapshot = await tenantRef.get(); if (!snapshot.exists) return NextResponse.json({ error: 'Tenant no encontrado.' }, { status: 404 }); const current = snapshot.data() || {};
    if (action === 'suspend' || action === 'activate') { const platformStatus = action === 'suspend' ? 'suspended' : 'active'; await tenantRef.update({ platformStatus, moderatedAt: new Date(), moderatedBy: actor.uid, updatedAt: new Date() }); await audit(actor.uid, tenantId, action, { previousStatus: current.platformStatus || 'active' }); if (action === 'suspend') await notifyTenant(tenantId, 'subscription_updated', 'Empresa suspendida', 'El acceso de tu empresa fue suspendido por un administrador de la plataforma. Contacta soporte para revisar el caso.', { platformStatus }); return NextResponse.json({ ok: true, tenantId, platformStatus }); }
    if (action === 'change_plan') { const plan = body.plan as PlanKey; if (!isPlanKey(plan)) return NextResponse.json({ error: 'Plan inválido.' }, { status: 400 }); const subscriptionId = text(current.stripeSubscriptionId); if (subscriptionId) { const stripe = getStripe(); await stripe.subscriptions.update(subscriptionId, { items: [{ id: (await stripe.subscriptions.retrieve(subscriptionId)).items.data[0].id, price: getPriceId(plan) }], proration_behavior: 'create_prorations' }); } await tenantRef.update({ plan, planManagedBy: 'superadmin', planChangedAt: new Date(), planChangedBy: actor.uid, updatedAt: new Date() }); await audit(actor.uid, tenantId, action, { previousPlan: current.plan || 'starter', plan, stripeSynchronized: Boolean(subscriptionId) }); return NextResponse.json({ ok: true, tenantId, plan, stripeSynchronized: Boolean(subscriptionId) }); }
    return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 });
  } catch (error: unknown) { const message = error instanceof Error ? error.message : ''; if (message.startsWith('STRIPE_')) return NextResponse.json({ error: 'Stripe no está configurado para cambiar este plan automáticamente.' }, { status: 503 }); const response = superadminErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
