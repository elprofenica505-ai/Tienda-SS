import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

async function verifyManager(request: NextRequest) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7).trim()
    : '';

  if (!token) throw new Error('UNAUTHENTICATED');

  const decoded = await getAdminAuth().verifyIdToken(token);
  const tenantId = request.headers.get('x-tenant-id')?.trim();
  if (!tenantId) throw new Error('TENANT_REQUIRED');

  const member = await getAdminDb()
    .collection('tenants')
    .doc(tenantId)
    .collection('members')
    .doc(decoded.uid)
    .get();

  const role = member.data()?.role;
  const active = member.data()?.status === 'active';
  if (!member.exists || !active || !['owner', 'admin', 'jefe'].includes(role)) {
    throw new Error('FORBIDDEN');
  }

  return { tenantId, uid: decoded.uid };
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  if (code === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Autenticación requerida.' }, { status: 401 });
  if (code === 'TENANT_REQUIRED') return NextResponse.json({ error: 'Falta identificar la empresa.' }, { status: 400 });
  if (code === 'FORBIDDEN') return NextResponse.json({ error: 'No tienes permisos suficientes.' }, { status: 403 });
  console.error('users_api_error', { code });
  return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await verifyManager(request);
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const role = typeof body.role === 'string' ? body.role : '';
    const validRoles = ['admin', 'jefe', 'vendedor', 'bodega', 'chofer', 'cajero'];

    if (name.length < 2 || name.length > 120 || !email || password.length < 8 || !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Datos de usuario inválidos.' }, { status: 400 });
    }

    const user = await getAdminAuth().createUser({ email, password, displayName: name, disabled: false });
    await getAdminDb().collection('tenants').doc(tenantId).collection('members').doc(user.uid).set({
      uid: user.uid,
      tenantId,
      name,
      email,
      role,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return NextResponse.json({ ok: true, uid: user.uid, email }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('email-already-exists')) return NextResponse.json({ error: 'Ese correo ya está registrado.' }, { status: 409 });
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { tenantId } = await verifyManager(request);
    const body = await request.json();
    const uid = typeof body.uid === 'string' ? body.uid.trim() : '';
    const active = body.active;
    if (!uid || typeof active !== 'boolean') return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });

    await getAdminDb().collection('tenants').doc(tenantId).collection('members').doc(uid).update({
      status: active ? 'active' : 'disabled',
      updatedAt: new Date()
    });
    await getAdminAuth().updateUser(uid, { disabled: !active });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { tenantId, uid: actorUid } = await verifyManager(request);
    const body = await request.json();
    const uid = typeof body.uid === 'string' ? body.uid.trim() : '';
    if (!uid || uid === actorUid) return NextResponse.json({ error: 'No puedes eliminar tu propio usuario.' }, { status: 400 });

    const memberRef = getAdminDb().collection('tenants').doc(tenantId).collection('members').doc(uid);
    await memberRef.update({ status: 'deleted', updatedAt: new Date() });
    await getAdminAuth().updateUser(uid, { disabled: true });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
