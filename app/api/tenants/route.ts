import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { tenantErrorResponse } from '@/lib/tenant';
import { consumeRateLimit, getClientAddress, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

function validEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function POST(request: NextRequest) {
  const rate = consumeRateLimit(`tenant-signup:${getClientAddress(request)}`, 5, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
  let uid: string | undefined;

  try {
    const body = await request.json();
    const companyName = typeof body.name === 'string' ? body.name.trim() : '';
    const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (
      companyName.length < 2 || companyName.length > 120 ||
      ownerName.length < 2 || ownerName.length > 120 ||
      !validEmail(email) || password.length < 8
    ) {
      return NextResponse.json({ error: 'Revisa el nombre, correo y contraseña.' }, { status: 400 });
    }

    const auth = getAdminAuth();
    const db = getAdminDb();
    const user = await auth.createUser({ email, password, displayName: ownerName, disabled: false });
    uid = user.uid;

    const now = new Date();
    const tenantRef = db.collection('tenants').doc(uid);
    const memberRef = tenantRef.collection('members').doc(uid);
    const batch = db.batch();

    batch.set(tenantRef, {
      tenantId: uid,
      name: companyName,
      ownerUid: uid,
      status: 'active',
      plan: 'starter',
      onboardingCompleted: false,
      createdAt: now,
      updatedAt: now
    });

    batch.set(memberRef, {
      uid,
      tenantId: uid,
      email,
      name: ownerName,
      role: 'owner',
      status: 'active',
      createdAt: now,
      updatedAt: now
    });

    await batch.commit();
    return NextResponse.json({ ok: true, tenantId: uid }, { status: 201 });
  } catch (error: unknown) {
    if (uid) {
      try { await getAdminAuth().deleteUser(uid); } catch { console.error('tenant_owner_cleanup_failed'); }
    }

    const message = error instanceof Error ? error.message : '';
    if (message.includes('email-already-exists')) {
      return NextResponse.json({ error: 'Ese correo ya está registrado.' }, { status: 409 });
    }

    console.error('tenant_creation_failed', { message });
    if (message.includes('FIREBASE_SERVICE_ACCOUNT_KEY')) {
      return NextResponse.json({ error: 'La conexión del servidor con Firebase no está configurada correctamente en Vercel.' }, { status: 503 });
    }
    if (message.includes('permission-denied') || message.includes('Missing or insufficient permissions')) {
      return NextResponse.json({ error: 'Firebase rechazó el acceso del servidor. Revisa la cuenta de servicio y que Firestore esté creado en este proyecto.' }, { status: 503 });
    }
    if (message.includes('5 NOT_FOUND') || message.includes('The database')) {
      return NextResponse.json({ error: 'Firestore todavía no está creado en el proyecto de Firebase.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'No se pudo crear la empresa. Revisa los registros de Vercel para ver el detalle.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { requireTenantMember } = await import('@/lib/tenant');
    const context = await requireTenantMember(request);
    const tenant = await getAdminDb().collection('tenants').doc(context.tenantId).get();
    return NextResponse.json({ ok: true, tenant: tenant.exists ? { id: tenant.id, ...tenant.data() } : null, member: context });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
