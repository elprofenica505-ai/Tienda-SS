import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { createApiKey } from '@/lib/public-api';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'members', 'create');
    const db = getAdminDb();
    const created = createApiKey();
    const ref = db.collection('tenants').doc(context.tenantId).collection('apiKeys').doc();
    await ref.set({ hash: created.hash, prefix: created.prefix, label: 'Preview API', status: 'active', createdBy: context.uid, createdAt: new Date() });
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'api_key.created', entity: 'apiKey', entityId: ref.id, after: { prefix: created.prefix, status: 'active' }, request: { method: 'POST', path: '/api/v1/keys', requestId: request.headers.get('x-correlation-id') || undefined }, result: 'success' });
    return NextResponse.json({ ok: true, keyId: ref.id, apiKey: created.value, warning: 'Guárdala ahora. No se volverá a mostrar.' }, { status: 201 });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
