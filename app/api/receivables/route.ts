import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse, TenantRole } from '@/lib/tenant';

export const runtime = 'nodejs';
const paymentRoles: TenantRole[] = ['owner', 'admin', 'jefe', 'vendedor', 'cajero'];
function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function amount(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(0, value) * 100) / 100 : 0; }

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'receivables', 'view');
    const tenant = getAdminDb().collection('tenants').doc(context.tenantId);
    const [salesSnapshot, paymentsSnapshot] = await Promise.all([
      tenant.collection('sales').where('paymentMethod', '==', 'credit').get(),
      tenant.collection('receivablePayments').orderBy('createdAt', 'desc').limit(50).get()
    ]);
    const payments = paymentsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const sales: Array<Record<string, unknown> & { id: string; total: number; paidAmount: number; balanceDue: number; paymentStatus: string }> = salesSnapshot.docs.map((item) => {
      const data = item.data() as Record<string, unknown>;
      const total = amount(data.total);
      const paidAmount = amount(data.paidAmount);
      const balanceDue = typeof data.balanceDue === 'number' ? amount(data.balanceDue) : Math.max(0, total - paidAmount);
      return { id: item.id, ...data, total, paidAmount, balanceDue, paymentStatus: balanceDue <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'pending' };
    }).filter((item) => item.balanceDue > 0 || item.paymentStatus === 'paid');
    const byCustomer = new Map<string, { customerId: string; customerName: string; sales: number; total: number; paid: number; balance: number }>();
    for (const sale of sales) {
      const key = String(sale.customerId || 'unknown');
      const current = byCustomer.get(key) || { customerId: key, customerName: String(sale.customerName || 'Cliente sin identificar'), sales: 0, total: 0, paid: 0, balance: 0 };
      current.sales += 1; current.total += amount(sale.total); current.paid += amount(sale.paidAmount); current.balance += amount(sale.balanceDue); byCustomer.set(key, current);
    }
    return NextResponse.json({ ok: true, summary: { receivables: sales.filter((sale) => sale.balanceDue > 0).length, balance: sales.reduce((sum, sale) => sum + sale.balanceDue, 0), collected: sales.reduce((sum, sale) => sum + sale.paidAmount, 0) }, customers: Array.from(byCustomer.values()).sort((a, b) => b.balance - a.balance), sales, payments }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'receivables', 'create');
    const body = await request.json();
    const saleId = text(body.saleId, 120);
    const payment = amount(body.amount);
    const method = ['cash', 'card', 'transfer'].includes(body.paymentMethod) ? body.paymentMethod : '';
    if (!saleId || payment <= 0 || !method) return NextResponse.json({ error: 'Venta, monto y método de pago son obligatorios.' }, { status: 400 });
    const db = getAdminDb(); const tenant = db.collection('tenants').doc(context.tenantId); const saleRef = tenant.collection('sales').doc(saleId); const paymentRef = tenant.collection('receivablePayments').doc();
    const result = await db.runTransaction(async (transaction) => {
      const sale = await transaction.get(saleRef);
      if (!sale.exists || sale.data()?.paymentMethod !== 'credit') throw new Error('SALE_NOT_FOUND');
      const data = sale.data() || {}; const total = amount(data.total); const paidAmount = amount(data.paidAmount); const balanceDue = typeof data.balanceDue === 'number' ? amount(data.balanceDue) : Math.max(0, total - paidAmount);
      if (payment > balanceDue) throw new Error('PAYMENT_EXCEEDS_BALANCE');
      const newPaid = amount(paidAmount + payment); const newBalance = amount(balanceDue - payment); const paymentStatus = newBalance <= 0 ? 'paid' : 'partial'; const now = new Date();
      transaction.update(saleRef, { paidAmount: newPaid, balanceDue: newBalance, paymentStatus, updatedAt: now, updatedBy: context.uid });
      transaction.set(paymentRef, { saleId, customerId: data.customerId || null, customerName: data.customerName || 'Cliente sin identificar', amount: payment, paymentMethod: method, notes: text(body.notes, 300), createdBy: context.uid, createdAt: now });
      return { saleId, paymentId: paymentRef.id, paidAmount: newPaid, balanceDue: newBalance, paymentStatus };
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'SALE_NOT_FOUND') return NextResponse.json({ error: 'La venta a crédito no existe.' }, { status: 404 });
    if (message === 'PAYMENT_EXCEEDS_BALANCE') return NextResponse.json({ error: 'El pago no puede superar el saldo pendiente.' }, { status: 409 });
    const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status });
  }
}
