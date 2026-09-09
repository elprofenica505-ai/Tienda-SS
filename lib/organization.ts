import type { CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebaseAdmin';

export type OrganizationResource = 'branches' | 'warehouses' | 'cashRegisters';

export type Branch = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  timezone: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type Warehouse = {
  id: string;
  branchId: string;
  name: string;
  code: string;
  type: 'store' | 'warehouse' | 'transit';
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type CashRegister = {
  id: string;
  branchId: string;
  name: string;
  code: string;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export function organizationCollection(tenantId: string, resource: OrganizationResource): CollectionReference {
  return getAdminDb().collection('tenants').doc(tenantId).collection(resource);
}

function normalizedText(value: unknown, fallback: string, max = 100): string {
  const text = typeof value === 'string' ? value.trim().slice(0, max) : '';
  return text || fallback;
}

export function safeCode(value: unknown, fallback: string): string {
  return normalizedText(value, fallback, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, '-').slice(0, 40);
}

export async function ensureDefaultOrganization(tenantId: string, tenantName?: string): Promise<void> {
  const db = getAdminDb();
  const tenantRef = db.collection('tenants').doc(tenantId);
  const branchRef = tenantRef.collection('branches').doc('branch-main');
  const warehouseRef = tenantRef.collection('warehouses').doc('warehouse-main');
  const registerRef = tenantRef.collection('cashRegisters').doc('register-main');
  const [branch, warehouse, register] = await Promise.all([branchRef.get(), warehouseRef.get(), registerRef.get()]);
  const now = new Date();
  const batch = db.batch();
  const branchData = {
    name: normalizedText(tenantName, 'Sucursal principal'),
    code: 'PRINCIPAL',
    active: true,
    timezone: 'America/Managua',
    createdAt: now,
    updatedAt: now,
  };
  if (!branch.exists) batch.create(branchRef, branchData);
  if (!warehouse.exists) batch.create(warehouseRef, { branchId: branchRef.id, name: 'Almacén principal', code: 'ALM-PRINCIPAL', type: 'warehouse', active: true, createdAt: now, updatedAt: now });
  if (!register.exists) batch.create(registerRef, { branchId: branchRef.id, name: 'Caja principal', code: 'CAJA-PRINCIPAL', active: true, createdAt: now, updatedAt: now });
  if (!branch.exists || !warehouse.exists || !register.exists) await batch.commit();
}

export async function getOrganization(tenantId: string) {
  await ensureDefaultOrganization(tenantId);
  const tenant = getAdminDb().collection('tenants').doc(tenantId);
  const branchesPromise = tenant.collection('branches').where('active', '==', true).orderBy('name').get().catch((error: unknown) => {
    console.warn('[organization] branches query unavailable; continuing with an empty branch list', error);
    return null;
  });
  const [branches, warehouses, cashRegisters, members] = await Promise.all([
    branchesPromise,
    tenant.collection('warehouses').where('active', '==', true).orderBy('name').get(),
    tenant.collection('cashRegisters').where('active', '==', true).orderBy('name').get(),
    tenant.collection('members').orderBy('name').get(),
  ]);
  const rows = <T extends Record<string, unknown>>(snapshot: FirebaseFirestore.QuerySnapshot<T>) => snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return { branches: branches ? rows(branches) : [], warehouses: rows(warehouses), cashRegisters: rows(cashRegisters), members: rows(members) };
}

export function branchIdsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(item)).slice(0, 50)));
}

export function assertOrganizationResource(value: unknown): asserts value is OrganizationResource {
  if (value !== 'branches' && value !== 'warehouses' && value !== 'cashRegisters') throw new Error('ORGANIZATION_RESOURCE_INVALID');
}

export function organizationParentId(resource: OrganizationResource, value: unknown): string {
  if (resource === 'branches') return '';
  const branchId = typeof value === 'string' ? value.trim() : '';
  if (!branchId) throw new Error('BRANCH_REQUIRED');
  return branchId;
}

export function organizationDocumentRef(tenantId: string, resource: OrganizationResource, id?: string): DocumentReference {
  const collection = organizationCollection(tenantId, resource);
  return id ? collection.doc(id) : collection.doc();
}

export function organizationName(value: unknown, resource: OrganizationResource): string {
  const fallback = resource === 'branches' ? 'Sucursal' : resource === 'warehouses' ? 'Almacén' : 'Caja';
  return normalizedText(value, fallback);
}
