import { Resend } from 'resend';
import { getAdminDb } from '@/lib/firebaseAdmin';

export type AlertType = 'payment_failed' | 'renewal_upcoming' | 'subscription_updated';
function getResend() { return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null; }
function appUrl() { return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, ''); }
function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character)); }
export async function notifyTenant(tenantId: string, type: AlertType, title: string, message: string, metadata: Record<string, unknown> = {}) {
  const db = getAdminDb(); const tenantRef = db.collection('tenants').doc(tenantId); const alertRef = tenantRef.collection('notifications').doc(); const now = new Date();
  await alertRef.set({ type, title, message, read: false, metadata, createdAt: now });
  const ownerSnapshot = await tenantRef.collection('members').where('role', '==', 'owner').where('status', '==', 'active').limit(1).get(); const owner = ownerSnapshot.empty ? null : ownerSnapshot.docs[0].data(); const resend = getResend(); const from = process.env.RESEND_FROM;
  if (resend && from && owner?.email) { await resend.emails.send({ from, to: [String(owner.email)], subject: title, html: `<div style="font-family:Arial,sans-serif;max-width:560px"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p><p><a href="${appUrl()}/workspace/billing">Abrir facturación</a></p></div>` }); }
  return alertRef.id;
}
