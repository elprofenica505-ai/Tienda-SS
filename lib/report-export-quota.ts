import { NextResponse } from 'next/server';
import { localDateOfInstant } from '@/lib/financial-period';

type QuotaResult = Record<string, unknown>;

export function reportExportQuotaFailure(quota: QuotaResult, tenantName: string, timeZone: string): NextResponse | null {
  if (quota.allowed === true) return null;
  if (quota.code === 'DAILY_EXPORT_LIMIT') {
    const resetAt = typeof quota.resetAt === 'string' ? quota.resetAt : '';
    const resetDate = resetAt ? localDateOfInstant(resetAt, timeZone) : '';
    const resetLabel = resetDate ? `${resetDate} a las 00:00 (${timeZone})` : 'a las 00:00, según la zona horaria de la empresa';
    return NextResponse.json({
      error: `Se agotaron las 3 exportaciones financieras diarias compartidas por ${tenantName}. El límite se reanuda el ${resetLabel}.`,
      code: 'DAILY_EXPORT_LIMIT',
      limit: 3,
      used: Number(quota.used || 3),
      resetAt,
      timezone: timeZone,
    }, { status: 429, headers: { 'Cache-Control': 'no-store' } });
  }
  if (quota.code === 'MONTHLY_EXPORT_LIMIT') {
    return NextResponse.json({
      error: `El plan de ${tenantName} alcanzó su límite de ${Number(quota.limit || 0)} exportaciones financieras mensuales.`,
      code: 'ENTITLEMENT_EXCEEDED',
      entitlement: 'monthlyExports',
      limit: Number(quota.limit || 0),
      used: Number(quota.used || 0),
      month: String(quota.month || ''),
    }, { status: 402, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ error: 'No se pudo verificar el límite de exportaciones. Intenta nuevamente más tarde.', code: 'EXPORT_QUOTA_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
