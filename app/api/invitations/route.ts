import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { getEntitlementLimit, hasCapacity, entitlementLabel } from '@/lib/entitlements';
import { requireTenantPermission, tenantErrorResponse, type TenantRole } from '@/lib/tenant';
import {
  canAssignInvitationRole,
  canResendInvitation,
  createInvitationToken,
  hashInvitationToken,
  invitationExpiry,
  invitationUrl,
  isInvitationExpired,
  isInvitationRole,
  normalizeInvitationEmail,
  sendInvitationEmail,
  writeInvitationAudit,
  INVITATION_RESEND_COOLDOWN_MS,
} from '@/lib/invitations';

export const runtime = 'nodejs';
const INVITATION_RATE_LIMIT = 20;
const INVITATION_WINDOW_MS = 60 * 60 * 1000;
const invitationAttempts = new Map<string, { count: number; resetAt: number }>();

function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function errorResponse(error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
function consumeInvitationLimit(key: string): boolean {
  const now = Date.now();
  const current = invitationAttempts.get(key);
  if (!current || current.resetAt <= now) { invitationAttempts.set(key, { count: 1, resetAt: now + INVITATION_WINDOW_MS }); return true; }
  if (current.count >= INVITATION_RATE_LIMIT) return false;
  current.count += 1;
  return true;
}
function serializeInvitation(id: string, data: Record<string, unknown>) {
  return { id, email: data.email, role: data.role, status: data.status, expiresAt: data.expiresAt, createdAt: data.createdAt, acceptedAt: data.acceptedAt || null, revokedAt: data.revokedAt || null, resendCount: data.resendCount || 0 };
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'members', 'view');
    const snapshot = await getAdminDb().collection('tenants').doc(context.tenantId).collection('tenantInvitations').orderBy('createdAt', 'desc').limit(100).get();
    const now = Date.now();
    const invitations = snapshot.docs.map((doc) => {
      const data = doc.data();
      if (data.status === 'pending' && isInvitationExpired(data.expiresAt, now)) return { ...serializeInvitation(doc.id, data), status: 'expired' as const };
      return serializeInvitation(doc.id, data);
    });
    return NextResponse.json({ ok: true, invitations }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'members', 'create');
    if (!consumeInvitationLimit(`${context.tenantId}:${context.uid}`)) return NextResponse.json({ error: 'Demasiadas invitaciones. Intenta de nuevo más tarde.' }, { status: 429, headers: { 'Retry-After': '3600' } });
    const body = await request.json();
    const action = text(body.action, 20) || 'create';
    const invitationId = text(body.invitationId, 160);
    const db = getAdminDb();
    const tenantRef = db.collection('tenants').doc(context.tenantId);
    const tenantSnapshot = await tenantRef.get();
    const tenantData = tenantSnapshot.data() || {};
    const tenantName = text(tenantData.name, 120) || 'tu empresa';

    if (action === 'resend') {
      if (!invitationId) return NextResponse.json({ error: 'La invitación es obligatoria.' }, { status: 400 });
      const invitationRef = tenantRef.collection('tenantInvitations').doc(invitationId);
      const invitation = await invitationRef.get();
      if (!invitation.exists) return NextResponse.json({ error: 'La invitación no existe.' }, { status: 404 });
      const current = invitation.data() || {};
      if (current.status !== 'pending') return NextResponse.json({ error: 'Solo se pueden reenviar invitaciones pendientes.' }, { status: 409 });
      if (!canResendInvitation(current.lastSentAt)) return NextResponse.json({ error: 'Espera un minuto antes de reenviar esta invitación.' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(INVITATION_RESEND_COOLDOWN_MS / 1000)) } });
      const token = createInvitationToken();
      const expiresAt = invitationExpiry();
      await invitationRef.update({ tokenHash: hashInvitationToken(token), expiresAt, lastSentAt: new Date(), resendCount: Number(current.resendCount || 0) + 1, updatedAt: new Date(), updatedBy: context.uid });
      const delivery = await sendInvitationEmail(current.email, tenantName, current.role, invitationUrl(token));
      await writeInvitationAudit(context.tenantId, 'invitation.resent', { ...context, invitationId, email: current.email, metadata: { delivery } });
      return NextResponse.json({ ok: true, invitationId, expiresAt, delivery });
    }

    const email = normalizeInvitationEmail(body.email);
    const role = text(body.role, 40) as TenantRole;
    if (!/^\S+@\S+\.\S+$/.test(email) || !isInvitationRole(role)) return NextResponse.json({ error: 'Correo y rol válido son obligatorios.' }, { status: 400 });
    if (!canAssignInvitationRole(context.role, role)) return NextResponse.json({ error: 'No puedes asignar ese nivel de rol.' }, { status: 403 });
    const [activeMembers, pendingInvitations] = await Promise.all([
      tenantRef.collection('members').where('status', '==', 'active').count().get(),
      tenantRef.collection('tenantInvitations').where('status', '==', 'pending').count().get(),
    ]);
    const plan = tenantData.plan;
    const memberLimit = getEntitlementLimit(plan, 'members');
    if (!hasCapacity(plan, 'members', activeMembers.data().count + pendingInvitations.data().count)) return NextResponse.json({ error: `El plan actual admite hasta ${memberLimit} ${entitlementLabel('members')}, incluyendo invitaciones pendientes.` }, { status: 402 });
    const existingMember = await tenantRef.collection('members').where('email', '==', email).where('status', 'in', ['active', 'disabled']).limit(1).get();
    if (!existingMember.empty) return NextResponse.json({ error: 'Ese correo ya pertenece o perteneció a esta empresa.' }, { status: 409 });
    const existingInvitation = await tenantRef.collection('tenantInvitations').where('email', '==', email).where('status', '==', 'pending').limit(1).get();
    if (!existingInvitation.empty) return NextResponse.json({ error: 'Ya existe una invitación pendiente para ese correo.' }, { status: 409 });

    const token = createInvitationToken();
    const invitationRef = tenantRef.collection('tenantInvitations').doc();
    const expiresAt = invitationExpiry();
    await invitationRef.set({ email, role, status: 'pending', tokenHash: hashInvitationToken(token), expiresAt, createdAt: new Date(), createdBy: context.uid, lastSentAt: new Date(), resendCount: 0 });
    const delivery = await sendInvitationEmail(email, tenantName, role, invitationUrl(token));
    await writeInvitationAudit(context.tenantId, 'invitation.created', { ...context, invitationId: invitationRef.id, email, metadata: { role, delivery } });
    return NextResponse.json({ ok: true, invitation: { id: invitationRef.id, email, role, status: 'pending', expiresAt, delivery }, ...(process.env.NODE_ENV !== 'production' ? { invitationUrl: invitationUrl(token) } : {}) }, { status: 201 });
  } catch (error: unknown) { return errorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'members', 'delete');
    const body = await request.json();
    const invitationId = text(body.invitationId, 160);
    if (!invitationId) return NextResponse.json({ error: 'La invitación es obligatoria.' }, { status: 400 });
    const invitationRef = getAdminDb().collection('tenants').doc(context.tenantId).collection('tenantInvitations').doc(invitationId);
    const invitation = await invitationRef.get();
    if (!invitation.exists) return NextResponse.json({ error: 'La invitación no existe.' }, { status: 404 });
    if (invitation.data()?.status !== 'pending') return NextResponse.json({ error: 'Solo se pueden revocar invitaciones pendientes.' }, { status: 409 });
    await invitationRef.update({ status: 'revoked', revokedAt: new Date(), revokedBy: context.uid, updatedAt: new Date() });
    await writeInvitationAudit(context.tenantId, 'invitation.revoked', { ...context, invitationId, email: invitation.data()?.email });
    return NextResponse.json({ ok: true, invitationId, status: 'revoked' });
  } catch (error: unknown) { return errorResponse(error); }
}
