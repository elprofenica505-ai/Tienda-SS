import { Resend } from 'resend';
import { getSupabaseServer } from '@/lib/supabase/server';

export type AlertType = 'payment_failed' | 'renewal_upcoming' | 'subscription_updated';
function getResend() { return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null; }
function appUrl() { return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, ''); }
function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character)); }
export async function notifyTenant(tenantId: string, type: AlertType, title: string, message: string, metadata: Record<string, unknown> = {}) {
  const supabase = getSupabaseServer();
  const alert = await supabase.from('notifications').insert({ tenant_id: tenantId, notification_type: type, title, message, metadata }).select('id').single();
  if (alert.error || !alert.data) throw new Error(alert.error?.message || 'NOTIFICATION_CREATE_FAILED');
  const owner = await supabase.from('members').select('profiles!inner(email)').eq('tenant_id', tenantId).eq('role', 'owner').eq('status', 'active').limit(1).maybeSingle();
  const ownerEmail = (owner.data as any)?.profiles?.email;
  const resend = getResend(); const from = process.env.RESEND_FROM;
  if (resend && from && ownerEmail) { try { await resend.emails.send({ from, to: [String(ownerEmail)], subject: title, html: `<div style="font-family:Arial,sans-serif;max-width:560px"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p><p><a href="${appUrl()}/workspace/billing">Abrir facturación</a></p></div>` }); } catch (error) { console.error('notification_email_failed', error instanceof Error ? error.message : 'unknown'); } }
  return alert.data.id;
}
