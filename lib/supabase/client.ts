import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | undefined;

function requiredPublicEnv(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name}_MISSING`);
  return normalized;
}

/** Browser-only Supabase client. It never contains the service role key. */
export function getSupabaseBrowser(): SupabaseClient {
  if (browserClient) return browserClient;
  browserClient = createClient(
    requiredPublicEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    requiredPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
  );
  return browserClient;
}
