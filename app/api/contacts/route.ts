import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireTenantMember, tenantErrorResponse, TenantRole } from '@/lib/tenant';

export const runtime = 'nodejs';
const manageRoles: TenantRole[] = ['owner', 'admin', 'jefe', 'vendedor', 'cajero'];
const supplierRoles: TenantRole[] = ['owner', 'admin', 'jefe', 'bodega'];

function text(value: unknown, max = 180) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function typeOf(value: unknown): 'customer' | 'supplier' { return value === 'supplier' ? 'supplier' : 'customer'; }
function collectionFor(type: 'customer' | 'supplier') { return type === 'supplier' ? 'suppliers' : 'customers'; }

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantMember(request);
    const type = typeOf(new URL(request.url).searchParams.get('type'));
    const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
    const snapshot = await getAdminDb().collection('tenants').doc(context.tenantId).collection(collectionFor(type)).orderBy('name').get();
    const contacts = snapshot.docs
      .filter((item) => includeArchived || item.data().active !== false)
      .map((item) => ({ id: item.id, ...item.data() }));
    return NextResponse.json({ ok: true, tenantId: context.tenantId, type, contacts }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const type = typeOf(body.type);
    const context = await requireTenantMember(request, type === 'supplier' ? supplierRoles : manageRoles);
    const name = text(body.name);
    const email = text(body.email, 160).toLowerCase();
    const phone = text(body.phone, 40);
    const taxId = text(body.taxId, 60);
    const address = text(body.address, 240);
    if (name.length < 2) return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 });
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'El correo no es válido.' }, { status: 400 });
    const collection = getAdminDb().collection('tenants').doc(context.tenantId).collection(collectionFor(type));
    const duplicate = await collection.where('name', '==', name).limit(1).get();
    if (!duplicate.empty) return NextResponse.json({ error: `Ya existe ${type === 'supplier' ? 'un proveedor' : 'un cliente'} con ese nombre.` }, { status: 409 });
    const ref = collection.doc();
    const contact = { name, email, phone, taxId, address, notes: text(body.notes, 500), active: true, createdBy: context.uid, createdAt: new Date(), updatedAt: new Date() };
    await ref.set(contact);
    return NextResponse.json({ ok: true, item: { id: ref.id, ...contact } }, { status: 201 });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const type = typeOf(body.type);
    const context = await requireTenantMember(request, type === 'supplier' ? supplierRoles : manageRoles);
    const id = text(body.id, 120);
    if (!id) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 });
    const ref = getAdminDb().collection('tenants').doc(context.tenantId).collection(collectionFor(type)).doc(id);
    const current = await ref.get();
    if (!current.exists) return NextResponse.json({ error: 'El registro no existe en este tenant.' }, { status: 404 });
    const changes: Record<string, unknown> = { updatedAt: new Date(), updatedBy: context.uid };
    if (typeof body.active === 'boolean') changes.active = body.active;
    for (const field of ['name', 'email', 'phone', 'taxId', 'address', 'notes']) if (typeof body[field] === 'string') changes[field] = text(body[field], field === 'notes' ? 500 : field === 'address' ? 240 : field === 'email' ? 160 : field === 'phone' ? 40 : 180);
    if (typeof changes.email === 'string') changes.email = (changes.email as string).toLowerCase();
    if (typeof changes.name === 'string' && (changes.name as string).length < 2) return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 });
    await ref.update(changes);
    return NextResponse.json({ ok: true, id, changes });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
