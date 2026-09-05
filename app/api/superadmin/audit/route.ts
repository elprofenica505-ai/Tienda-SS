import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireSuperadmin, superadminErrorResponse } from '@/lib/superadmin';

export const runtime = 'nodejs';
function text(value: string | null) { return value?.trim().slice(0, 80) || ''; }
export async function GET(request: NextRequest) {
  try {
    await requireSuperadmin(request); const url = new URL(request.url); const action = text(url.searchParams.get('action')); const tenantId = text(url.searchParams.get('tenantId')); const page = Math.max(1, Number(url.searchParams.get('page') || '1')); const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get('pageSize') || '25')));
    const snapshot = await getAdminDb().collection('platformAudit').orderBy('createdAt', 'desc').limit(500).get(); const records: Array<Record<string, unknown> & { id: string }> = snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>) })); const filtered = records.filter((item) => (!action || item.action === action) && (!tenantId || item.tenantId === tenantId)); const start = (page - 1) * pageSize;
    return NextResponse.json({ ok: true, logs: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize, hasNext: start + pageSize < filtered.length, generatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { const response = superadminErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
