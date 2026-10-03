import type { SupabaseClient } from '@supabase/supabase-js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Convierte IDs heredados o UUIDs de sucursal a los UUIDs que usan las relaciones SQL. */
export async function resolveTenantBranchIds(
  supabase: SupabaseClient,
  tenantId: string,
  references: string[],
): Promise<string[]> {
  const refs = Array.from(new Set(references.map((value) => value.trim()).filter(Boolean)));
  if (!refs.length) return [];
  const uuidRefs = refs.filter((value) => UUID_PATTERN.test(value));
  const lookups = await Promise.all([
    uuidRefs.length
      ? supabase.from('branches').select('id').eq('tenant_id', tenantId).eq('active', true).in('id', uuidRefs)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('branches').select('id').eq('tenant_id', tenantId).eq('active', true).in('legacy_firestore_id', refs),
  ]);
  for (const lookup of lookups) if (lookup.error) throw new Error(lookup.error.message);
  return Array.from(new Set(lookups.flatMap((lookup) => (lookup.data || []).map((row: { id: string }) => String(row.id)).filter(Boolean))));
}
