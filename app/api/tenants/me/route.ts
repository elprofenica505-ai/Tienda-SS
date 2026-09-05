import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const header = request.headers.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return NextResponse.json({ error: 'Autenticación requerida.' }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(token);
    const db = getAdminDb();
    const memberships = await db.collectionGroup('members').where('uid', '==', decoded.uid).get();
    const requestedTenantId = request.headers.get('x-tenant-id')?.trim();

    const tenants = await Promise.all(memberships.docs
      .filter((memberDoc) => memberDoc.data().status === 'active')
      .map(async (memberDoc) => {
      const tenantRef = memberDoc.ref.parent.parent;
      if (!tenantRef) return null;
      const tenantDoc = await tenantRef.get();
      if (!tenantDoc.exists || tenantDoc.data()?.status !== 'active') return null;
      return {
        tenant: { id: tenantDoc.id, ...tenantDoc.data() },
        member: { id: memberDoc.id, ...memberDoc.data() }
      };
    }));

    const available = tenants.filter(Boolean) as Array<{ tenant: { id: string }; member: Record<string, unknown> }>;
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
    console.error('tenant_me_failed', { message: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: 'No se pudo cargar el espacio de trabajo.' }, { status: 500 });
  }
}
