import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  addDoc, 
  serverTimestamp,
  query,
  where
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ROLES_SISTEMA, type Organizacion, type Rol, type Permission } from "@/components/shared/types";

/**
 * Crea una nueva organización + los 5 roles por defecto
 * (Jefe, Vendedor, Bodega, Chofer, Cajero)
 */
export async function crearOrganizacion(
  nombre: string,
  slug: string,
  creadoPorUid: string
): Promise<{ organizacionId: string; rolesCreados: Rol[] }> {
  
  // 1. Crear la organización
  const orgRef = doc(collection(db, "organizaciones"));
  const organizacion: Organizacion = {
    id: orgRef.id,
    nombre: nombre.trim(),
    slug: slug.trim().toLowerCase(),
    plan: "gratis",
    activo: true,
    creadoEn: serverTimestamp(),
    creadoPor: creadoPorUid,
  };

  await setDoc(orgRef, organizacion);

  // 2. Crear los roles del sistema dentro de la organización
  const rolesCreados: Rol[] = [];

  for (const rolBase of ROLES_SISTEMA) {
    const rolRef = doc(collection(db, "organizaciones", orgRef.id, "roles"));
    const nuevoRol: Rol = {
      id: rolRef.id,
      organizacionId: orgRef.id,
      nombre: rolBase.nombre,
      descripcion: rolBase.descripcion,
      permisos: rolBase.permisos as Permission[],
      esSistema: true,
      creadoEn: serverTimestamp(),
    };
    await setDoc(rolRef, nuevoRol);
    rolesCreados.push(nuevoRol);
  }

  return {
    organizacionId: orgRef.id,
    rolesCreados,
  };
}

/**
 * Obtiene todos los roles de una organización
 */
export async function obtenerRolesDeOrganizacion(organizacionId: string): Promise<Rol[]> {
  const rolesSnap = await getDocs(collection(db, "organizaciones", organizacionId, "roles"));
  const roles: Rol[] = [];
  rolesSnap.forEach((d) => {
    roles.push({ id: d.id, ...d.data() } as Rol);
  });
  return roles;
}

/**
 * Obtiene una organización por su ID
 */
export async function obtenerOrganizacion(organizacionId: string): Promise<Organizacion | null> {
  const snap = await getDoc(doc(db, "organizaciones", organizacionId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Organizacion;
}
