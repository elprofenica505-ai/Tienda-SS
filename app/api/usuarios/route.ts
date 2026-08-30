import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

async function verificarJefe(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) throw new Error('No autenticado');
  const decoded = await adminAuth.verifyIdToken(token);
  const perfilSnap = await adminDb.collection('usuarios').doc(decoded.uid).get();
  const perfil = perfilSnap.data();
  if (!perfil || perfil.rol !== 'jefe') throw new Error('No autorizado');
  return decoded.uid;
}

export async function POST(req: NextRequest) {
  try {
    await verificarJefe(req);
    const { nombre, email, password, rol } = await req.json();
    if (!nombre || !email || !password || !rol) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
    }
    const nuevoUsuario = await adminAuth.createUser({
      email: email.toLowerCase().trim(),
      password,
      displayName: nombre,
    });
    await adminDb.collection('usuarios').doc(nuevoUsuario.uid).set({
      nombre,
      email: email.toLowerCase().trim(),
      rol,
      activo: true,
    });
    return NextResponse.json({ ok: true, uid: nuevoUsuario.uid });
  } catch (e: any) {
    const msg = e?.message || 'Error desconocido';
    const status = msg === 'No autenticado' || msg === 'No autorizado' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await verificarJefe(req);
    const { uid, activo } = await req.json();
    if (!uid || typeof activo !== 'boolean') {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
    }
    await adminAuth.updateUser(uid, { disabled: !activo });
    await adminDb.collection('usuarios').doc(uid).update({ activo });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await verificarJefe(req);
    const { uid } = await req.json();
    if (!uid) return NextResponse.json({ error: 'Falta uid' }, { status: 400 });
    await adminAuth.deleteUser(uid);
    await adminDb.collection('usuarios').doc(uid).delete();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
