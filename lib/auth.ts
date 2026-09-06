import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

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
export async function login(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password);
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
