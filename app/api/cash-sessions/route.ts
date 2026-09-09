import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';
import { cashDifference, cashMoney, expectedByMethod, findOpenCashSession, validCashMethod, type CashMethod } from '@/lib/cash';

export const runtime = 'nodejs';
const MANAGER_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);
function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function methods(value: unknown): Record<CashMethod, number> { const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}; return { cash: cashMoney(input.cash), card: cashMoney(input.card), transfer: cashMoney(input.transfer) }; }

async function sessionContext(request: NextRequest, action: 'view' | 'create' | 'edit') {
  const context = await requireTenantPermission(request, 'finance', action);
  const branchId = text(request.headers.get('x-branch-id'), 128) || context.branchIds[0] || '';
  if (!branchId) throw new Error('BRANCH_REQUIRED');
  assertBranchAccess(context, branchId);
  return { context, branchId, tenant: getAdminDb().collection('tenants').doc(context.tenantId) };
}

async function calculateExpected(tenant: FirebaseFirestore.DocumentReference, session: Record<string, unknown>) {
  const [salesSnapshot, movementsSnapshot] = await Promise.all([
    tenant.collection('sales').where('cashSessionId', '==', session.id).get(),
    tenant.collection('cashMovements').where('cashSessionId', '==', session.id).get(),
  ]);
  const rows: Array<Record<string, unknown>> = [
    ...salesSnapshot.docs.map((doc) => ({ paymentMethod: doc.data().paymentMethod, amount: doc.data().paidAmount || doc.data().total || 0 })),
    ...movementsSnapshot.docs.map((doc) => doc.data() as Record<string, unknown>),
  ];
  const expected = expectedByMethod(rows);
  const opening = methods(session.openingByMethod);
  expected.cash += opening.cash;
  expected.card += opening.card;
  expected.transfer += opening.transfer;
  return { expected, sales: salesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })), movements: movementsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) };
}

export async function GET(request: NextRequest) {
  try {
    const { context, branchId, tenant } = await sessionContext(request, 'view');
    const sessions = await tenant.collection('cashSessions').where('branchId', '==', branchId).orderBy('openedAt', 'desc').limit(30).get();
    const active = sessions.docs.find((doc) => doc.data()?.status === 'open');
    const activeData = active ? { id: active.id, ...active.data() } : null;
    const calculated = active ? await calculateExpected(tenant, { id: active.id, ...active.data() }) : null;
    return NextResponse.json({ ok: true, branchId, active: activeData ? { ...activeData, expectedByMethod: calculated?.expected, salesCount: calculated?.sales.length, movementCount: calculated?.movements.length } : null, sessions: sessions.docs.map((doc) => ({ id: doc.id, ...doc.data() })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'BRANCH_REQUIRED') return NextResponse.json({ error: 'Selecciona una sucursal antes de operar caja.' }, { status: 400 });
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = text(body.action, 30);
    const permission = action === 'open' || action === 'movement' ? 'create' : 'edit';
    const { context, branchId, tenant } = await sessionContext(request, permission);
    const now = new Date();
    if (action === 'open') {
      const registerId = text(body.registerId, 128);
      if (!registerId) return NextResponse.json({ error: 'Selecciona una caja para abrir el turno.' }, { status: 400 });
      const register = await tenant.collection('cashRegisters').doc(registerId).get();
      if (!register.exists || register.data()?.active === false || register.data()?.branchId !== branchId) return NextResponse.json({ error: 'La caja no pertenece a la sucursal activa.' }, { status: 404 });
      if (await findOpenCashSession(context.tenantId, branchId, registerId)) return NextResponse.json({ error: 'Esta caja ya tiene un turno abierto.' }, { status: 409 });
      const openingByMethod = methods(body.openingByMethod);
      const ref = tenant.collection('cashSessions').doc();
      const data = { branchId, registerId, status: 'open', openingByMethod, openedBy: context.uid, openedAt: now, updatedAt: now, currency: 'NIO' };
      await ref.create(data);
      await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'cash_session.opened', entity: 'cashSession', entityId: ref.id, after: data, result: 'success' });
      return NextResponse.json({ ok: true, session: { id: ref.id, ...data } }, { status: 201 });
    }
    const sessionId = text(body.sessionId, 128);
    if (!sessionId) return NextResponse.json({ error: 'El turno de caja es obligatorio.' }, { status: 400 });
    const sessionRef = tenant.collection('cashSessions').doc(sessionId);
    const sessionSnapshot = await sessionRef.get();
    if (!sessionSnapshot.exists || sessionSnapshot.data()?.branchId !== branchId) return NextResponse.json({ error: 'El turno no pertenece a la sucursal activa.' }, { status: 404 });
    const session = { id: sessionId, ...sessionSnapshot.data() } as Record<string, unknown>;
    if (action === 'movement') {
      if (session.status !== 'open') return NextResponse.json({ error: 'El turno no está abierto.' }, { status: 409 });
      const paymentMethod = text(body.paymentMethod, 30);
      const amount = cashMoney(body.amount);
      if (!validCashMethod(paymentMethod) || amount <= 0 || text(body.description, 2).length < 2) return NextResponse.json({ error: 'Método, descripción y monto son obligatorios.' }, { status: 400 });
      const ref = tenant.collection('cashMovements').doc();
      const data = { cashSessionId: sessionId, branchId, direction: body.direction === 'in' ? 'in' : 'out', amount, paymentMethod, description: text(body.description), notes: text(body.notes, 300), createdBy: context.uid, createdAt: now };
      await ref.create(data);
      await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'cash_movement.created', entity: 'cashMovement', entityId: ref.id, after: data, result: 'success' });
      return NextResponse.json({ ok: true, movement: { id: ref.id, ...data } }, { status: 201 });
    }
    const calculated = await calculateExpected(tenant, session);
    if (action === 'count') {
      if (session.status !== 'open') return NextResponse.json({ error: 'Solo se puede arquear un turno abierto.' }, { status: 409 });
      const countedByMethod = methods(body.countedByMethod);
      const difference = cashDifference(calculated.expected, countedByMethod);
      await sessionRef.update({ status: 'pending_review', countedByMethod, expectedByMethod: calculated.expected, difference, countedBy: context.uid, countedAt: now, updatedAt: now });
      await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'cash_session.counted', entity: 'cashSession', entityId: sessionId, before: session, after: { countedByMethod, expectedByMethod: calculated.expected, difference }, result: 'success' });
      return NextResponse.json({ ok: true, status: 'pending_review', expectedByMethod: calculated.expected, countedByMethod, difference });
    }
    if (action === 'close' || action === 'approve') {
      if (session.status !== 'pending_review') return NextResponse.json({ error: 'El turno debe estar arqueado antes de cerrarse.' }, { status: 409 });
      const difference = Number(session.difference || 0);
      if (action === 'close' && difference !== 0 && !MANAGER_ROLES.has(context.role)) return NextResponse.json({ error: 'La diferencia requiere aprobación de un supervisor o gerente.' }, { status: 403 });
      if (action === 'approve' && !MANAGER_ROLES.has(context.role)) return NextResponse.json({ error: 'Solo un responsable puede aprobar la diferencia.' }, { status: 403 });
      const data = { status: 'closed', closedBy: context.uid, closedAt: now, approvedBy: difference !== 0 ? context.uid : null, updatedAt: now };
      await sessionRef.update(data);
      await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: difference !== 0 ? 'cash_session.approved_and_closed' : 'cash_session.closed', entity: 'cashSession', entityId: sessionId, before: session, after: data, result: 'success' });
      return NextResponse.json({ ok: true, ...data, difference });
    }
    return NextResponse.json({ error: 'Acción de caja no soportada.' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'BRANCH_REQUIRED') return NextResponse.json({ error: 'Selecciona una sucursal antes de operar caja.' }, { status: 400 });
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}
