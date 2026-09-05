import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantMember, tenantErrorResponse } from '@/lib/tenant';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try { const context = await requireTenantMember(request); const snapshot = await getAdminDb().collection('tenants').doc(context.tenantId).collection('notifications').orderBy('createdAt', 'desc').limit(50).get(); return NextResponse.json({ ok: true, notifications: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
export async function PATCH(request: NextRequest) {
  try { const context = await requireTenantMember(request); const body = await request.json(); const id = typeof body.id === 'string' ? body.id.trim() : ''; if (!id) return NextResponse.json({ error: 'Alerta inválida.' }, { status: 400 }); const ref = getAdminDb().collection('tenants').doc(context.tenantId).collection('notifications').doc(id); if (!(await ref.get()).exists) return NextResponse.json({ error: 'Alerta no encontrada.' }, { status: 404 }); await ref.update({ read: true, readAt: new Date(), readBy: context.uid }); return NextResponse.json({ ok: true, id }); }
  catch (error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
