import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { reportExportQuotaFailure } from '@/lib/report-export-quota';
import { createFinancialReportPeriod, createFinancialReportRange, localDateKey, REPORT_PERIODS, type FinancialReportPeriod } from '@/lib/financial-reports';
import {
  getFinancialTenantSettings,
  loadFinancialReportDataset,
  resolveFinancialReportScope,
} from '@/lib/financial-reports-service';
import { createFinancialReportCsv, createFinancialReportWorkbook } from '@/lib/report-workbook';

export const runtime = 'nodejs';

function exportError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'REPORT_DATE_INVALID') return NextResponse.json({ error: 'La fecha del reporte no es válida.' }, { status: 400 });
  if (message === 'REPORT_DATE_FUTURE') return NextResponse.json({ error: 'La fecha del reporte no puede estar en el futuro.' }, { status: 400 });
  if (message === 'REPORT_TIME_INVALID') return NextResponse.json({ error: 'El rango de horas no es válido. La hora inicial debe ser anterior o igual a la final.' }, { status: 400 });
  if (message === 'REPORT_PERIOD_INVALID') return NextResponse.json({ error: 'Selecciona un período de hasta 365 días.' }, { status: 400 });
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
    const fromTime = params.get('fromTime') || '00:00';
    const toTime = params.get('toTime') || '23:59';
    const requestedFromDate = params.get('fromDate');
    const requestedToDate = params.get('toDate');
    let period: FinancialReportPeriod;
    if (requestedFromDate !== null || requestedToDate !== null) {
      if (!requestedFromDate || !requestedToDate) throw new Error('REPORT_DATE_INVALID');
      period = createFinancialReportRange(requestedFromDate, requestedToDate, settings.timezone, fromTime, toTime);
    } else {
      const rawDays = params.get('days');
      const days = rawDays === null ? 30 : Number(rawDays);
      if (!(REPORT_PERIODS as readonly number[]).includes(days)) throw new Error('REPORT_PERIOD_INVALID');
      period = createFinancialReportPeriod(days, settings.timezone, new Date(), fromTime, toTime);
    }
    if (period.toDate > localDateKey(new Date(), settings.timezone)) throw new Error('REPORT_DATE_FUTURE');

    const branchId = (request.headers.get('x-branch-id') || params.get('branchId') || '').trim();
    const scope = await resolveFinancialReportScope(supabase, context, branchId);
    const tenantResult = await (supabase as any).from('tenants').select('name').eq('id', context.tenantId).maybeSingle();
    if (tenantResult.error) throw new Error(tenantResult.error.message);
    const tenantName = typeof tenantResult.data?.name === 'string' ? tenantResult.data.name : 'Empresa';
    const exportQuota = await supabase.rpc('consume_financial_report_export', {
      target_tenant_id: context.tenantId,
      target_user_id: context.uid,
    });
    if (exportQuota.error) throw new Error(exportQuota.error.message);
    const quotaData = exportQuota.data && typeof exportQuota.data === 'object'
      ? exportQuota.data as Record<string, unknown>
      : {};
    const blocked = reportExportQuotaFailure(quotaData, tenantName, settings.timezone);
    if (blocked) return blocked;

    const dataset = await loadFinancialReportDataset({ supabase, tenantId: context.tenantId, period, settings, scope });
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

    const filename = period.fromDate === period.toDate
      ? `reporte-financiero-${period.fromDate}.${extension}`
      : `reporte-financiero-${period.fromDate}-a-${period.toDate}.${extension}`;
    const responseBody = format === 'xlsx'
      ? new Blob([Uint8Array.from(content).buffer], { type: contentType })
      : new TextDecoder().decode(content);
    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Report-Period': String(period.days),
      },
    });
  } catch (error: unknown) {
    return exportError(error);
  }
}
