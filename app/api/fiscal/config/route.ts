import { NextRequest, NextResponse } from 'next/server';
import { requireTenantMember, tenantErrorResponse } from '@/lib/tenant';
import { getSupabaseServer } from '@/lib/supabase/server';
import { FISCAL_PROVIDERS, fiscalConfigForStorage, normalizeFiscalConfig, validateFiscalConfig } from '@/lib/fiscal-adapters';

export const runtime = 'nodejs';
const MANAGERS = ['owner', 'admin', 'gerente'];

function configFromRow(row: Record<string, unknown> | null | undefined) {
  const metadata = row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  return normalizeFiscalConfig({
    ...metadata,
    provider: row?.provider,
    legalName: row?.legal_name,
    taxId: row?.tax_id,
  });
}

function publicConfig(config: ReturnType<typeof normalizeFiscalConfig>) {
  return { ...config, credentialRef: config.credentialRef ? 'configured' : undefined };
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantMember(request);
    const { data, error } = await getSupabaseServer()
      .from('fiscal_configs')
      .select('provider,tax_id,legal_name,metadata')
      .eq('tenant_id', context.tenantId)
      .maybeSingle();
    if (error) throw new Error(`SUPABASE_FISCAL_CONFIG_READ:${error.message}`);
    return NextResponse.json({ ok: true, config: publicConfig(configFromRow(data)), providers: FISCAL_PROVIDERS });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireTenantMember(request);
    if (!MANAGERS.includes(context.role)) return NextResponse.json({ error: 'Solo un responsable puede configurar facturación electrónica.' }, { status: 403 });
    const body = await request.json();
    if (typeof body.logoDataUrl === 'string' && body.logoDataUrl.length > 350_000) return NextResponse.json({ error: 'El logotipo es demasiado grande. Usa una imagen de máximo 350 KB.' }, { status: 400 });
    const supabase = getSupabaseServer();
    const { data: currentRow, error: readError } = await supabase
      .from('fiscal_configs')
      .select('provider,tax_id,legal_name,metadata')
      .eq('tenant_id', context.tenantId)
      .maybeSingle();
    if (readError) throw new Error(`SUPABASE_FISCAL_CONFIG_READ:${readError.message}`);
    const current = configFromRow(currentRow);
    const config = normalizeFiscalConfig(body, current);
    const validationError = validateFiscalConfig(config);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const { error: writeError } = await supabase.from('fiscal_configs').upsert({
      tenant_id: context.tenantId,
      provider: config.provider,
      tax_id: config.taxId || null,
      legal_name: config.legalName || null,
      enabled: config.mode !== 'manual',
      metadata: { ...fiscalConfigForStorage(config), updatedBy: context.uid },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' });
    if (writeError) throw new Error(`SUPABASE_FISCAL_CONFIG_WRITE:${writeError.message}`);
    return NextResponse.json({ ok: true, config: publicConfig(config) });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}
