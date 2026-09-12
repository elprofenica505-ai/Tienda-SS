import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantMember, tenantErrorResponse } from '@/lib/tenant';
import { FISCAL_PROVIDERS, fiscalConfigForStorage, normalizeFiscalConfig, validateFiscalConfig } from '@/lib/fiscal-adapters';

export const runtime = 'nodejs';
const MANAGERS = ['owner', 'admin', 'gerente'];

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantMember(request);
    const ref = getAdminDb().collection('tenants').doc(context.tenantId).collection('settings').doc('fiscal');
    const snapshot = await ref.get();
    const config = normalizeFiscalConfig(snapshot.exists ? (snapshot.data() || {}) : {});
    return NextResponse.json({ ok: true, config: { ...config, credentialRef: config.credentialRef ? 'configured' : undefined }, providers: FISCAL_PROVIDERS });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireTenantMember(request);
    if (!MANAGERS.includes(context.role)) return NextResponse.json({ error: 'Solo un responsable puede configurar facturación electrónica.' }, { status: 403 });
    const body = await request.json();
    const ref = getAdminDb().collection('tenants').doc(context.tenantId).collection('settings').doc('fiscal');
    const currentSnapshot = await ref.get();
    const current = currentSnapshot.exists ? currentSnapshot.data() || {} : {};
    const config = normalizeFiscalConfig(body, current);
    const validationError = validateFiscalConfig(config);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const stored = { ...fiscalConfigForStorage(config), updatedAt: new Date(), updatedBy: context.uid };
    await ref.set(stored, { merge: true });
    return NextResponse.json({ ok: true, config: { ...config, credentialRef: config.credentialRef ? 'configured' : undefined } });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}
