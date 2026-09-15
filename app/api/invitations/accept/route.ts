import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { entitlementLabel } from '@/lib/entitlements';
import type { TenantRole } from '@/lib/tenant';
import { hashInvitationToken, invitationUrl, isInvitationExpired, normalizeInvitationEmail, writeInvitationAudit } from '@/lib/invitations';

export const runtime = 'nodejs';

function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function bearer(request: NextRequest): string { const header = request.headers.get('authorization') || ''; return header.startsWith('Bearer ') ? header.slice(7).trim() : ''; }

async function findInvitation(token: string) {
  const result = await getSupabaseServer().from('tenant_invitations').select('id,tenant_id,email,role,status,expires_at').eq('token_hash', hashInvitationToken(token)).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
async function findAuthUserByEmail(email: string) {
  const result = await getSupabaseServer().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (result.error) throw new Error(result.error.message);
  return (result.data.users || []).find((item) => item.email?.toLowerCase() === email) || null;
}

export async function GET(request: NextRequest) {
  try {
    const token = text(request.nextUrl.searchParams.get('token'), 240);
    if (!token) return NextResponse.json({ error: 'El token de invitación es obligatorio.' }, { status: 400 });
    const invitation = await findInvitation(token);
    if (!invitation) return NextResponse.json({ error: 'La invitación no existe o el enlace ya no es válido.' }, { status: 404 });
    if (invitation.status !== 'pending' || isInvitationExpired(invitation.expires_at)) return NextResponse.json({ error: 'La invitación está vencida, revocada o ya fue utilizada.' }, { status: 410 });
    return NextResponse.json({ ok: true, invitation: { email: invitation.email, role: invitation.role, expiresAt: invitation.expires_at } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se pudo consultar la invitación.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = text(body.token, 240);
    const email = normalizeInvitationEmail(body.email);
    const name = text(body.name, 120);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!token) return NextResponse.json({ error: 'El token de invitación es obligatorio.' }, { status: 400 });
    const invitation = await findInvitation(token);
    if (!invitation) return NextResponse.json({ error: 'La invitación no existe o el enlace ya no es válido.' }, { status: 404 });
    if (invitation.status !== 'pending' || isInvitationExpired(invitation.expires_at)) return NextResponse.json({ error: 'La invitación está vencida, revocada o ya fue utilizada.' }, { status: 410 });
    if (email && email !== invitation.email) return NextResponse.json({ error: 'El correo no coincide con la invitación.' }, { status: 403 });

    const supabase = getSupabaseServer();
    const tokenFromAuth = bearer(request);
    let uid = '';
    if (tokenFromAuth) {
      const authenticated = await supabase.auth.getUser(tokenFromAuth);
      if (authenticated.error || !authenticated.data.user) return NextResponse.json({ error: 'La sesión no es válida.' }, { status: 401 });
      if (authenticated.data.user.email?.toLowerCase() !== invitation.email) return NextResponse.json({ error: 'La cuenta autenticada no coincide con la invitación.' }, { status: 403 });
      uid = authenticated.data.user.id;
    } else {
      if (password.length < 8 || name.length < 2) return NextResponse.json({ error: 'Nombre y contraseña de al menos 8 caracteres son obligatorios.' }, { status: 400 });
      const existing = await findAuthUserByEmail(invitation.email);
      if (existing) return NextResponse.json({ error: 'Ese correo ya tiene una cuenta. Inicia sesión y acepta la invitación con tu sesión activa.', uid: existing.id }, { status: 409 });
      const created = await supabase.auth.admin.createUser({ email: invitation.email, password, user_metadata: { display_name: name }, email_confirm: false });
      if (created.error || !created.data.user) throw new Error(created.error?.message || 'SUPABASE_AUTH_CREATE_FAILED');
      uid = created.data.user.id;
    }

    const accepted = await supabase.rpc('accept_tenant_invitation', { target_token_hash: hashInvitationToken(token), target_user_id: uid, target_name: name });
    if (accepted.error) throw new Error(accepted.error.message);
    const result = accepted.data as Record<string, unknown>;
    await writeInvitationAudit(String(result.tenantId), 'invitation.accepted', { uid, tenantId: String(result.tenantId), invitationId: String(result.invitationId), email: invitation.email, role: String(result.role) as TenantRole, metadata: { role: invitation.role } });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    const code = error instanceof Error ? error.message : '';
    if (code.includes('INVITATION_NOT_AVAILABLE')) return NextResponse.json({ error: 'La invitación ya fue utilizada o dejó de estar disponible.' }, { status: 409 });
    if (code.includes('INVITATION_EMAIL_MISMATCH')) return NextResponse.json({ error: 'La cuenta autenticada no coincide con la invitación.' }, { status: 403 });
    if (code.includes('ALREADY_MEMBER')) return NextResponse.json({ error: 'La cuenta ya pertenece a esta empresa.' }, { status: 409 });
    if (code.includes('ENTITLEMENT_EXCEEDED:members:')) return NextResponse.json({ error: `El plan actual admite hasta ${code.split(':')[2]} ${entitlementLabel('members')}. Actualiza tu plan para aceptar más usuarios.` }, { status: 402 });
    console.error('invitation_accept_error', { code });
    return NextResponse.json({ error: 'No se pudo aceptar la invitación.' }, { status: 500 });
  }
}
