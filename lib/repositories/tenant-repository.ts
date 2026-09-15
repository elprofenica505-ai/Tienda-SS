import { getSupabaseServer } from '@/lib/supabase/server';

function fail(error: { message?: string } | null): never { throw new Error(error?.message || 'SUPABASE_REQUEST_FAILED'); }

export async function updateTenant(tenantId: string, changes: Record<string, unknown>) {
  const supabase = getSupabaseServer();
  const columns = 'id,legacy_firestore_id,slug,name,status,timezone,currency,plan,subscription_status,stripe_customer_id,last_payment_failure_at,last_stripe_event_created,onboarding_completed,created_at,updated_at';
  const current = await supabase.from('tenants').select(columns).or(`id.eq.${tenantId},legacy_firestore_id.eq.${tenantId}`).single();
  if (current.error) fail(current.error);
  const result = await supabase.from('tenants').update(changes).eq('id', current.data.id).select(columns).single();
  if (result.error) fail(result.error);
  return result.data;
}
