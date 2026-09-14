import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { createApiKey } from '@/lib/public-api';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'members', 'create'); const created = createApiKey();
    const result = await getSupabaseServer().from('api_keys').insert({ tenant_id: context.tenantId, hash: created.hash, prefix: created.prefix, label: 'Preview API', status: 'active', created_by: context.uid }).select('id').single(); if (result.error) throw new Error(result.error.message);
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'api_key.created', entity: 'apiKey', entityId: result.data.id, after: { prefix: created.prefix, status: 'active' }, request: { method: 'POST', path: '/api/v1/keys', requestId: request.headers.get('x-correlation-id') || undefined }, result: 'success' });
    return NextResponse.json({ ok: true, keyId: result.data.id, apiKey: created.value, warning: 'Guárdala ahora. No se volverá a mostrar.' }, { status: 201 });
  } catch (error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
