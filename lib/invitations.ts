import { createHash, randomBytes } from 'node:crypto';
import { Resend } from 'resend';
import { getAdminDb } from '@/lib/firebaseAdmin';
import type { TenantContext, TenantRole } from '@/lib/tenant';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITATION_RESEND_COOLDOWN_MS = 60 * 1000;
export const INVITATION_ROLES: readonly TenantRole[] = [
  'admin', 'gerente', 'supervisor_sucursal', 'vendedor', 'cajero',
  'bodega', 'compras', 'chofer', 'despachador', 'solo_lectura', 'jefe',
];

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export function normalizeInvitationEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 160) : '';
}

export function isInvitationRole(value: unknown): value is TenantRole {
  return typeof value === 'string' && INVITATION_ROLES.includes(value as TenantRole);
}

export function canAssignInvitationRole(actorRole: TenantRole, targetRole: TenantRole): boolean {
  if (actorRole === 'owner' || actorRole === 'admin') return true;
  if (targetRole === 'admin' || targetRole === 'jefe') return false;
  return ['gerente', 'supervisor_sucursal'].includes(actorRole);
}

export function createInvitationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function invitationUrl(token: string): string {
  const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/accept-invitation?token=${encodeURIComponent(token)}`;
}

export function invitationExpiry(from = Date.now()): Date {
  return new Date(from + INVITATION_TTL_MS);
}

export function isInvitationExpired(expiresAt: unknown, now = Date.now()): boolean {
  const value = expiresAt instanceof Date ? expiresAt.getTime() : expiresAt && typeof (expiresAt as { toMillis?: () => number }).toMillis === 'function' ? (expiresAt as { toMillis: () => number }).toMillis() : NaN;
  return !Number.isFinite(value) || value <= now;
}

export function canResendInvitation(lastSentAt: unknown, now = Date.now()): boolean {
  if (!lastSentAt) return true;
  const value = lastSentAt instanceof Date ? lastSentAt.getTime() : lastSentAt && typeof (lastSentAt as { toMillis?: () => number }).toMillis === 'function' ? (lastSentAt as { toMillis: () => number }).toMillis() : NaN;
  return !Number.isFinite(value) || now - value >= INVITATION_RESEND_COOLDOWN_MS;
}

export async function writeInvitationAudit(tenantId: string, event: string, context: Partial<TenantContext> & { invitationId?: string; email?: string; role?: string; metadata?: Record<string, unknown> }) {
  const tenantRef = getAdminDb().collection('tenants').doc(tenantId);
  await tenantRef.collection('auditLogs').doc().set({
    event,
    actorUid: context.uid || null,
    actorRole: context.role || null,
    invitationId: context.invitationId || null,
    email: context.email || null,
    role: context.role || null,
    metadata: context.metadata || {},
    createdAt: new Date(),
  });
}

export async function sendInvitationEmail(email: string, tenantName: string, role: TenantRole, url: string): Promise<'sent' | 'not_configured' | 'failed'> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) return 'not_configured';
  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to: [email],
      subject: `Invitación para unirte a ${tenantName}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px"><h2>Te invitaron a ${escapeHtml(tenantName)}</h2><p>Tu rol será <strong>${escapeHtml(role)}</strong>.</p><p><a href="${escapeHtml(url)}">Aceptar invitación</a></p><p>El enlace vence en 7 días y solo puede utilizarse una vez.</p></div>`,
    });
    return 'sent';
  } catch {
    return 'failed';
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character));
}
