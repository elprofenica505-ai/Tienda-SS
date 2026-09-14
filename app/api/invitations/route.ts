import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { assertPlanCapacity } from '@/lib/entitlement-guard';
import { requireTenantPermission, tenantErrorResponse, type TenantRole } from '@/lib/tenant';
import { canAssignInvitationRole, canResendInvitation, createInvitationToken, hashInvitationToken, invitationExpiry, invitationUrl, isInvitationExpired, isInvitationRole, normalizeInvitationEmail, sendInvitationEmail, writeInvitationAudit, INVITATION_RESEND_COOLDOWN_MS } from '@/lib/invitations';

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
function serializeInvitation(row: Record<string, any>) {
  return { id: row.id, email: row.email, role: row.role, status: row.status, expiresAt: row.expires_at, createdAt: row.created_at, acceptedAt: row.accepted_at || null, revokedAt: row.revoked_at || null, resendCount: row.resend_count || 0 };
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'members', 'view');
    const result = await getSupabaseServer().from('tenant_invitations').select('*').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(100);
    if (result.error) throw new Error(result.error.message);
    const now = Date.now();
    const invitations = (result.data || []).map((row) => {
      const item = serializeInvitation(row as Record<string, any>);
      return item.status === 'pending' && isInvitationExpired(item.expiresAt, now) ? { ...item, status: 'expired' as const } : item;
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
    const supabase = getSupabaseServer();
    const tenantResult = await supabase.from('tenants').select('name, plan').eq('id', context.tenantId).single();
    if (tenantResult.error) throw new Error(tenantResult.error.message);
    const tenantName = text(tenantResult.data.name, 120) || 'tu empresa';

    if (action === 'resend') {
      if (!invitationId) return NextResponse.json({ error: 'La invitación es obligatoria.' }, { status: 400 });
      const current = await supabase.from('tenant_invitations').select('*').eq('tenant_id', context.tenantId).eq('id', invitationId).maybeSingle();
      if (current.error) throw new Error(current.error.message);
      if (!current.data) return NextResponse.json({ error: 'La invitación no existe.' }, { status: 404 });
      if (current.data.status !== 'pending') return NextResponse.json({ error: 'Solo se pueden reenviar invitaciones pendientes.' }, { status: 409 });
      if (!canResendInvitation(current.data.last_sent_at)) return NextResponse.json({ error: 'Espera un minuto antes de reenviar esta invitación.' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(INVITATION_RESEND_COOLDOWN_MS / 1000)) } });
      const token = createInvitationToken();
      const expiresAt = invitationExpiry().toISOString();
      const update = await supabase.from('tenant_invitations').update({ token_hash: hashInvitationToken(token), expires_at: expiresAt, last_sent_at: new Date().toISOString(), resend_count: Number(current.data.resend_count || 0) + 1, updated_at: new Date().toISOString() }).eq('tenant_id', context.tenantId).eq('id', invitationId);
      if (update.error) throw new Error(update.error.message);
      const delivery = await sendInvitationEmail(current.data.email, tenantName, current.data.role, invitationUrl(token));
      await writeInvitationAudit(context.tenantId, 'invitation.resent', { ...context, invitationId, email: current.data.email, metadata: { delivery, role: current.data.role } });
      return NextResponse.json({ ok: true, invitationId, expiresAt, delivery, ...(delivery === 'sent' ? {} : { warning: 'El correo no pudo enviarse. Comparte el enlace de invitación por un canal seguro.', invitationUrl: invitationUrl(token) }) });
    }

    const email = normalizeInvitationEmail(body.email);
    const role = text(body.role, 40) as TenantRole;
    if (!/^\S+@\S+\.\S+$/.test(email) || !isInvitationRole(role)) return NextResponse.json({ error: 'Correo y rol válido son obligatorios.' }, { status: 400 });
    if (!canAssignInvitationRole(context.role, role)) return NextResponse.json({ error: 'No puedes asignar ese nivel de rol.' }, { status: 403 });
    const [activeMembers, pendingInvitations] = await Promise.all([
      supabase.from('members').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).eq('status', 'active'),
      supabase.from('tenant_invitations').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).eq('status', 'pending'),
    ]);
    if (activeMembers.error) throw new Error(activeMembers.error.message);
    if (pendingInvitations.error) throw new Error(pendingInvitations.error.message);
    try { assertPlanCapacity(tenantResult.data.plan, 'members', (activeMembers.count || 0) + (pendingInvitations.count || 0)); } catch (error) { return errorResponse(error); }
    const existingProfile = await supabase.from('profiles').select('auth_user_id').eq('email', email).maybeSingle();
    if (existingProfile.error) throw new Error(existingProfile.error.message);
    if (existingProfile.data) {
      const existingMember = await supabase.from('members').select('id').eq('tenant_id', context.tenantId).eq('profile_id', existingProfile.data.auth_user_id).in('status', ['active', 'inactive']).limit(1);
      if (existingMember.error) throw new Error(existingMember.error.message);
      if ((existingMember.data || []).length) return NextResponse.json({ error: 'Ese correo ya pertenece o perteneció a esta empresa.' }, { status: 409 });
    }
    const existingInvitation = await supabase.from('tenant_invitations').select('id').eq('tenant_id', context.tenantId).eq('email', email).eq('status', 'pending').limit(1);
    if (existingInvitation.error) throw new Error(existingInvitation.error.message);
    if ((existingInvitation.data || []).length) return NextResponse.json({ error: 'Ya existe una invitación pendiente para ese correo.' }, { status: 409 });

    const token = createInvitationToken();
    const expiresAt = invitationExpiry().toISOString();
    const created = await supabase.from('tenant_invitations').insert({ tenant_id: context.tenantId, email, role, status: 'pending', token_hash: hashInvitationToken(token), expires_at: expiresAt, created_by: context.uid, last_sent_at: new Date().toISOString(), resend_count: 0 }).select('*').single();
    if (created.error) throw new Error(created.error.message);
    const delivery = await sendInvitationEmail(email, tenantName, role, invitationUrl(token));
    await writeInvitationAudit(context.tenantId, 'invitation.created', { ...context, invitationId: created.data.id, email, metadata: { role, delivery } });
    return NextResponse.json({ ok: true, invitation: { id: created.data.id, email, role, status: 'pending', expiresAt, delivery }, ...(delivery === 'sent' ? {} : { warning: 'El correo no pudo enviarse. Comparte el enlace de invitación por un canal seguro.', invitationUrl: invitationUrl(token) }) }, { status: 201 });
  } catch (error: unknown) { return errorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'members', 'delete');
    const body = await request.json();
    const invitationId = text(body.invitationId, 160);
    if (!invitationId) return NextResponse.json({ error: 'La invitación es obligatoria.' }, { status: 400 });
    const supabase = getSupabaseServer();
    const current = await supabase.from('tenant_invitations').select('*').eq('tenant_id', context.tenantId).eq('id', invitationId).maybeSingle();
    if (current.error) throw new Error(current.error.message);
    if (!current.data) return NextResponse.json({ error: 'La invitación no existe.' }, { status: 404 });
    if (current.data.status !== 'pending') return NextResponse.json({ error: 'Solo se pueden revocar invitaciones pendientes.' }, { status: 409 });
    const updated = await supabase.from('tenant_invitations').update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: context.uid, updated_at: new Date().toISOString() }).eq('tenant_id', context.tenantId).eq('id', invitationId);
    if (updated.error) throw new Error(updated.error.message);
    await writeInvitationAudit(context.tenantId, 'invitation.revoked', { ...context, invitationId, email: current.data.email, metadata: { role: current.data.role } });
    return NextResponse.json({ ok: true, invitationId, status: 'revoked' });
  } catch (error: unknown) { return errorResponse(error); }
}
