import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { tenantErrorResponse } from '@/lib/tenant';
import { consumeDistributedRateLimits, getClientAddress, hashRateLimitIdentity, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

function validEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function responseFor(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('Gateway Timeout') || message.includes('TIMEOUT') || message.includes('timed out')) {
    return NextResponse.json({ error: 'El servicio de registro tardó demasiado en responder. Espera unos segundos y vuelve a intentarlo.' }, { status: 503 });
  }
  if (message.includes('email_exists') || message.includes('already registered') || message.includes('already been registered')) {
    return NextResponse.json({ error: 'Ese correo ya está registrado. Prueba iniciar sesión con ese correo.' }, { status: 409 });
  }
  if (message.startsWith('SUPABASE_') || message.includes('relation') || message.includes('schema cache')) {
    return NextResponse.json({ error: 'La conexión del servidor con Supabase no está configurada correctamente.' }, { status: 503 });
  }
  if (message.includes('AUTH_USER_ALREADY_ONBOARDED')) {
    return NextResponse.json({ error: 'Ese usuario ya tiene una empresa configurada.' }, { status: 409 });
  }
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}

export async function POST(request: NextRequest) {
  let createdUserId: string | null = null;
  try {
    const body = await request.json();
    const companyName = typeof body.name === 'string' ? body.name.trim() : '';
    const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const website = typeof body.website === 'string' ? body.website.trim() : '';
    if (website) return NextResponse.json({ error: 'No se pudo crear la empresa.' }, { status: 400 });
    if (companyName.length < 2 || companyName.length > 120 || ownerName.length < 2 || ownerName.length > 120 || !validEmail(email) || password.length < 8) {
      return NextResponse.json({ error: 'Revisa el nombre, correo y contraseña.' }, { status: 400 });
    }

    const rate = await consumeDistributedRateLimits(
      { endpoint: 'tenant-signup', ip: getClientAddress(request), email: hashRateLimitIdentity(email) },
      { ip: 5, email: 3, endpoint: 100, composite: 5 },
      15 * 60 * 1000,
    );
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds, rate.blockedBy);

    const supabase = getSupabaseServer();
    const created = await supabase.auth.admin.createUser({ email, password, user_metadata: { display_name: ownerName }, email_confirm: false });
    if (created.error || !created.data.user) throw new Error(`SUPABASE_AUTH_CREATE_FAILED: ${created.error?.message || 'No se pudo crear el usuario.'}`);
    createdUserId = created.data.user.id;

    const onboarding = await supabase.rpc('create_initial_tenant', {
      target_auth_user_id: created.data.user.id,
      target_email: email,
      target_display_name: ownerName,
      target_company_name: companyName,
    });
    if (onboarding.error) throw new Error(`SUPABASE_ONBOARDING_FAILED: ${onboarding.error.message || 'No se pudo crear la empresa.'}`);

    return NextResponse.json({ ok: true, tenantId: onboarding.data, authProvider: 'supabase' }, { status: 201 });
  } catch (error: unknown) {
    if (createdUserId) {
      try { await getSupabaseServer().auth.admin.deleteUser(createdUserId); } catch { console.error('supabase_owner_cleanup_failed'); }
    }
    console.error('supabase_tenant_creation_failed', { message: error instanceof Error ? error.message : 'unknown' });
    return responseFor(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { requireSupabaseTenantPermission } = await import('@/lib/supabase/tenant-access');
    const context = await requireSupabaseTenantPermission(request, 'dashboard', 'view');
    const tenant = await getSupabaseServer().from('tenants').select('id,legacy_firestore_id,slug,name,status,timezone,currency,plan,subscription_status,stripe_customer_id,last_payment_failure_at,last_stripe_event_created,onboarding_completed,created_at,updated_at').eq('id', context.tenantId).maybeSingle();
    if (tenant.error) throw new Error(tenant.error.message);
    return NextResponse.json({ ok: true, tenant: tenant.data, member: context });
  } catch (error: unknown) {
    return responseFor(error);
  }
}
