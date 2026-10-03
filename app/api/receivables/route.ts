import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';
import { resolveTenantBranchIds } from '@/lib/branch-scope';
import { calendarDaysBetween, localDateKey, receivableDueStatus } from '@/lib/receivables-reminders';

export const runtime = 'nodejs';
const MANAGER_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);
const PAGE_SIZE = 250;

function text(value: unknown, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function amount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.max(0, value) * 100) / 100
    : 0;
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const known: Record<string, [string, number]> = {
    RECEIVABLE_NOT_FOUND: ['La venta a crédito no tiene saldo pendiente.', 404],
    PAYMENT_EXCEEDS_BALANCE: ['El pago no puede superar el saldo pendiente.', 409],
    ALLOCATIONS_DO_NOT_MATCH_PAYMENT: ['La suma de aplicaciones debe coincidir con el pago.', 409],
    CUSTOMER_CREDIT_BLOCKED: ['El cliente no puede generar nueva deuda.', 409],
    CREDIT_LIMIT_EXCEEDED: ['La venta supera el límite de crédito del cliente.', 409],
    CASH_SESSION_REQUIRED: ['Se requiere una sesión de caja abierta para pagos en efectivo.', 409],
    CASH_SESSION_NOT_OPEN: ['La sesión de caja no está abierta.', 409],
    INVALID_RECEIVABLE_PAYMENT: ['Cliente o venta, monto y método de pago son obligatorios.', 400],
  };
  for (const [key, value] of Object.entries(known)) {
    if (message.includes(key)) return NextResponse.json({ error: value[0] }, { status: value[1] });
  }
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}

async function tenantTimezone(tenantId: string): Promise<string> {
  const result = await getSupabaseServer().from('tenants').select('timezone').eq('id', tenantId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return String(result.data?.timezone || 'America/Managua');
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'receivables', 'view');
    const branchId = text(request.headers.get('x-branch-id'), 128);
    if (branchId) assertBranchAccess(context, branchId);
    const supabase = getSupabaseServer();
    const branchFilterIds = branchId
      ? await resolveTenantBranchIds(supabase, context.tenantId, [branchId])
      : MANAGER_ROLES.has(context.role) ? [] : await resolveTenantBranchIds(supabase, context.tenantId, context.branchIds.slice(0, 100));
    if (branchId && !branchFilterIds.length) return NextResponse.json({ error: 'La sucursal no existe o no está activa.' }, { status: 404 });
    if (!branchId && !MANAGER_ROLES.has(context.role) && !branchFilterIds.length) return NextResponse.json({ error: 'No tienes sucursales asignadas.' }, { status: 403 });
    const requestedPage = Number(request.nextUrl.searchParams.get('page') || 1);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10_000) : 1;
    const from = (page - 1) * PAGE_SIZE;
    let query = supabase
      .from('receivables')
      .select('id,tenant_id,customer_id,sale_id,original_amount,outstanding_amount,status,due_date,created_at,updated_at,customers(name,phone),sales!inner(id,invoice_number,branch_id,total,created_at)', { count: 'exact' })
      .eq('tenant_id', context.tenantId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (branchId) query = query.eq('sales.branch_id', branchFilterIds[0]);
    else if (!MANAGER_ROLES.has(context.role)) query = query.in('sales.branch_id', branchFilterIds);

    let paymentsQuery = supabase
      .from('receivable_payments')
      .select('id,tenant_id,receivable_id,amount,payment_method,received_by,created_at,receivables!inner(sale_id,tenant_id,sales!inner(branch_id))')
      .eq('tenant_id', context.tenantId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (branchId) paymentsQuery = paymentsQuery.eq('receivables.sales.branch_id', branchFilterIds[0]);
    else if (!MANAGER_ROLES.has(context.role)) paymentsQuery = paymentsQuery.in('receivables.sales.branch_id', branchFilterIds);
    const [result, timezone, paymentsResult] = await Promise.all([query, tenantTimezone(context.tenantId), paymentsQuery]);
    if (result.error) throw new Error(result.error.message);
    if (paymentsResult.error) throw new Error(paymentsResult.error.message);
    const rows = (result.data || []).slice(0, PAGE_SIZE);
    const total = Number(result.count || 0);
    const today = localDateKey(new Date(), timezone);
    const sales = rows.map((row: any) => {
      const balanceDue = Number(row.outstanding_amount || 0);
      const dueAt = row.due_date ? String(row.due_date) : null;
      const dueStatus = receivableDueStatus(balanceDue, dueAt, today, 7);
      return {
        id: row.sales?.id || row.sale_id,
        saleId: row.sale_id,
        receivableId: row.id,
        customerId: row.customer_id,
        customerName: row.customers?.name || 'Cliente sin identificar',
        total: Number(row.original_amount || 0),
        paidAmount: Number(row.original_amount || 0) - balanceDue,
        balanceDue,
        paymentStatus: row.status,
        dueAt,
        dueStatus,
        dueStatusLabel: dueStatus === 'overdue' ? 'Vencida' : dueStatus === 'upcoming' ? 'Por vencer' : dueStatus === 'paid' ? 'Pagada' : 'Al día',
        daysUntilDue: dueAt ? calendarDaysBetween(today, dueAt) : null,
        overdue: dueStatus === 'overdue',
        branchId: row.sales?.branch_id,
        invoiceNumber: row.sales?.invoice_number,
        createdAt: row.created_at,
      };
    });
    const customers = Array.from(sales.reduce((map, sale) => {
      const key = sale.customerId;
      const current = map.get(key) || { customerId: key, customerName: sale.customerName, sales: 0, total: 0, paid: 0, balance: 0 };
      current.sales += 1;
      current.total += sale.total;
      current.paid += sale.paidAmount;
      current.balance += sale.balanceDue;
      map.set(key, current);
      return map;
    }, new Map<string, any>()).values()).sort((a: any, b: any) => b.balance - a.balance);
    return NextResponse.json({
      ok: true,
      today,
      pagination: { page, pageSize: PAGE_SIZE, total, hasMoreSales: from + rows.length < total },
      summary: {
        receivables: sales.filter((sale) => sale.balanceDue > 0).length,
        balance: sales.reduce((sum, sale) => sum + sale.balanceDue, 0),
        overdue: sales.filter((sale) => sale.dueStatus === 'overdue').reduce((sum, sale) => sum + sale.balanceDue, 0),
        dueSoon: sales.filter((sale) => sale.dueStatus === 'upcoming').reduce((sum, sale) => sum + sale.balanceDue, 0),
        collected: sales.reduce((sum, sale) => sum + sale.paidAmount, 0),
      },
      customers,
      sales,
      payments: paymentsResult.data || [],
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'receivables', 'create');
    const branchId = text(request.headers.get('x-branch-id'), 128);
    if (branchId) assertBranchAccess(context, branchId);
    const body = await request.json();
    const customerId = text(body.customerId, 128);
    const saleId = text(body.saleId, 128);
    const payment = amount(body.amount);
    const method = ['cash', 'card', 'transfer', 'other'].includes(body.paymentMethod) ? body.paymentMethod : '';
    const idempotencyKey = text(request.headers.get('idempotency-key'), 160) || text(body.idempotencyKey, 160);
    if (!idempotencyKey) return NextResponse.json({ error: 'La llave de idempotencia es obligatoria para abonos.' }, { status: 400 });
    if ((!saleId && !customerId) || payment <= 0 || !method) return NextResponse.json({ error: 'Cliente o venta, monto y método de pago son obligatorios.' }, { status: 400 });
    const supabase = getSupabaseServer();
    const branchScopedPayment = Boolean(branchId) || !MANAGER_ROLES.has(context.role);
    const branchFilterIds = branchScopedPayment
      ? await resolveTenantBranchIds(supabase, context.tenantId, branchId ? [branchId] : context.branchIds.slice(0, 100))
      : [];
    if (branchId && !branchFilterIds.length) return NextResponse.json({ error: 'La sucursal no existe o no está activa.' }, { status: 404 });
    if (branchScopedPayment && !branchFilterIds.length) return NextResponse.json({ error: 'No tienes sucursales asignadas para esta operación.' }, { status: 403 });
    if (customerId) {
      const scopedBranches = branchFilterIds;
      let allocations = Array.isArray(body.allocations) ? body.allocations as Array<Record<string, unknown>> : [];
      if (branchScopedPayment) {
        if (!scopedBranches.length) return NextResponse.json({ error: 'No tienes sucursales asignadas para aplicar este pago.' }, { status: 403 });
        let debtQuery = supabase
          .from('receivables')
          .select('id,outstanding_amount,due_date,created_at,sales!inner(branch_id)')
          .eq('tenant_id', context.tenantId)
          .eq('customer_id', customerId)
          .in('status', ['open', 'partial'])
          .gt('outstanding_amount', 0)
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .limit(1_000);
        if (branchId) debtQuery = debtQuery.eq('sales.branch_id', scopedBranches[0]);
        else debtQuery = debtQuery.in('sales.branch_id', scopedBranches);
        const debts = await debtQuery;
        if (debts.error) throw new Error(debts.error.message);
        const debtRows = (debts.data || []) as Array<{ id: string; outstanding_amount: number; due_date: string | null; created_at: string }>;
        const allowedBalances = new Map(debtRows.map((debt) => [debt.id, Number(debt.outstanding_amount || 0)]));
        if (allocations.length) {
          for (const allocation of allocations) {
            const receivableId = text(allocation.receivableId, 128);
            if (!allowedBalances.has(receivableId)) {
              return NextResponse.json({ error: 'Una o más facturas no pertenecen a las sucursales permitidas.' }, { status: 403 });
            }
          }
        } else {
          let remaining = payment;
          allocations = [];
          for (const debt of debtRows) {
            if (remaining <= 0) break;
            const allocated = Math.min(remaining, Number(debt.outstanding_amount || 0));
            if (allocated > 0) allocations.push({ receivableId: debt.id, amount: Math.round(allocated * 100) / 100 });
            remaining = Math.round((remaining - allocated) * 100) / 100;
          }
          if (remaining > 0.01) {
            return NextResponse.json({ error: 'El pago supera el saldo pendiente de las sucursales permitidas.' }, { status: 409 });
          }
        }
      }

      let cashSessionId = text(body.cashSessionId, 128);
      if (method === 'cash' && cashSessionId) {
        const providedSession = await supabase.from('cash_sessions').select('id,branch_id,status').eq('tenant_id', context.tenantId).eq('id', cashSessionId).maybeSingle();
        if (providedSession.error) throw new Error(providedSession.error.message);
        if (!providedSession.data || providedSession.data.status !== 'open') return NextResponse.json({ error: 'La sesión de caja no está abierta.' }, { status: 409 });
        if (branchScopedPayment && !scopedBranches.includes(String(providedSession.data.branch_id || ''))) {
          return NextResponse.json({ error: 'La sesión de caja no pertenece a una sucursal autorizada.' }, { status: 403 });
        }
      }
      if (method === 'cash' && !cashSessionId) {
        let sessionQuery = supabase.from('cash_sessions').select('id').eq('tenant_id', context.tenantId).eq('status', 'open').order('opened_at', { ascending: false }).limit(1);
        if (branchId) sessionQuery = sessionQuery.eq('branch_id', scopedBranches[0]);
        else if (!MANAGER_ROLES.has(context.role)) sessionQuery = sessionQuery.in('branch_id', scopedBranches);
        const session = await sessionQuery.maybeSingle();
        if (session.error) throw new Error(session.error.message);
        cashSessionId = session.data?.id || '';
      }
      const result = await supabase.rpc('register_receivable_payment_idempotent', {
        target_tenant_id: context.tenantId,
        target_customer_id: customerId,
        target_amount: payment,
        target_payment_method: method,
        target_allocations: allocations,
        target_cash_session_id: cashSessionId || null,
        target_user_id: context.uid,
        target_note: text(body.notes, 300),
        target_idempotency_key: idempotencyKey,
      });
      if (result.error) throw new Error(result.error.message);
      const data = result.data || {};
      await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'receivable.payment_created', entity: 'customer', entityId: customerId, after: data, result: 'success' });
      return NextResponse.json({ ok: true, ...data }, { status: 201 });
    }
    const sale = await getSupabaseServer().from('sales').select('branch_id').eq('id', saleId).eq('tenant_id', context.tenantId).single();
    if (sale.error || !sale.data) return NextResponse.json({ error: 'La venta a crédito no existe.' }, { status: 404 });
    if (branchScopedPayment && !branchFilterIds.includes(String(sale.data.branch_id || ''))) {
      return NextResponse.json({ error: 'La venta no pertenece a una sucursal autorizada.' }, { status: 403 });
    }
    let cashSessionId = text(body.cashSessionId, 128);
    if (method === 'cash' && cashSessionId) {
      const providedSession = await supabase.from('cash_sessions').select('id,branch_id,status').eq('tenant_id', context.tenantId).eq('id', cashSessionId).maybeSingle();
      if (providedSession.error) throw new Error(providedSession.error.message);
      if (!providedSession.data || providedSession.data.status !== 'open') return NextResponse.json({ error: 'La sesión de caja no está abierta.' }, { status: 409 });
      if (providedSession.data.branch_id !== sale.data.branch_id) return NextResponse.json({ error: 'La sesión de caja debe pertenecer a la sucursal de la venta.' }, { status: 403 });
    }
    if (method === 'cash' && !cashSessionId) {
      const session = await supabase.from('cash_sessions').select('id').eq('tenant_id', context.tenantId).eq('branch_id', sale.data.branch_id).eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle();
      if (session.error) throw new Error(session.error.message);
      cashSessionId = session.data?.id || '';
    }
    const result = await supabase.rpc('record_receivable_payment_idempotent', { target_tenant_id: context.tenantId, target_sale_id: saleId, target_user_id: context.uid, target_payment_method: method, target_amount: payment, target_notes: text(body.notes, 300), target_cash_session_id: cashSessionId || null, target_idempotency_key: idempotencyKey });
    if (result.error) throw new Error(result.error.message);
    const data = result.data || {};
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'receivable.payment_created', entity: 'sale', entityId: saleId, after: data, result: 'success' });
    return NextResponse.json({ ok: true, ...data }, { status: 201 });
  } catch (error: unknown) {
    return failure(error);
  }
}
