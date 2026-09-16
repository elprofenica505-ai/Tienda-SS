import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
const MANAGER_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);
const PAGE_SIZE = 25;
function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function amount(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(0, value) * 100) / 100 : 0; }
function failure(error: unknown) { const message = error instanceof Error ? error.message : ''; const known: Record<string, [string, number]> = { RECEIVABLE_NOT_FOUND: ['La venta a crédito no tiene saldo pendiente.', 404], PAYMENT_EXCEEDS_BALANCE: ['El pago no puede superar el saldo pendiente.', 409], ALLOCATIONS_DO_NOT_MATCH_PAYMENT: ['La suma de aplicaciones debe coincidir con el pago.', 409], CUSTOMER_CREDIT_BLOCKED: ['El cliente no puede generar nueva deuda.', 409], CREDIT_LIMIT_EXCEEDED: ['La venta supera el límite de crédito del cliente.', 409], CASH_SESSION_REQUIRED: ['Se requiere una sesión de caja abierta para pagos en efectivo.', 409], CASH_SESSION_NOT_OPEN: ['La sesión de caja no está abierta.', 409], INVALID_RECEIVABLE_PAYMENT: ['Cliente o venta, monto y método de pago son obligatorios.', 400] }; for (const [key, value] of Object.entries(known)) if (message.includes(key)) return NextResponse.json({ error: value[0] }, { status: value[1] }); const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'receivables', 'view');
    const branchId = text(request.headers.get('x-branch-id'), 128);
    if (branchId) assertBranchAccess(context, branchId);
    let query = getSupabaseServer().from('receivables').select('id,tenant_id,customer_id,sale_id,original_amount,outstanding_amount,status,due_date,created_at,updated_at,customers(name),sales(id,invoice_number,branch_id,total,created_at)').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(PAGE_SIZE + 1);
    if (branchId) query = query.eq('sales.branch_id', branchId);
    else if (!MANAGER_ROLES.has(context.role)) query = query.in('sales.branch_id', context.branchIds.slice(0, 100));
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    const rows = (result.data || []).slice(0, PAGE_SIZE);
    const paymentsResult = await getSupabaseServer().from('receivable_payments').select('id,tenant_id,receivable_id,amount,payment_method,received_by,created_at,receivables!inner(sale_id,tenant_id)').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(PAGE_SIZE);
    if (paymentsResult.error) throw new Error(paymentsResult.error.message);
    const sales = rows.map((row: any) => ({ id: row.sales?.id || row.sale_id, saleId: row.sale_id, customerId: row.customer_id, customerName: row.customers?.name || 'Cliente sin identificar', total: Number(row.original_amount || 0), paidAmount: Number(row.original_amount || 0) - Number(row.outstanding_amount || 0), balanceDue: Number(row.outstanding_amount || 0), paymentStatus: row.status, dueAt: row.due_date, overdue: Number(row.outstanding_amount || 0) > 0 && row.due_date && new Date(row.due_date) < new Date(), branchId: row.sales?.branch_id, invoiceNumber: row.sales?.invoice_number, createdAt: row.created_at }));
    const customers = Array.from(sales.reduce((map, sale) => { const key = sale.customerId; const current = map.get(key) || { customerId: key, customerName: sale.customerName, sales: 0, total: 0, paid: 0, balance: 0 }; current.sales += 1; current.total += sale.total; current.paid += sale.paidAmount; current.balance += sale.balanceDue; map.set(key, current); return map; }, new Map<string, any>()).values()).sort((a: any, b: any) => b.balance - a.balance);
    return NextResponse.json({ ok: true, pagination: { pageSize: PAGE_SIZE, hasMoreSales: (result.data || []).length > PAGE_SIZE }, summary: { receivables: sales.filter((sale) => sale.balanceDue > 0).length, balance: sales.reduce((sum, sale) => sum + sale.balanceDue, 0), overdue: sales.filter((sale) => sale.overdue).reduce((sum, sale) => sum + sale.balanceDue, 0), collected: sales.reduce((sum, sale) => sum + sale.paidAmount, 0) }, customers, sales, payments: paymentsResult.data || [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'receivables', 'create');
    const body = await request.json();
    const customerId = text(body.customerId, 128);
    const saleId = text(body.saleId, 128);
    const payment = amount(body.amount);
    const method = ['cash', 'card', 'transfer', 'other'].includes(body.paymentMethod) ? body.paymentMethod : '';
    if ((!saleId && !customerId) || payment <= 0 || !method) return NextResponse.json({ error: 'Cliente o venta, monto y método de pago son obligatorios.' }, { status: 400 });
    const supabase = getSupabaseServer();
    if (customerId) {
      let cashSessionId = text(body.cashSessionId, 128);
      if (method === 'cash' && !cashSessionId) {
        const session = await supabase.from('cash_sessions').select('id').eq('tenant_id', context.tenantId).eq('status', 'open').in('branch_id', context.branchIds.slice(0, 100)).order('opened_at', { ascending: false }).limit(1).maybeSingle();
        if (session.error) throw new Error(session.error.message);
        cashSessionId = session.data?.id || '';
      }
      const result = await supabase.rpc('register_receivable_payment', {
        target_tenant_id: context.tenantId,
        target_customer_id: customerId,
        target_amount: payment,
        target_payment_method: method,
        target_allocations: Array.isArray(body.allocations) ? body.allocations : [],
        target_cash_session_id: cashSessionId || null,
        target_user_id: context.uid,
        target_note: text(body.notes, 300),
      });
      if (result.error) throw new Error(result.error.message);
      const data = result.data || {};
      await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'receivable.payment_created', entity: 'customer', entityId: customerId, after: data, result: 'success' });
      return NextResponse.json({ ok: true, ...data }, { status: 201 });
    }
    const sale = await getSupabaseServer().from('sales').select('branch_id').eq('id', saleId).eq('tenant_id', context.tenantId).single();
    if (sale.error || !sale.data) return NextResponse.json({ error: 'La venta a crédito no existe.' }, { status: 404 });
    assertBranchAccess(context, sale.data.branch_id);
    let cashSessionId = text(body.cashSessionId, 128);
    if (method === 'cash' && !cashSessionId) {
      const session = await supabase.from('cash_sessions').select('id').eq('tenant_id', context.tenantId).eq('branch_id', sale.data.branch_id).eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle();
      if (session.error) throw new Error(session.error.message);
      cashSessionId = session.data?.id || '';
    }
    const result = await supabase.rpc('record_receivable_payment', { target_tenant_id: context.tenantId, target_sale_id: saleId, target_user_id: context.uid, target_payment_method: method, target_amount: payment, target_notes: text(body.notes, 300), target_cash_session_id: cashSessionId || null });
    if (result.error) throw new Error(result.error.message);
    const data = result.data || {};
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'receivable.payment_created', entity: 'sale', entityId: saleId, after: data, result: 'success' });
    return NextResponse.json({ ok: true, ...data }, { status: 201 });
  } catch (error: unknown) { return failure(error); }
}
