import { collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { Rol, Permission } from '@/components/shared/types';

export async function obtenerRolesPersonalizados(): Promise<Rol[]> {
  try {
    const snap = await getDocs(collection(db, 'roles_personalizados'));
    const lista: Rol[] = [];
    snap.forEach((d) => {
      lista.push({ id: d.id, ...d.data() } as Rol);
    });
    return lista;
  } catch (error) {
    console.error('Error al obtener roles:', error);
    return [];
  }
}

export async function crearRolPersonalizado(
  nombre: string,
  descripcion: string,
  permisos: Permission[]
): Promise<string | null> {
  try {
    const docRef = await addDoc(collection(db, 'roles_personalizados'), {
      nombre: nombre.trim(),
      descripcion: descripcion.trim(),
      permisos,
      esSistema: false,
      creadoEn: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error al crear rol:', error);
    return null;
  }
}

export async function eliminarRolPersonalizado(rolId: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, 'roles_personalizados', rolId));
    return true;
  } catch (error) {
    console.error('Error al eliminar rol:', error);
    return false;
  }
}
