import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { hashInvitationToken, invitationUrl, isInvitationExpired, normalizeInvitationEmail, writeInvitationAudit } from '@/lib/invitations';

export const runtime = 'nodejs';

function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }

function bearer(request: NextRequest): string {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

export async function GET(request: NextRequest) {
  const token = text(request.nextUrl.searchParams.get('token'), 240);
  if (!token) return NextResponse.json({ error: 'El token de invitación es obligatorio.' }, { status: 400 });
  const snapshot = await getAdminDb().collectionGroup('tenantInvitations').where('tokenHash', '==', hashInvitationToken(token)).limit(1).get();
  if (snapshot.empty) return NextResponse.json({ error: 'La invitación no existe o el enlace ya no es válido.' }, { status: 404 });
  const invitation = snapshot.docs[0].data();
  if (invitation.status !== 'pending' || isInvitationExpired(invitation.expiresAt)) return NextResponse.json({ error: 'La invitación está vencida, revocada o ya fue utilizada.' }, { status: 410 });
  return NextResponse.json({ ok: true, invitation: { email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt } }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = text(body.token, 240);
    const email = normalizeInvitationEmail(body.email);
    const name = text(body.name, 120);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!token) return NextResponse.json({ error: 'El token de invitación es obligatorio.' }, { status: 400 });

    const db = getAdminDb();
    const snapshot = await db.collectionGroup('tenantInvitations').where('tokenHash', '==', hashInvitationToken(token)).limit(1).get();
    if (snapshot.empty) return NextResponse.json({ error: 'La invitación no existe o el enlace ya no es válido.' }, { status: 404 });
    const invitationDoc = snapshot.docs[0];
    const invitation = invitationDoc.data();
    if (invitation.status !== 'pending' || isInvitationExpired(invitation.expiresAt)) return NextResponse.json({ error: 'La invitación está vencida, revocada o ya fue utilizada.' }, { status: 410 });
    if (email && email !== invitation.email) return NextResponse.json({ error: 'El correo no coincide con la invitación.' }, { status: 403 });

    const tokenFromAuth = bearer(request);
    let uid = '';
    if (tokenFromAuth) {
      const decoded = await getAdminAuth().verifyIdToken(tokenFromAuth);
      if (decoded.email?.toLowerCase() !== invitation.email) return NextResponse.json({ error: 'La cuenta autenticada no coincide con la invitación.' }, { status: 403 });
      uid = decoded.uid;
    } else {
      if (password.length < 8 || name.length < 2) return NextResponse.json({ error: 'Nombre y contraseña de al menos 8 caracteres son obligatorios.' }, { status: 400 });
      try {
        const existing = await getAdminAuth().getUserByEmail(invitation.email);
        return NextResponse.json({ error: 'Ese correo ya tiene una cuenta. Inicia sesión y acepta la invitación con tu sesión activa.', uid: existing.uid }, { status: 409 });
      } catch (error: unknown) {
        if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
        const created = await getAdminAuth().createUser({ email: invitation.email, password, displayName: name, disabled: false, emailVerified: false });
        uid = created.uid;
      }
    }

    const tenantRef = db.doc(invitationDoc.ref.path.split('/tenantInvitations/')[0]);
    const memberRef = tenantRef.collection('members').doc(uid);
    await db.runTransaction(async (transaction) => {
      const [freshInvitation, existingMember] = await Promise.all([transaction.get(invitationDoc.ref), transaction.get(memberRef)]);
      const fresh = freshInvitation.data() || {};
      if (!freshInvitation.exists || fresh.status !== 'pending' || isInvitationExpired(fresh.expiresAt)) throw new Error('INVITATION_NOT_AVAILABLE');
      if (existingMember.exists && ['active', 'disabled'].includes(existingMember.data()?.status)) throw new Error('ALREADY_MEMBER');
      const now = new Date();
      transaction.set(memberRef, { uid, tenantId: tenantRef.id, name: name || invitation.email.split('@')[0], email: invitation.email, role: fresh.role, status: 'active', createdBy: fresh.createdBy, invitedAt: fresh.createdAt, acceptedAt: now, updatedAt: now }, { merge: true });
      transaction.update(invitationDoc.ref, { status: 'accepted', acceptedAt: now, acceptedBy: uid, updatedAt: now });
    });

    await writeInvitationAudit(tenantRef.id, 'invitation.accepted', { uid, tenantId: tenantRef.id, invitationId: invitationDoc.id, email: invitation.email, metadata: { role: invitation.role } });
    return NextResponse.json({ ok: true, tenantId: tenantRef.id, uid, status: 'accepted' });
  } catch (error: unknown) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'INVITATION_NOT_AVAILABLE') return NextResponse.json({ error: 'La invitación ya fue utilizada o dejó de estar disponible.' }, { status: 409 });
    if (code === 'ALREADY_MEMBER') return NextResponse.json({ error: 'La cuenta ya pertenece a esta empresa.' }, { status: 409 });
    if (code === 'UNAUTHENTICATED') return NextResponse.json({ error: 'La sesión no es válida.' }, { status: 401 });
    console.error('invitation_accept_error', { code });
    return NextResponse.json({ error: 'No se pudo aceptar la invitación.' }, { status: 500 });
  }
}
