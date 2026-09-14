import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';

export const runtime = 'nodejs';
const MANAGER_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);
function text(value: unknown, max = 180) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function money(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(0, value) * 100) / 100 : 0; }
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const known: Record<string, [string, number]> = {
    BRANCH_REQUIRED: ['Selecciona una sucursal antes de operar finanzas.', 400],
    BRANCH_OUT_OF_SCOPE: ['No tienes acceso a esa sucursal.', 403],
    CASH_SESSION_REQUIRED: ['Abre una sesión de caja para registrar el movimiento.', 409],
    CASH_SESSION_NOT_OPEN: ['La sesión de caja no está abierta.', 409],
    INVALID_CASH_MOVEMENT: ['Dirección, método, descripción y monto son obligatorios.', 400],
  };
  for (const [key, value] of Object.entries(known)) if (message.includes(key)) return NextResponse.json({ error: value[0] }, { status: value[1] });
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}
async function contextFor(request: NextRequest, action: 'view' | 'create') {
  const context = await requireTenantPermission(request, 'finance', action);
  const branchId = text(request.headers.get('x-branch-id'), 128) || context.branchIds[0] || '';
  if (!branchId) throw new Error('BRANCH_REQUIRED');
  assertBranchAccess(context, branchId);
  return { context, branchId };
}

export async function GET(request: NextRequest) {
  try {
    const { context, branchId } = await contextFor(request, 'view');
    const supabase = getSupabaseServer();
    const [expensesResult, salesResult, movementsResult] = await Promise.all([
      supabase.from('expenses').select('id,branch_id,description,amount,category,payment_method,notes,created_by,created_at').eq('tenant_id', context.tenantId).eq('branch_id', branchId).order('created_at', { ascending: false }).limit(100),
      supabase.from('sales').select('id,branch_id,total,status,metadata,created_at').eq('tenant_id', context.tenantId).eq('branch_id', branchId).order('created_at', { ascending: false }).limit(100),
      supabase.from('cash_movements').select('id,cash_session_id,movement_type,amount,reference_type,reference_id,metadata,created_at,cash_sessions!inner(branch_id)').eq('tenant_id', context.tenantId).eq('cash_sessions.branch_id', branchId).order('created_at', { ascending: false }).limit(100),
    ]);
    for (const result of [expensesResult, salesResult, movementsResult]) if (result.error) throw new Error(result.error.message);
    const expenses = (expensesResult.data || []).map((row: any) => ({ id: row.id, branchId: row.branch_id, description: row.description, amount: Number(row.amount || 0), category: row.category, paymentMethod: row.payment_method, notes: row.notes, createdAt: row.created_at }));
    const sales = salesResult.data || [];
    const cashMovements = (movementsResult.data || []).map((row: any) => ({ id: row.id, description: row.metadata?.description || row.reference_type || row.movement_type, amount: Math.abs(Number(row.amount || 0)), direction: Number(row.amount || 0) >= 0 ? 'in' : 'out', paymentMethod: row.metadata?.paymentMethod || 'cash', notes: row.metadata?.notes, createdAt: row.created_at }));
    const income = sales.reduce((sum: number, row: any) => sum + (row.metadata?.paymentMethod === 'credit' ? Number(row.metadata?.paidAmount || 0) : Number(row.total || 0)), 0);
    const expenseTotal = expenses.reduce((sum, row) => sum + row.amount, 0);
    const adjustments = cashMovements.reduce((sum, row) => sum + (row.direction === 'in' ? row.amount : -row.amount), 0);
    return NextResponse.json({ ok: true, branchId, summary: { income, expenses: expenseTotal, adjustments, net: income - expenseTotal + adjustments }, expenses, cashMovements }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const { context, branchId } = await contextFor(request, 'create');
    const body = await request.json();
    const type = body.type === 'cash' ? 'cash' : 'expense';
    const amount = money(body.amount);
    const description = text(body.description);
    const paymentMethod = ['cash', 'card', 'transfer', 'credit'].includes(body.paymentMethod) ? body.paymentMethod : 'cash';
    if (amount <= 0 || description.length < 2) return NextResponse.json({ error: 'Descripción y monto son obligatorios.' }, { status: 400 });
    const supabase = getSupabaseServer();
    if (type === 'expense') {
      const result = await supabase.from('expenses').insert({ tenant_id: context.tenantId, branch_id: branchId, description, amount, category: text(body.category, 80) || 'General', payment_method: paymentMethod, notes: text(body.notes, 300) || null, created_by: context.uid }).select('id,branch_id,description,amount,category,payment_method,notes,created_at').single();
      if (result.error) throw new Error(result.error.message);
      await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'expense.created', entity: 'expense', entityId: result.data.id, after: result.data, result: 'success' });
      return NextResponse.json({ ok: true, type, item: result.data }, { status: 201 });
    }
    const session = await supabase.from('cash_sessions').select('id').eq('tenant_id', context.tenantId).eq('branch_id', branchId).eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle();
    if (session.error) throw new Error(session.error.message);
    if (!session.data?.id) throw new Error('CASH_SESSION_REQUIRED');
    const movement = await supabase.rpc('cash_session_action', { target_action: 'movement', target_tenant_id: context.tenantId, target_branch_id: branchId, target_register_id: null, target_session_id: session.data.id, target_user_id: context.uid, target_payload: { paymentMethod, amount, direction: body.direction === 'in' ? 'in' : 'out', description, notes: text(body.notes, 300) } });
    if (movement.error) throw new Error(movement.error.message);
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: 'cash_movement.created', entity: 'cashMovement', entityId: movement.data?.id, after: movement.data, result: 'success' });
    return NextResponse.json({ ok: true, type, item: movement.data }, { status: 201 });
  } catch (error: unknown) { return failure(error); }
}
