import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';

export const runtime = 'nodejs';

type ContactType = 'customer' | 'supplier';

function text(value: unknown, max = 180) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function typeOf(value: unknown): ContactType {
  return value === 'supplier' ? 'supplier' : 'customer';
}

function tableFor(type: ContactType) {
  return type === 'supplier' ? 'suppliers' : 'customers';
}

function money(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.max(0, value) * 100) / 100
    : 0;
}

function mapContact(row: Record<string, any>, type: ContactType) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: row.id,
    name: row.name,
    email: row.email || '',
    phone: row.phone || '',
    taxId: row.document_id || '',
    address: typeof metadata.address === 'string' ? metadata.address : '',
    notes: typeof metadata.notes === 'string' ? metadata.notes : '',
    active: row.active !== false,
    ...(type === 'customer' ? {
      creditLimit: Number(row.credit_limit || 0),
      creditBalance: Number(metadata.creditBalance || 0),
      creditEnabled: row.credit_enabled === true,
      termDays: Number(row.term_days || 30),
      graceDays: Number(row.grace_days || 0),
      creditStatus: row.credit_status || 'activo',
      salesBlocked: row.sales_blocked === true,
      salesBlockedReason: row.sales_blocked_reason || '',
    } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function errorResponse(error: unknown) {
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'contacts', 'view');
    const url = new URL(request.url);
    const type = typeOf(url.searchParams.get('type'));
    const includeArchived = url.searchParams.get('includeArchived') === 'true';
    let query = getSupabaseServer()
      .from(tableFor(type))
      .select('id,tenant_id,name,email,phone,document_id,active,metadata,credit_limit,credit_enabled,term_days,grace_days,credit_status,sales_blocked,sales_blocked_reason,created_at,updated_at')
      .eq('tenant_id', context.tenantId)
      .order('name', { ascending: true });
    if (!includeArchived) query = query.eq('active', true);
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    const contacts = (result.data || []).map((row) => mapContact(row as Record<string, any>, type));
    return NextResponse.json({ ok: true, tenantId: context.tenantId, type, contacts }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const type = typeOf(body.type);
    const context = await requireTenantPermission(request, 'contacts', 'create');
    const name = text(body.name);
    const email = text(body.email, 160).toLowerCase();
    const phone = text(body.phone, 40);
    const taxId = text(body.taxId, 60);
    const address = text(body.address, 240);
    const notes = text(body.notes, 500);
    if (name.length < 2) return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 });
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'El correo no es válido.' }, { status: 400 });

    const supabase = getSupabaseServer();
    const duplicate = await supabase.from(tableFor(type)).select('id').eq('tenant_id', context.tenantId).eq('name', name).limit(1);
    if (duplicate.error) throw new Error(duplicate.error.message);
    if ((duplicate.data || []).length) return NextResponse.json({ error: `Ya existe ${type === 'supplier' ? 'un proveedor' : 'un cliente'} con ese nombre.` }, { status: 409 });

    const metadata = { address, notes, ...(type === 'customer' ? { creditBalance: 0 } : {}) };
    const payload = {
      tenant_id: context.tenantId,
      name,
      email: email || null,
      phone: phone || null,
      document_id: taxId || null,
      active: true,
      metadata,
      ...(type === 'customer' ? { credit_limit: money(body.creditLimit), credit_enabled: body.creditEnabled === true, term_days: Math.max(0, Math.floor(Number(body.termDays) || 30)), grace_days: Math.max(0, Math.floor(Number(body.graceDays) || 0)) } : {}),
    };
    const result = await supabase.from(tableFor(type)).insert(payload).select('id,tenant_id,name,email,phone,document_id,active,metadata,credit_limit,credit_enabled,term_days,grace_days,credit_status,sales_blocked,sales_blocked_reason,created_at,updated_at').single();
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ ok: true, item: mapContact(result.data as Record<string, any>, type) }, { status: 201 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const type = typeOf(body.type);
    const context = await requireTenantPermission(request, 'contacts', 'edit');
    const id = text(body.id, 120);
    if (!id) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 });

    const supabase = getSupabaseServer();
    const current = await supabase.from(tableFor(type)).select('id,tenant_id,name,email,phone,document_id,active,metadata,credit_limit,credit_enabled,term_days,grace_days,credit_status,sales_blocked,sales_blocked_reason,created_at,updated_at').eq('tenant_id', context.tenantId).eq('id', id).maybeSingle();
    if (current.error) throw new Error(current.error.message);
    if (!current.data) return NextResponse.json({ error: 'El registro no existe en este tenant.' }, { status: 404 });
    const currentRow = current.data as Record<string, any>;
    const currentMetadata = currentRow.metadata && typeof currentRow.metadata === 'object' ? currentRow.metadata : {};
    const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.active === 'boolean') changes.active = body.active;
    if (typeof body.name === 'string') {
      const name = text(body.name);
      if (name.length < 2) return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 });
      changes.name = name;
    }
    if (typeof body.email === 'string') {
      const email = text(body.email, 160).toLowerCase();
      if (email && !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'El correo no es válido.' }, { status: 400 });
      changes.email = email || null;
    }
    if (typeof body.phone === 'string') changes.phone = text(body.phone, 40) || null;
    if (typeof body.taxId === 'string') changes.document_id = text(body.taxId, 60) || null;
    const metadata = { ...currentMetadata } as Record<string, unknown>;
    if (typeof body.address === 'string') metadata.address = text(body.address, 240);
    if (typeof body.notes === 'string') metadata.notes = text(body.notes, 500);
    changes.metadata = metadata;
    if (type === 'customer' && typeof body.creditLimit === 'number') {
      const creditLimit = money(body.creditLimit);
      const creditBalance = money(metadata.creditBalance);
      if (creditLimit < creditBalance) return NextResponse.json({ error: 'El límite de crédito no puede ser menor que el saldo utilizado.' }, { status: 409 });
      changes.credit_limit = creditLimit;
    }
    if (type === 'customer') {
      if (typeof body.creditEnabled === 'boolean') changes.credit_enabled = body.creditEnabled;
      if (typeof body.termDays === 'number') changes.term_days = Math.max(0, Math.floor(body.termDays));
      if (typeof body.graceDays === 'number') changes.grace_days = Math.max(0, Math.floor(body.graceDays));
      if (typeof body.creditStatus === 'string' && ['activo', 'bloqueado', 'en_cobro', 'incobrable'].includes(body.creditStatus)) changes.credit_status = body.creditStatus;
      if (typeof body.salesBlocked === 'boolean') changes.sales_blocked = body.salesBlocked;
      if (typeof body.salesBlockedReason === 'string') changes.sales_blocked_reason = text(body.salesBlockedReason, 300) || null;
    }
    const result = await supabase.from(tableFor(type)).update(changes).eq('tenant_id', context.tenantId).eq('id', id).select('id,tenant_id,name,email,phone,document_id,active,metadata,credit_limit,credit_enabled,term_days,grace_days,credit_status,sales_blocked,sales_blocked_reason,created_at,updated_at').single();
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ ok: true, id, changes: mapContact(result.data as Record<string, any>, type) });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
