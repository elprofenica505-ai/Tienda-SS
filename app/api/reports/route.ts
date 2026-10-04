import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import {
  createFinancialReportDay,
  createFinancialReportPeriod,
  createFinancialReportRange,
  localDateKey,
  REPORT_PERIODS,
  type FinancialReportPeriod,
} from '@/lib/financial-reports';
import {
  getFinancialTenantSettings,
  loadFinancialReportDataset,
  resolveFinancialReportScope,
} from '@/lib/financial-reports-service';

export const runtime = 'nodejs';

function reportError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'REPORT_DATE_INVALID') return NextResponse.json({ error: 'La fecha del reporte no es válida.' }, { status: 400 });
  if (message === 'REPORT_DATE_FUTURE') return NextResponse.json({ error: 'La fecha del reporte no puede estar en el futuro.' }, { status: 400 });
  if (message === 'REPORT_TIME_INVALID') return NextResponse.json({ error: 'El rango de horas no es válido. La hora inicial debe ser anterior o igual a la final.' }, { status: 400 });
  if (message === 'REPORT_PERIOD_INVALID') return NextResponse.json({ error: 'Selecciona un período de hasta 365 días.' }, { status: 400 });
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}

function requestedBranch(request: NextRequest): string {
  return (request.headers.get('x-branch-id') || request.nextUrl.searchParams.get('branchId') || '').trim();
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'reports', 'view');
    const supabase = getSupabaseServer();
    const [settings, scope] = await Promise.all([
      getFinancialTenantSettings(supabase, context.tenantId),
      resolveFinancialReportScope(supabase, context, requestedBranch(request)),
    ]);
    const params = request.nextUrl.searchParams;
    const fromTime = params.get('fromTime') || '00:00';
    const toTime = params.get('toTime') || '23:59';
    const requestedDate = params.get('date');
    const today = localDateKey(new Date(), settings.timezone);

    if (requestedDate !== null) {
      const period = createFinancialReportDay(requestedDate, settings.timezone, fromTime, toTime);
      if (period.toDate > today) throw new Error('REPORT_DATE_FUTURE');
      const dataset = await loadFinancialReportDataset({ supabase, tenantId: context.tenantId, period, settings, scope });
      const day = dataset.daily[0];
      const issued = dataset.creditIssues.filter((credit) => localDateKey(credit.createdAt, settings.timezone) === requestedDate);
      const collected = dataset.creditCollections.filter((payment) => localDateKey(payment.createdAt, settings.timezone) === requestedDate);
      return NextResponse.json({
        ok: true,
        date: requestedDate,
        currency: dataset.currency,
        branchId: dataset.branchId,
        day,
        hourly: dataset.hourly,
        details: {
          sales: dataset.sales.filter((sale) => sale.date === requestedDate),
          returns: dataset.returns.filter((item) => item.date === requestedDate),
          expenses: dataset.expenses.filter((expense) => localDateKey(expense.createdAt, settings.timezone) === requestedDate),
          credit: {
            issued,
            collections: collected,
            currentOpenBalanceForDay: issued.reduce((sum, item) => sum + Math.max(0, item.outstandingAmount), 0),
            currentOpenBalance: dataset.summary.openCredit,
          },
        },
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

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
    if (period.toDate > today) throw new Error('REPORT_DATE_FUTURE');
    const dataset = await loadFinancialReportDataset({ supabase, tenantId: context.tenantId, period, settings, scope });
    return NextResponse.json({
      ok: true,
      period: { days: period.days, from: period.fromDate, to: period.toDate, timeZone: period.timeZone, fromTime: period.fromTime, toTime: period.toTime },
      currency: dataset.currency,
      branchId: dataset.branchId,
      summary: dataset.summary,
      daily: dataset.daily,
      hourly: dataset.hourly,
      paymentMethods: dataset.paymentMethods,
      topProducts: dataset.topProducts,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return reportError(error);
  }
}
