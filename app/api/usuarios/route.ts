import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

async function verificarJefe(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) throw new Error('No autorizado');

  const decoded = await adminAuth.verifyIdToken(token);
  const perfil = await adminDb.collection('usuarios').doc(decoded.uid).get();
  if (!perfil.exists) throw new Error('Perfil no encontrado');

  const data = perfil.data() || {};
  if (data.rol !== 'jefe') throw new Error('Solo el jefe puede gestionar usuarios');
  if (data.activo === false) throw new Error('Usuario desactivado');

  return decoded.uid;
}

export async function POST(req: NextRequest) {
  try {
    await verificarJefe(req);
    const body = await req.json();
    const { nombre, email, password, rol } = body;

    if (!nombre || !email || !password || !rol) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
    }

    // 1. Roles fijos y consulta a la colección correcta: 'roles_personalizados'
    const rolesFijos = ['jefe', 'vendedor', 'bodega', 'chofer', 'cajero', 'dueño', 'gerente'];
    const rolesSnap = await adminDb.collection('roles_personalizados').get();
    const rolesPersonalizados = rolesSnap.docs.map(doc => doc.data().nombre?.toLowerCase());

    // 2. Unir y validar
    const todosLosRolesValidos = [...rolesFijos, ...rolesPersonalizados.filter(Boolean)];
    const rolLower = String(rol).trim().toLowerCase();

    if (!todosLosRolesValidos.includes(rolLower)) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
    }

    if (String(password).length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
    }

    const userRecord = await adminAuth.createUser({
      email: String(email).trim().toLowerCase(),
      password: String(password),
      displayName: String(nombre).trim(),
      disabled: false,
    });

    await adminDb.collection('usuarios').doc(userRecord.uid).set({
      email: String(email).trim().toLowerCase(),
      nombre: String(nombre).trim(),
      rol: rolLower,
      activo: true,
      creadoEn: new Date(),
    });

    return NextResponse.json({
      ok: true,
      uid: userRecord.uid,
      email: userRecord.email,
    });
  } catch (err: any) {
    console.error(err);
    const msg =
      err?.code === 'auth/email-already-exists'
        ? 'Ese correo ya está registrado'
        : err?.message || 'Error al crear usuario';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await verificarJefe(req);
    const body = await req.json();
    const { uid, activo } = body;

    if (!uid || typeof activo !== 'boolean') {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    await adminDb.collection('usuarios').doc(uid).update({ activo });
    await adminAuth.updateUser(uid, { disabled: !activo });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message || 'Error al actualizar' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await verificarJefe(req);
    const body = await req.json();
    const { uid } = body;

    if (!uid) {
      return NextResponse.json({ error: 'Falta uid' }, { status: 400 });
    }

    await adminAuth.deleteUser(uid);
    await adminDb.collection('usuarios').doc(uid).delete();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message || 'Error al eliminar' }, { status: 400 });
  }
}
