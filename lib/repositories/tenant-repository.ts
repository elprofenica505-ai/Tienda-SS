import { getSupabaseServer } from '@/lib/supabase/server';

function fail(error: { message?: string } | null): never { throw new Error(error?.message || 'SUPABASE_REQUEST_FAILED'); }

export async function updateTenant(tenantId: string, changes: Record<string, unknown>) {
  const supabase = getSupabaseServer();
  const current = await supabase.from('tenants').select('*').or(`id.eq.${tenantId},legacy_firestore_id.eq.${tenantId}`).single();
  if (current.error) fail(current.error);
  const result = await supabase.from('tenants').update(changes).eq('id', current.data.id).select('*').single();
  if (result.error) fail(result.error);
  return result.data;
}
