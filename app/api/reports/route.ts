import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import {
  createFinancialReportDay,
  createFinancialReportPeriod,
  localDateKey,
  REPORT_PERIODS,
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
  if (message === 'REPORT_PERIOD_INVALID') return NextResponse.json({ error: 'Selecciona un período de 7, 30, 90 o 365 días.' }, { status: 400 });
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
    const requestedDate = request.nextUrl.searchParams.get('date');

    if (requestedDate !== null) {
      const period = createFinancialReportDay(requestedDate, settings.timezone);
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

    const rawDays = request.nextUrl.searchParams.get('days');
    const days = rawDays === null ? 30 : Number(rawDays);
    if (!(REPORT_PERIODS as readonly number[]).includes(days)) throw new Error('REPORT_PERIOD_INVALID');
    const period = createFinancialReportPeriod(days, settings.timezone);
    const dataset = await loadFinancialReportDataset({ supabase, tenantId: context.tenantId, period, settings, scope });
    return NextResponse.json({
      ok: true,
      period: { days, from: period.fromDate, to: period.toDate, timeZone: period.timeZone },
      currency: dataset.currency,
      branchId: dataset.branchId,
      summary: dataset.summary,
      daily: dataset.daily,
      paymentMethods: dataset.paymentMethods,
      topProducts: dataset.topProducts,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return reportError(error);
  }
}
