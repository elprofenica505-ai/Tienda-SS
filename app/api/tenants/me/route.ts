import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { DEFAULT_TENANT_LOCALE, DEFAULT_TENANT_SYMBOL, normalizeCurrency } from '@/lib/currency';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const header = request.headers.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return NextResponse.json({ error: 'Autenticación requerida.' }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(token);
    const db = getAdminDb();
    const requestedTenantId = request.headers.get('x-tenant-id')?.trim();
    const available: Array<{ tenant: { id: string; [key: string]: unknown }; member: Record<string, unknown> }> = [];

    // The registration flow creates the first tenant with the owner's UID as
    // document ID. Resolve this path directly so the first login does not
    // depend on a collection-group index being ready.
    const ownerTenantDoc = await db.collection('tenants').doc(decoded.uid).get();
    if (ownerTenantDoc.exists && ownerTenantDoc.data()?.ownerUid === decoded.uid && ownerTenantDoc.data()?.status === 'active') {
      const ownerMemberDoc = await ownerTenantDoc.ref.collection('members').doc(decoded.uid).get();
      if (ownerMemberDoc.exists && ownerMemberDoc.data()?.status === 'active') {
        available.push({
          tenant: { id: ownerTenantDoc.id, currency: normalizeCurrency(ownerTenantDoc.data()?.currency), currencySymbol: ownerTenantDoc.data()?.currencySymbol || DEFAULT_TENANT_SYMBOL, locale: ownerTenantDoc.data()?.locale || DEFAULT_TENANT_LOCALE, ...ownerTenantDoc.data() },
          member: { id: ownerMemberDoc.id, ...ownerMemberDoc.data() },
        });
      }
    }

    // Existing invited members may belong to another tenant, so retain the
    // collection-group lookup as a fallback for multi-tenant users.
    if (available.length === 0) {
      const memberships = await db.collectionGroup('members').where('uid', '==', decoded.uid).get();
      const tenants = await Promise.all(memberships.docs
        .filter((memberDoc) => memberDoc.data().status === 'active')
        .map(async (memberDoc) => {
          const tenantRef = memberDoc.ref.parent.parent;
          if (!tenantRef) return null;
          const tenantDoc = await tenantRef.get();
          if (!tenantDoc.exists || tenantDoc.data()?.status !== 'active') return null;
          return {
            tenant: { id: tenantDoc.id, currency: normalizeCurrency(tenantDoc.data()?.currency), currencySymbol: tenantDoc.data()?.currencySymbol || DEFAULT_TENANT_SYMBOL, locale: tenantDoc.data()?.locale || DEFAULT_TENANT_LOCALE, ...tenantDoc.data() },
            member: { id: memberDoc.id, ...memberDoc.data() },
          };
        }));
      available.push(...tenants.filter(Boolean) as Array<{ tenant: { id: string; [key: string]: unknown }; member: Record<string, unknown> }>);
    }

    if (available.length === 0) {
      return NextResponse.json({ error: 'Tu usuario no tiene una empresa activa.' }, { status: 403 });
    }

    const activeTenantId = requestedTenantId && available.some((item) => item.tenant.id === requestedTenantId)
      ? requestedTenantId
      : available[0].tenant.id;

    return NextResponse.json({
      ok: true,
      activeTenantId,
      tenants: available
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown';
    console.error('tenant_me_failed', { message });
    if (message.includes('FIREBASE_PROJECT_MISMATCH')) {
      return NextResponse.json({ error: 'Vercel está usando credenciales de otro proyecto Firebase. Revisa la cuenta de servicio de ConexiaX.' }, { status: 503 });
    }
    if (message.includes('FIREBASE_SERVICE_ACCOUNT_KEY')) {
      return NextResponse.json({ error: 'La conexión del servidor con Firebase no está configurada correctamente.' }, { status: 503 });
    }
    if (message.includes('permission-denied') || message.includes('Missing or insufficient permissions')) {
      return NextResponse.json({ error: 'Firebase rechazó la consulta del servidor. Revisa la cuenta de servicio y Firestore de ConexiaX.' }, { status: 503 });
    }
    if (message.includes('index')) {
      return NextResponse.json({ error: 'Firebase necesita un índice para cargar tus empresas. Revisa los registros de Vercel.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'No se pudo cargar el espacio de trabajo. Revisa los registros de Vercel.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'dashboard', 'edit');
    const body = await request.json();
    const changes: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.onboardingCompleted === 'boolean') changes.onboardingCompleted = body.onboardingCompleted;
    if (typeof body.name === 'string') {
      const name = body.name.trim().slice(0, 120);
      if (name.length < 2) return NextResponse.json({ error: 'El nombre de la empresa debe tener al menos 2 caracteres.' }, { status: 400 });
      changes.name = name;
    }
    if (typeof body.currency === 'string') changes.currency = normalizeCurrency(body.currency);
    if (typeof body.currencySymbol === 'string' && body.currencySymbol.trim()) changes.currencySymbol = body.currencySymbol.trim().slice(0, 8);
    if (typeof body.locale === 'string' && body.locale.trim()) changes.locale = body.locale.trim().slice(0, 20);
    if (Object.keys(changes).length === 1) return NextResponse.json({ error: 'No hay cambios válidos.' }, { status: 400 });
    await getAdminDb().collection('tenants').doc(context.tenantId).update(changes);
    return NextResponse.json({ ok: true, ...changes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
