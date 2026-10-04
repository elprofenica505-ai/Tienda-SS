import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertEntitlementCapacity, getEntitlementLimit } from '@/lib/entitlements';
import { createFinancialReportPeriod, localDateKey, REPORT_PERIODS } from '@/lib/financial-reports';
import {
  getFinancialTenantSettings,
  loadFinancialReportDataset,
  resolveFinancialReportScope,
} from '@/lib/financial-reports-service';
import { createFinancialReportCsv, createFinancialReportWorkbook } from '@/lib/report-workbook';

export const runtime = 'nodejs';

function exportError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'REPORT_PERIOD_INVALID') return NextResponse.json({ error: 'Selecciona un período de 7, 30, 90 o 365 días.' }, { status: 400 });
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'reports', 'export');
    const supabase = getSupabaseServer();
    const settings = await getFinancialTenantSettings(supabase, context.tenantId);
    const params = request.nextUrl.searchParams;
    const format = params.get('format') || 'csv';
    if (format !== 'csv' && format !== 'xlsx') return NextResponse.json({ error: 'Formato no válido. Usa csv o xlsx.' }, { status: 400 });
    const rawDays = params.get('days');
    const days = rawDays === null ? 30 : Number(rawDays);
    if (!(REPORT_PERIODS as readonly number[]).includes(days)) throw new Error('REPORT_PERIOD_INVALID');

    const branchId = (request.headers.get('x-branch-id') || params.get('branchId') || '').trim();
    const scope = await resolveFinancialReportScope(supabase, context, branchId);
    const month = localDateKey(new Date(), settings.timezone).slice(0, 7);
    const usageResult = await supabase.from('entitlement_usage').select('monthly_exports').eq('tenant_id', context.tenantId).eq('month', month).maybeSingle();
    if (usageResult.error) throw new Error(usageResult.error.message);
    const currentExports = Number(usageResult.data?.monthly_exports || 0);
    const monthlyExportLimit = getEntitlementLimit(settings.plan, 'monthlyExports');
    assertEntitlementCapacity(settings.plan, 'monthlyExports', currentExports);

    const period = createFinancialReportPeriod(days, settings.timezone);
    const dataset = await loadFinancialReportDataset({ supabase, tenantId: context.tenantId, period, settings, scope });
    const tenantResult = await (supabase as any).from('tenants').select('name').eq('id', context.tenantId).maybeSingle();
    if (tenantResult.error) throw new Error(tenantResult.error.message);
    const tenantName = typeof tenantResult.data?.name === 'string' ? tenantResult.data.name : 'Empresa';
    let branchLabel = 'Todas las sucursales autorizadas';
    if (scope.branchId) {
      const branchResult = await (supabase as any).from('branches').select('name').eq('tenant_id', context.tenantId).eq('id', scope.branchId).maybeSingle();
      if (branchResult.error) throw new Error(branchResult.error.message);
      branchLabel = typeof branchResult.data?.name === 'string' ? branchResult.data.name : `Sucursal ${scope.branchId}`;
    }

    const extension = format === 'xlsx' ? 'xlsx' : 'csv';
    const contentType = format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv; charset=utf-8';
    const content = format === 'xlsx'
      ? createFinancialReportWorkbook(dataset, { tenantName, branchLabel })
      : new TextEncoder().encode(createFinancialReportCsv(dataset));

    const usageIncrement = await (supabase as any).rpc('increment_entitlement_monthly_exports', {
      target_tenant_id: context.tenantId,
      target_month: month,
      target_limit: Number.isFinite(monthlyExportLimit) ? monthlyExportLimit : null,
    });
    if (usageIncrement.error) throw new Error(usageIncrement.error.message);

    const filename = `reporte-financiero-${period.fromDate}-a-${period.toDate}.${extension}`;
    const responseBody = format === 'xlsx'
      ? new Blob([Uint8Array.from(content).buffer], { type: contentType })
      : new TextDecoder().decode(content);
    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Report-Period': String(days),
      },
    });
  } catch (error: unknown) {
    return exportError(error);
  }
}
