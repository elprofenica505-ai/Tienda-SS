import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let serverClient: SupabaseClient | undefined;

function requiredEnv(name: 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'): string {
  const value = name === 'SUPABASE_URL'
    ? (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim()
    : process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!value) throw new Error(`SUPABASE_${name === 'SUPABASE_URL' ? 'URL' : 'SERVICE_ROLE_KEY'}_MISSING`);
  return value;
}

/** Server-only client. Never import this module from client components. */
export function getSupabaseServer(): SupabaseClient {
  if (serverClient) return serverClient;
  serverClient = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return serverClient;
}
