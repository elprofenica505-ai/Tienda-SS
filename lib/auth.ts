import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { getSupabaseAccessToken, requestSupabasePasswordRecovery, resendSupabaseVerification, signInWithSupabase, signOutSupabase } from '@/lib/supabase/auth';
import { isValidAuthEmail, normalizeAuthEmail } from '@/lib/auth-policy';

export const ROLES = ['owner', 'admin', 'gerente', 'supervisor_sucursal', 'vendedor', 'cajero', 'bodega', 'compras', 'chofer', 'despachador', 'solo_lectura', 'jefe'] as const;
export type Rol = (typeof ROLES)[number];
export interface Usuario { id: string; email: string; nombre: string; rol: Rol; activo: boolean; }
export type AuthUser = User & { uid: string; displayName?: string; getIdToken: () => Promise<string> };
function adaptUser(user: User): AuthUser { return Object.assign(user, { uid: user.id, displayName: user.user_metadata?.display_name || user.user_metadata?.full_name || undefined, getIdToken: async () => { const token = await getSupabaseAccessToken(); if (!token) throw new Error('SESSION_EXPIRED'); return token; } }); }
function normalizedEmail(email: string): string { return normalizeAuthEmail(email); }
export async function login(email: string, password: string): Promise<AuthUser> { return adaptUser(await signInWithSupabase(normalizedEmail(email), password)); }
export async function sendVerification(user: User): Promise<void> { await resendSupabaseVerification(user.email || ''); }
export async function requestPasswordRecovery(email: string): Promise<void> { const value = normalizedEmail(email); if (!isValidAuthEmail(value)) throw new Error('Introduce un correo válido.'); await requestSupabasePasswordRecovery(value); }
export async function refreshSessionClaims(user: User) { const session = await getSupabaseBrowser().auth.refreshSession(); if (session.error) throw new Error(session.error.message); return { user: session.data.user || user, session: session.data.session }; }
export async function obtenerPerfil(uid: string): Promise<Usuario> { const user = (await getSupabaseBrowser().auth.getUser()).data.user; if (!user || user.id !== uid) throw new Error('Usuario no autenticado.'); return { id: user.id, email: user.email || '', nombre: user.user_metadata?.display_name || user.user_metadata?.full_name || user.email || 'Sin nombre', rol: 'solo_lectura', activo: true }; }
export function cerrarSesion() { return signOutSupabase(); }
export function escucharSesion(callback: (usuario: Usuario | null) => void) { const supabase = getSupabaseBrowser(); const { data } = supabase.auth.onAuthStateChange((_event, session) => { const user = session?.user; callback(user ? { id: user.id, email: user.email || '', nombre: user.user_metadata?.display_name || user.user_metadata?.full_name || user.email || 'Sin nombre', rol: 'solo_lectura', activo: true } : null); }); return () => data.subscription.unsubscribe(); }
