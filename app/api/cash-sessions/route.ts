import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { assertBranchAccess } from '@/lib/data-scope';
import { writeImmutableAudit } from '@/lib/audit';
import { resolveAuthorizedBranchId } from '@/lib/organization-scope';

export const runtime = 'nodejs';
const MANAGER_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);
function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function methods(value: unknown) { const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}; const amount = (key: string) => typeof input[key] === 'number' && Number.isFinite(input[key]) ? Math.max(0, Math.round(Number(input[key]) * 100) / 100) : 0; return { cash: amount('cash'), card: amount('card'), transfer: amount('transfer') }; }
function mapSession(row: any) { return { id: row.id, branchId: row.branch_id, registerId: row.cash_register_id, status: row.status, openingByMethod: row.metadata?.openingByMethod || { cash: Number(row.opening_amount || 0), card: 0, transfer: 0 }, expectedByMethod: row.metadata?.expectedByMethod || null, countedByMethod: row.metadata?.countedByMethod || null, difference: row.metadata?.difference == null ? null : Number(row.metadata.difference), openedBy: row.opened_by, openedAt: row.opened_at, closedBy: row.closed_by, closedAt: row.closed_at, updatedAt: row.updated_at, currency: row.metadata?.currency || 'NIO' }; }
function failure(error: unknown) { const message = error instanceof Error ? error.message : ''; const known: Record<string, [string, number]> = { BRANCH_REQUIRED: ['Selecciona una sucursal antes de operar caja.', 400], BRANCH_NOT_FOUND: ['La sucursal no existe o no está activa.', 404], REGISTER_NOT_FOUND: ['La caja no pertenece a la sucursal activa.', 404], SESSION_ALREADY_OPEN: ['Esta caja ya tiene un turno abierto.', 409], SESSION_NOT_FOUND: ['El turno no pertenece a la sucursal activa.', 404], SESSION_NOT_OPEN: ['El turno no está abierto.', 409], SESSION_NOT_COUNTED: ['El turno debe estar arqueado antes de cerrarse.', 409], MANAGER_REQUIRED: ['La diferencia requiere aprobación de un supervisor o gerente.', 403], INVALID_CASH_MOVEMENT: ['Dirección, método, descripción y monto son obligatorios.', 400] }; for (const [key, value] of Object.entries(known)) if (message.includes(key)) return NextResponse.json({ error: value[0] }, { status: value[1] }); const response = tenantErrorResponse(error); return NextResponse.json(response.body, { status: response.status }); }

async function contextFor(request: NextRequest, action: 'view' | 'create' | 'edit') { const context = await requireTenantPermission(request, 'finance', action); const branchId = await resolveAuthorizedBranchId(context, request.headers.get('x-branch-id') || undefined); assertBranchAccess(context, branchId); return { context, branchId }; }

export async function GET(request: NextRequest) {
  try {
    const { context, branchId } = await contextFor(request, 'view');
    const result = await getSupabaseServer().from('cash_sessions').select('id,branch_id,cash_register_id,status,metadata,opening_amount,opened_by,opened_at,closed_by,closed_at,updated_at').eq('tenant_id', context.tenantId).eq('branch_id', branchId).order('opened_at', { ascending: false }).limit(30);
    if (result.error) throw new Error(result.error.message);
    const sessions = (result.data || []).map(mapSession);
    const active = sessions.find((session: any) => session.status === 'open' || session.status === 'pending_review') || null;
    return NextResponse.json({ ok: true, branchId, active, sessions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = text(body.action, 30);
    const permission = action === 'open' || action === 'movement' ? 'create' : 'edit';
    const { context, branchId } = await contextFor(request, permission);
    const registerId = text(body.registerId, 128);
    const sessionId = text(body.sessionId, 128);
    const payload = action === 'open' ? { openingByMethod: methods(body.openingByMethod) } : action === 'movement' ? { paymentMethod: text(body.paymentMethod, 30), amount: body.amount, direction: body.direction, description: text(body.description), notes: text(body.notes, 300) } : { countedByMethod: methods(body.countedByMethod) };
    if (action === 'open' && !registerId) return NextResponse.json({ error: 'Selecciona una caja para abrir el turno.' }, { status: 400 });
    if (action !== 'open' && !sessionId) return NextResponse.json({ error: 'El turno de caja es obligatorio.' }, { status: 400 });
    if (action === 'close' && !MANAGER_ROLES.has(context.role)) { /* RPC enforces manager only when a difference exists. */ }
    const result = action === 'close'
      ? await getSupabaseServer().rpc('cash_session_close_atomic', { target_tenant_id: context.tenantId, target_session_id: sessionId, target_user_id: context.uid, target_counted_by_method: payload.countedByMethod || {}, target_approve_difference: false })
      : await getSupabaseServer().rpc('cash_session_action', { target_action: action, target_tenant_id: context.tenantId, target_branch_id: branchId, target_register_id: registerId || null, target_session_id: sessionId || null, target_user_id: context.uid, target_payload: payload });
    if (result.error) throw new Error(result.error.message);
    const data = result.data || {};
    const entityId = data.id || sessionId;
    await writeImmutableAudit({ tenantId: context.tenantId, actor: context, action: `cash_${action}`, entity: action === 'movement' ? 'cashMovement' : 'cashSession', entityId, after: data, result: 'success' });
    if (action === 'open') return NextResponse.json({ ok: true, session: data }, { status: 201 });
    if (action === 'movement') return NextResponse.json({ ok: true, movement: data }, { status: 201 });
    return NextResponse.json({ ok: true, ...data });
  } catch (error: unknown) { return failure(error); }
}
