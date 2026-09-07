import {
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { isValidAuthEmail, normalizeAuthEmail } from '@/lib/auth-policy';

export const ROLES = [
  'owner',
  'admin',
  'gerente',
  'supervisor_sucursal',
  'vendedor',
  'cajero',
  'bodega',
  'compras',
  'chofer',
  'despachador',
  'solo_lectura',
  'jefe',
] as const;
export type Rol = (typeof ROLES)[number];

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
}

function userToLegacyProfile(user: FirebaseUser): Usuario {
  return {
    id: user.uid,
    email: user.email || '',
    nombre: user.displayName || user.email || 'Sin nombre',
    rol: 'solo_lectura',
    activo: true,
  };
}

/**
 * Firebase Auth is the source of truth for login. Tenant membership and role
 * are loaded by TenantProvider through /api/tenants/me.
 */
function normalizedEmail(email: string): string {
  return normalizeAuthEmail(email);
}

export async function login(email: string, password: string): Promise<FirebaseUser> {
  const credential = await signInWithEmailAndPassword(auth, normalizedEmail(email), password);
  return credential.user;
}

export async function sendVerification(user: FirebaseUser): Promise<void> {
  await sendEmailVerification(user, {
    url: `${window.location.origin}/login?verified=1`,
    handleCodeInApp: false,
  });
}

export async function requestPasswordRecovery(email: string): Promise<void> {
  const value = normalizedEmail(email);
  if (!isValidAuthEmail(value)) throw new Error('Introduce un correo válido.');
  await sendPasswordResetEmail(auth, value, {
    url: `${window.location.origin}/login?reset=1`,
    handleCodeInApp: false,
  });
}

export async function refreshSessionClaims(user: FirebaseUser) {
  return user.getIdTokenResult(true);
}

/**
 * Kept for compatibility with older UI code. It no longer reads the removed
 * legacy usuarios/{uid} collection, which was causing permission errors.
 */
export async function obtenerPerfil(uid: string): Promise<Usuario> {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Usuario no autenticado.');
  return userToLegacyProfile(user);
}

export function cerrarSesion() {
  return signOut(auth);
}

export function escucharSesion(callback: (usuario: Usuario | null) => void) {
  return onAuthStateChanged(auth, (user) => {
    callback(user ? userToLegacyProfile(user) : null);
  });
}
