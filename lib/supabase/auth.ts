import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowser } from '@/lib/supabase/client';

export type SupabaseAuthUser = User;

export async function signInWithSupabase(email: string, password: string): Promise<User> {
  const { data, error } = await getSupabaseBrowser().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('No se pudo iniciar sesión.');
  return data.user;
}

export async function signOutSupabase(): Promise<void> {
  const { error } = await getSupabaseBrowser().auth.signOut();
  if (error) throw new Error(error.message);
}

export async function requestSupabasePasswordRecovery(email: string): Promise<void> {
  const { error } = await getSupabaseBrowser().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw new Error(error.message);
}

export async function sendSupabaseVerification(user: User): Promise<void> {
  if (user.email_confirmed_at) return;
  const { error } = await getSupabaseBrowser().auth.resend({ type: 'signup', email: user.email || '' });
  if (error) throw new Error(error.message);
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  const { data } = await getSupabaseBrowser().auth.getSession();
  return data.session?.access_token || null;
}
