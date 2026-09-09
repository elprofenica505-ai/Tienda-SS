import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { writeImmutableAudit } from '@/lib/audit';
import { assertBranchAccess } from '@/lib/data-scope';

export const runtime = 'nodejs';
function text(value: unknown, max = 300) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function amount(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(0, value) * 100) / 100 : 0; }

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'receivables', 'edit');
    const body = await request.json();
    const saleId = text(body.saleId, 120);
    const noteAmount = amount(body.amount);
    const reason = text(body.reason);
    if (!saleId || noteAmount <= 0 || reason.length < 3) return NextResponse.json({ error: 'Venta, monto y motivo son obligatorios.' }, { status: 400 });
    const branchId = text(body.branchId, 120) || request.headers.get('x-branch-id')?.trim() || context.branchIds[0] || '';
    if (!branchId) return NextResponse.json({ error: 'Selecciona una sucursal para crear la nota de crédito.' }, { status: 400 });
    assertBranchAccess(context, branchId);
    const db = getAdminDb();
    const tenant = db.collection('tenants').doc(context.tenantId);
    const saleRef = tenant.collection('sales').doc(saleId);
    const noteRef = tenant.collection('creditNotes').doc();
    const result = await db.runTransaction(async (transaction) => {
      const saleSnapshot = await transaction.get(saleRef);
      if (!saleSnapshot.exists) throw new Error('SALE_NOT_FOUND');
      const sale = saleSnapshot.data() || {};
      if (sale.status === 'void') throw new Error('SALE_VOID');
      if (sale.branchId && sale.branchId !== branchId) throw new Error('SALE_WRONG_BRANCH');
      const total = amount(sale.total);
      const creditedTotal = amount(sale.creditedTotal);
      if (creditedTotal + noteAmount > total) throw new Error('CREDIT_NOTE_EXCEEDS_TOTAL');
      const paidAmount = amount(sale.paidAmount);
      const newCreditedTotal = creditedTotal + noteAmount;
      const balanceDue = Math.max(0, Math.round((total - newCreditedTotal - paidAmount) * 100) / 100);
      const paymentStatus = balanceDue <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'pending';
      const now = new Date();
      const customerRef = sale.customerId ? tenant.collection('customers').doc(text(sale.customerId, 120)) : null;
      const customerSnapshot = customerRef ? await transaction.get(customerRef) : null;
      if (sale.paymentMethod === 'credit' && customerRef && customerSnapshot?.exists) {
        const currentBalance = amount(customerSnapshot.data()?.creditBalance);
        const nextBalance = Math.max(0, currentBalance - noteAmount);
        transaction.update(customerRef, { creditBalance: nextBalance, updatedAt: now, updatedBy: context.uid });
        transaction.create(tenant.collection('creditMovements').doc(), { customerId: text(sale.customerId, 120), saleId, creditNoteId: noteRef.id, type: 'credit_note', amount: noteAmount, balanceAfter: nextBalance, createdBy: context.uid, createdAt: now });
      }
      transaction.update(saleRef, { creditedTotal: newCreditedTotal, balanceDue, paymentStatus, branchId, updatedAt: now, updatedBy: context.uid });
      transaction.create(noteRef, { saleId, branchId, amount: noteAmount, reason, status: 'applied', createdBy: context.uid, createdAt: now });
      return { saleId, creditNoteId: noteRef.id, amount: noteAmount, creditedTotal: newCreditedTotal, balanceDue, paymentStatus, before: { total, creditedTotal, paidAmount, balanceDue: amount(sale.balanceDue) }, after: { total, creditedTotal: newCreditedTotal, paidAmount, balanceDue, paymentStatus } };
    });
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'receivable.credit_note_created', entity: 'sale', entityId: saleId, before: result.before, after: result.after, metadata: { creditNoteId: result.creditNoteId, amount: result.amount }, request: { requestId: request.headers.get('x-correlation-id') || undefined, method: 'POST', path: '/api/receivables/credit-notes' }, result: 'success' });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'SALE_NOT_FOUND') return NextResponse.json({ error: 'La venta no existe.' }, { status: 404 });
    if (message === 'SALE_VOID') return NextResponse.json({ error: 'Una venta anulada no admite nota de crédito.' }, { status: 409 });
    if (message === 'CREDIT_NOTE_EXCEEDS_TOTAL') return NextResponse.json({ error: 'La nota de crédito supera el total disponible de la venta.' }, { status: 409 });
    if (message === 'SALE_WRONG_BRANCH') return NextResponse.json({ error: 'La venta no pertenece a la sucursal activa.' }, { status: 403 });
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}
