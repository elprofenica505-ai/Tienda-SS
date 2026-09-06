import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export const ROLES = ["jefe", "vendedor", "bodega", "chofer"] as const;
export type Rol = (typeof ROLES)[number];

function isRol(value: unknown): value is Rol {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
}

export async function login(email: string, password: string): Promise<Usuario> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const perfil = await obtenerPerfil(cred.user.uid);
  if (!perfil.activo) {
    await signOut(auth);
    throw new Error("Usuario desactivado. Contacta al Jefe.");
  }
  return perfil;
}

export async function obtenerPerfil(uid: string): Promise<Usuario> {
  const ref = doc(db, "usuarios", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Este usuario no tiene perfil asignado.");
  const data = snap.data();
  if (!isRol(data.rol)) {
    throw new Error("El perfil del usuario tiene un rol inválido.");
  }

  return {
    id: uid,
    email: typeof data.email === "string" ? data.email : "",
    nombre: typeof data.nombre === "string" && data.nombre.trim()
      ? data.nombre.trim()
      : typeof data.email === "string" && data.email.trim()
        ? data.email.trim()
        : "Sin nombre",
    rol: data.rol,
    activo: data.activo !== false,
  };
}

export function cerrarSesion() {
  return signOut(auth);
}

export function escucharSesion(callback: (usuario: Usuario | null) => void) {
  return onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
    if (!fbUser) {
      callback(null);
      return;
    }
    try {
      const perfil = await obtenerPerfil(fbUser.uid);
      callback(perfil);
    } catch {
      callback(null);
    }
  });
}
