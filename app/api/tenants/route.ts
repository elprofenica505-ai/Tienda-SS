import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { tenantErrorResponse } from '@/lib/tenant';

export const runtime = 'nodejs';

function validEmail(value: unknown): value is string {
  return typeof value === 'string'
    && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value.trim());
}

export async function POST(request: NextRequest) {
  let uid: string | undefined;

  try {
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (name.length < 2 || name.length > 120 || !validEmail(email) || password.length < 8) {
      return NextResponse.json(
        { error: 'Nombre, correo o contraseña inválidos.' },
        { status: 400 }
      );
    }

    const auth = getAdminAuth();
    const db = getAdminDb();
    const user = await auth.createUser({
      email,
      password,
      displayName: name,
      disabled: false
    });
    uid = user.uid;

    const tenantRef = db.collection('tenants').doc(uid);
    const memberRef = tenantRef.collection('members').doc(uid);
    const batch = db.batch();

    batch.set(tenantRef, {
      tenantId: uid,
      name,
      ownerUid: uid,
      status: 'active',
      plan: 'starter',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    batch.set(memberRef, {
      uid,
      tenantId: uid,
      email,
      name,
      role: 'owner',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await batch.commit();

    return NextResponse.json(
      { ok: true, tenantId: uid },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (uid) {
      try {
        await getAdminAuth().deleteUser(uid);
      } catch {
        console.error('tenant_owner_cleanup_failed');
      }
    }

    const message = error instanceof Error ? error.message : '';
    if (message.includes('email-already-exists')) {
      return NextResponse.json(
        { error: 'Ese correo ya está registrado.' },
        { status: 409 }
      );
    }

    console.error('tenant_creation_failed', { message });
    return NextResponse.json(
      { error: 'No se pudo crear la empresa.' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { requireTenantMember } = await import('@/lib/tenant');
    const context = await requireTenantMember(request);
    const tenant = await getAdminDb().collection('tenants').doc(context.tenantId).get();

    return NextResponse.json({
      ok: true,
      tenant: tenant.exists ? { id: tenant.id, ...tenant.data() } : null,
      member: context
    });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
