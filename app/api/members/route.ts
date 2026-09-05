import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse, TenantRole } from '@/lib/tenant';

export const runtime = 'nodejs';
const managerRoles: TenantRole[] = ['owner', 'admin', 'jefe'];
const assignableRoles: TenantRole[] = ['admin', 'jefe', 'vendedor', 'bodega', 'chofer', 'cajero'];
function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function errorResponse(error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'members', 'view');
    const snapshot = await getAdminDb().collection('tenants').doc(context.tenantId).collection('members').orderBy('name').get();
    return NextResponse.json({ ok: true, members: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'members', 'create');
    const body = await request.json(); const name = text(body.name); const email = text(body.email, 160).toLowerCase(); const password = typeof body.password === 'string' ? body.password : ''; const role = text(body.role, 30) as TenantRole;
    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !assignableRoles.includes(role)) return NextResponse.json({ error: 'Nombre, correo, contraseña y rol son obligatorios.' }, { status: 400 });
    const db = getAdminDb(); const memberRef = db.collection('tenants').doc(context.tenantId).collection('members');
    const existing = await memberRef.where('email', '==', email).limit(1).get();
    if (!existing.empty && existing.docs[0].data().status === 'active') return NextResponse.json({ error: 'Ese usuario ya pertenece a esta empresa.' }, { status: 409 });
    let user;
    try { user = await getAdminAuth().getUserByEmail(email); } catch (error: unknown) { if ((error as { code?: string }).code !== 'auth/user-not-found') throw error; user = await getAdminAuth().createUser({ email, password, displayName: name, disabled: false }); }
    await memberRef.doc(user.uid).set({ uid: user.uid, tenantId: context.tenantId, name, email, role, status: 'active', createdBy: context.uid, createdAt: new Date(), updatedAt: new Date() }, { merge: true });
    return NextResponse.json({ ok: true, uid: user.uid, email }, { status: 201 });
  } catch (error: unknown) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'members', 'edit'); const body = await request.json(); const uid = text(body.uid, 160); const memberRef = getAdminDb().collection('tenants').doc(context.tenantId).collection('members').doc(uid); const member = await memberRef.get();
    if (!uid || !member.exists) return NextResponse.json({ error: 'El miembro no existe en este tenant.' }, { status: 404 });
    const current = member.data() || {}; if (uid === context.uid) return NextResponse.json({ error: 'No puedes cambiar tu propio acceso desde aquí.' }, { status: 400 }); if (current.role === 'owner') return NextResponse.json({ error: 'El propietario principal no puede modificarse desde este módulo.' }, { status: 403 });
    const changes: Record<string, unknown> = { updatedAt: new Date(), updatedBy: context.uid };
    if (typeof body.role === 'string' && assignableRoles.includes(body.role as TenantRole)) changes.role = body.role;
    if (typeof body.status === 'string' && ['active', 'disabled'].includes(body.status)) changes.status = body.status;
    if (Object.keys(changes).length === 1) return NextResponse.json({ error: 'No hay cambios válidos.' }, { status: 400 });
    await memberRef.update(changes);
    return NextResponse.json({ ok: true, uid, changes });
  } catch (error: unknown) { return errorResponse(error); }
}
