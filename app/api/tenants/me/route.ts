import { NextRequest, NextResponse } from 'next/server';
import { normalizeCurrency, DEFAULT_TENANT_LOCALE, DEFAULT_TENANT_SYMBOL } from '@/lib/currency';
import { findTenantsForAuthUserId } from '@/lib/repositories/organization-repository';
import { updateTenant } from '@/lib/repositories/tenant-repository';
import { requireSupabaseTenantPermission } from '@/lib/supabase/tenant-access';
import { getSupabaseServer } from '@/lib/supabase/server';
import { tenantErrorResponse } from '@/lib/tenant';

export const runtime = 'nodejs';

function supabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('SUPABASE_') || message.includes('relation') || message.includes('schema cache')) {
    return NextResponse.json({ error: 'La conexión del servidor con Supabase no está configurada correctamente.' }, { status: 503 });
  }
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}

export async function GET(request: NextRequest) {
  try {
    const header = request.headers.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return NextResponse.json({ error: 'Autenticación requerida.' }, { status: 401 });
    const result = await getSupabaseServer().auth.getUser(token);
    if (result.error || !result.data.user) return NextResponse.json({ error: 'Autenticación requerida.' }, { status: 401 });
    const available = await findTenantsForAuthUserId(result.data.user.id);
    if (!available.length) return NextResponse.json({ error: 'Tu usuario no tiene una empresa activa.' }, { status: 403 });
    const requestedTenantId = request.headers.get('x-tenant-id')?.trim();
    const activeTenantId = requestedTenantId && available.some((item) => item.tenant.id === requestedTenantId)
      ? requestedTenantId
      : available[0].tenant.id;
    return NextResponse.json({
      ok: true,
      activeTenantId,
      tenants: available.map((item) => ({
        tenant: {
          ...item.tenant,
          currency: normalizeCurrency(item.tenant.currency),
          currencySymbol: item.tenant.currencySymbol || DEFAULT_TENANT_SYMBOL,
          locale: item.tenant.locale || DEFAULT_TENANT_LOCALE,
        },
        member: item.member,
      })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    console.error('tenant_me_supabase_failed', { message: error instanceof Error ? error.message : 'unknown' });
    return supabaseError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireSupabaseTenantPermission(request, 'dashboard', 'edit');
    const body = await request.json();
    const changes: Record<string, unknown> = {};
    if (typeof body.name === 'string') {
      const name = body.name.trim().slice(0, 120);
      if (name.length < 2) return NextResponse.json({ error: 'El nombre de la empresa debe tener al menos 2 caracteres.' }, { status: 400 });
      changes.name = name;
    }
    if (typeof body.currency === 'string') changes.currency = normalizeCurrency(body.currency);
    if (Object.keys(changes).length === 0) return NextResponse.json({ error: 'No hay cambios válidos.' }, { status: 400 });
    const tenant = await updateTenant(context.tenantId, changes);
    return NextResponse.json({ ok: true, ...changes, tenant }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return supabaseError(error);
  }
}
