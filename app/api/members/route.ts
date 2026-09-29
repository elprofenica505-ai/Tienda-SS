import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireSupabaseTenantPermission } from '@/lib/supabase/tenant-access';
import { tenantErrorResponse, type TenantRole } from '@/lib/tenant';
import { canAssignRole, canManageRole } from '@/lib/role-policy';
import { createMember, findMemberByAuthUserId, listMembers, updateMember } from '@/lib/repositories/member-repository';

export const runtime = 'nodejs';
const assignableRoles: TenantRole[] = ['admin', 'gerente', 'supervisor_sucursal', 'vendedor', 'cajero', 'bodega', 'compras', 'chofer', 'despachador', 'solo_lectura', 'jefe'];
const globalMemberRoles = new Set<TenantRole>(['owner', 'admin', 'gerente', 'jefe']);
function text(value: unknown, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function branchIds(value: unknown): string[] { return Array.isArray(value) ? Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()).slice(0, 100))) : []; }
function responseFor(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('SUPABASE_') || message.includes('relation') || message.includes('schema cache')) return NextResponse.json({ error: 'La conexión del servidor con Supabase no está configurada correctamente.' }, { status: 503 });
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}
async function findAuthUserByEmail(email: string) {
  const result = await getSupabaseServer().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (result.error) throw new Error(result.error.message);
  return (result.data.users || []).find((item) => item.email?.toLowerCase() === email) || null;
}
function canManageMemberBranches(context: { role: TenantRole; branchIds: string[] }, member: { branchIds?: unknown }) {
  if (globalMemberRoles.has(context.role)) return true;
  const targetBranches = branchIds(member.branchIds);
  return targetBranches.length > 0 && targetBranches.some((id) => context.branchIds.includes(id));
}
function requestedBranchIds(context: { role: TenantRole; branchIds: string[] }, value: unknown) {
  const requested = branchIds(value);
  if (globalMemberRoles.has(context.role)) return requested;
  if (!requested.length || requested.some((id) => !context.branchIds.includes(id))) throw new Error('BRANCH_OUT_OF_SCOPE');
  return requested;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireSupabaseTenantPermission(request, 'members', 'view');
    const members = await listMembers(context.tenantId);
    return NextResponse.json({ ok: true, members: members.filter((member) => canManageMemberBranches(context, member)) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) { return responseFor(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireSupabaseTenantPermission(request, 'members', 'create');
    const body = await request.json();
    const name = text(body.name); const email = text(body.email, 160).toLowerCase(); const password = typeof body.password === 'string' ? body.password : ''; const role = text(body.role, 30) as TenantRole;
    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !assignableRoles.includes(role)) return NextResponse.json({ error: 'Nombre, correo, contraseña y rol son obligatorios.' }, { status: 400 });
    if (!canAssignRole(context.role, role)) return NextResponse.json({ error: 'No puedes asignar ese nivel de rol.' }, { status: 403 });
    let memberBranchIds: string[];
    try { memberBranchIds = requestedBranchIds(context, body.branchIds); } catch (error) { return responseFor(error); }
    const auth = getSupabaseServer().auth.admin;
    let user = await findAuthUserByEmail(email);
    if (!user) {
      const created = await auth.createUser({ email, password, user_metadata: { display_name: name }, email_confirm: false });
      if (created.error || !created.data.user) throw new Error(created.error?.message || 'SUPABASE_AUTH_CREATE_FAILED');
      user = created.data.user;
    }
    const existing = await findMemberByAuthUserId(context.tenantId, user.id);
    if (existing?.member.status === 'active') return NextResponse.json({ error: 'Ese usuario ya pertenece a esta empresa.' }, { status: 409 });
    await createMember(context.tenantId, user.id, name, email, role, memberBranchIds);
    return NextResponse.json({ ok: true, uid: user.id, email }, { status: 201 });
  } catch (error: unknown) { return responseFor(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireSupabaseTenantPermission(request, 'members', 'edit');
    const body = await request.json(); const uid = text(body.uid, 160);
    const current = await findMemberByAuthUserId(context.tenantId, uid);
    if (!uid || !current) return NextResponse.json({ error: 'El miembro no existe en este tenant.' }, { status: 404 });
    const currentMember = { ...current.member, branchIds: current.branchIds };
    if (uid === context.uid) return NextResponse.json({ error: 'No puedes cambiar tu propio acceso desde aquí.' }, { status: 400 });
    if (current.member.role === 'owner') return NextResponse.json({ error: 'El propietario principal no puede modificarse desde este módulo.' }, { status: 403 });
    if (!canManageMemberBranches(context, currentMember)) return NextResponse.json({ error: 'El miembro está fuera de tus sucursales autorizadas.' }, { status: 403 });
    const changes: Record<string, unknown> = {};
    if (body.role !== undefined) {
      if (typeof body.role !== 'string' || !assignableRoles.includes(body.role as TenantRole)) return NextResponse.json({ error: 'Rol inválido.' }, { status: 400 });
      if (typeof current.member.role !== 'string' || !canManageRole(context.role, current.member.role as TenantRole, body.role as TenantRole)) return NextResponse.json({ error: 'No puedes asignar ese rol a este miembro.' }, { status: 403 });
      changes.role = body.role;
    }
    let nextBranchIds: string[] | undefined;
    if (body.branchIds !== undefined) {
      try { nextBranchIds = requestedBranchIds(context, body.branchIds); } catch (error) { return responseFor(error); }
    }
    if (typeof body.status === 'string' && ['active', 'disabled'].includes(body.status)) changes.status = body.status;
    if (!Object.keys(changes).length && !nextBranchIds) return NextResponse.json({ error: 'No hay cambios válidos.' }, { status: 400 });
    await updateMember(context.tenantId, uid, changes, nextBranchIds);
    return NextResponse.json({ ok: true, uid, changes: { ...changes, ...(nextBranchIds ? { branchIds: nextBranchIds } : {}) } });
  } catch (error: unknown) { return responseFor(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await requireSupabaseTenantPermission(request, 'members', 'delete');
    const body = await request.json(); const uid = text(body.uid, 160);
    if (!uid || uid === context.uid) return NextResponse.json({ error: 'No puedes eliminar tu propio usuario.' }, { status: 400 });
    const current = await findMemberByAuthUserId(context.tenantId, uid);
    if (!current) return NextResponse.json({ error: 'El miembro no existe en este tenant.' }, { status: 404 });
    if (current.member.role === 'owner') return NextResponse.json({ error: 'El propietario principal no puede eliminarse desde este módulo.' }, { status: 403 });
    if (!canManageMemberBranches(context, { branchIds: current.branchIds })) return NextResponse.json({ error: 'El miembro está fuera de tus sucursales autorizadas.' }, { status: 403 });
    await updateMember(context.tenantId, uid, { status: 'disabled' });
    return NextResponse.json({ ok: true, uid, status: 'disabled' });
  } catch (error: unknown) { return responseFor(error); }
}
