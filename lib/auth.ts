import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { Usuario, RolAntiguo } from "@/components/shared/types";

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
  
  return {
    id: uid,
    email: data.email || "",
    nombre: data.nombre || data.email || "Sin nombre",
    rol: (data.rol || "vendedor") as RolAntiguo,
    activo: data.activo !== false,
    // Campos nuevos (por ahora vacíos, los usaremos después)
    orgActualId: data.orgActualId || undefined,
    organizaciones: data.organizaciones || undefined,
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

export type { Usuario };
