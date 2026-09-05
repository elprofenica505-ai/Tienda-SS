import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantPermission, tenantErrorResponse, TenantRole } from '@/lib/tenant';

export const runtime = 'nodejs';
const financeRoles: TenantRole[] = ['owner', 'admin', 'jefe', 'cajero'];
function text(value: unknown, max = 180) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function money(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(0, value) * 100) / 100 : 0; }

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'finance', 'view');
    const tenant = getAdminDb().collection('tenants').doc(context.tenantId);
    const [expensesSnapshot, salesSnapshot, cashSnapshot] = await Promise.all([
      tenant.collection('expenses').orderBy('createdAt', 'desc').limit(100).get(),
      tenant.collection('sales').orderBy('createdAt', 'desc').limit(100).get(),
      tenant.collection('cashMovements').orderBy('createdAt', 'desc').limit(100).get()
    ]);
    const expenses: Array<Record<string, unknown> & { id: string }> = expensesSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>) }));
    const sales: Array<Record<string, unknown> & { id: string }> = salesSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>) }));
    const cashMovements: Array<Record<string, unknown> & { id: string }> = cashSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>) }));
    const income = sales.reduce((sum, sale) => sum + (sale.paymentMethod === 'credit' ? Number(sale.paidAmount || 0) : Number(sale.total || 0)), 0);
    const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const adjustments = cashMovements.reduce((sum, item) => sum + Number(item.direction === 'in' ? item.amount || 0 : -(item.amount || 0)), 0);
    return NextResponse.json({ ok: true, summary: { income, expenses: expenseTotal, adjustments, net: income - expenseTotal + adjustments }, expenses, cashMovements });
  } catch (error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'finance', 'create');
    const body = await request.json();
    const type = body.type === 'cash' ? 'cash' : 'expense';
    const amount = money(body.amount);
    const description = text(body.description);
    if (amount <= 0 || description.length < 2) return NextResponse.json({ error: 'Descripción y monto son obligatorios.' }, { status: 400 });
    const db = getAdminDb(); const tenant = db.collection('tenants').doc(context.tenantId); const now = new Date();
    const collection = type === 'expense' ? 'expenses' : 'cashMovements'; const ref = tenant.collection(collection).doc();
    const record = type === 'expense' ? { description, amount, category: text(body.category, 80) || 'General', paymentMethod: text(body.paymentMethod, 30) || 'cash', notes: text(body.notes, 300), createdBy: context.uid, createdAt: now } : { description, amount, direction: body.direction === 'in' ? 'in' : 'out', paymentMethod: text(body.paymentMethod, 30) || 'cash', notes: text(body.notes, 300), createdBy: context.uid, createdAt: now };
    await ref.set(record);
    return NextResponse.json({ ok: true, type, item: { id: ref.id, ...record } }, { status: 201 });
  } catch (error: unknown) { const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}
