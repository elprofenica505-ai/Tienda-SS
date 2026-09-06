import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc } from 'firebase/firestore';
import fs from 'node:fs';

const PROJECT_ID = 'nexoflow-rules-test';
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const OWNER_A = 'owner-a';
const SELLER_A = 'seller-a';
const WAREHOUSE_A = 'warehouse-a';
const INACTIVE_A = 'inactive-a';
const OWNER_B = 'owner-b';

let testEnv;

const path = (tenantId, collectionName, id) => `tenants/${tenantId}/${collectionName}/${id}`;

function dbFor(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

function unauthenticatedDb() {
  return testEnv.unauthenticatedContext().firestore();
}

async function seedTenant(tenantId, ownerUid) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, `tenants/${tenantId}`), { name: tenantId, status: 'active' });
    await setDoc(doc(adminDb, path(tenantId, 'members', ownerUid)), {
      uid: ownerUid,
      role: 'owner',
      status: 'active',
    });
  });
}

async function seedMember(tenantId, uid, role, status = 'active') {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path(tenantId, 'members', uid)), { uid, role, status });
  });
}

async function seedDocument(tenantId, collectionName, id, data = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path(tenantId, collectionName, id)), data);
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
  await testEnv.clearFirestore();
  await seedTenant(TENANT_A, OWNER_A);
  await seedTenant(TENANT_B, OWNER_B);
  await seedMember(TENANT_A, SELLER_A, 'vendedor');
  await seedMember(TENANT_A, WAREHOUSE_A, 'bodega');
  await seedMember(TENANT_A, INACTIVE_A, 'admin', 'inactive');
  await seedDocument(TENANT_A, 'products', 'product-a', { name: 'Product A', stock: 10 });
  await seedDocument(TENANT_B, 'products', 'product-b', { name: 'Product B', stock: 20 });
});

after(async () => {
  await testEnv.cleanup();
});

describe('Firestore tenant isolation', () => {
  it('denies unauthenticated access to a tenant document', async () => {
    await assertFails(getDoc(doc(unauthenticatedDb(), path(TENANT_A, 'products', 'product-a'))));
  });

  it('allows an active member to read data in its own tenant', async () => {
    await assertSucceeds(getDoc(doc(dbFor(OWNER_A), path(TENANT_A, 'products', 'product-a'))));
    await assertSucceeds(getDoc(doc(dbFor(SELLER_A), path(TENANT_A, 'products', 'product-a'))));
  });

  it('denies a member from reading another tenant', async () => {
    await assertFails(getDoc(doc(dbFor(OWNER_A), path(TENANT_B, 'products', 'product-b'))));
    await assertFails(getDoc(doc(dbFor(OWNER_B), path(TENANT_A, 'products', 'product-a'))));
  });

  it('denies a member from writing another tenant', async () => {
    await assertFails(setDoc(doc(dbFor(OWNER_A), path(TENANT_B, 'products', 'cross-write')), { name: 'Cross write' }));
    await assertFails(updateDoc(doc(dbFor(OWNER_B), path(TENANT_A, 'products', 'product-a')), { stock: 0 }));
    await assertFails(deleteDoc(doc(dbFor(OWNER_A), path(TENANT_B, 'products', 'product-b'))));
  });

  it('denies inactive members even when their role is privileged', async () => {
    await assertFails(getDoc(doc(dbFor(INACTIVE_A), path(TENANT_A, 'products', 'product-a'))));
    await assertFails(setDoc(doc(dbFor(INACTIVE_A), path(TENANT_A, 'products', 'inactive-write')), { name: 'Denied' }));
  });

  it('enforces product permissions within the correct tenant', async () => {
    await assertSucceeds(setDoc(doc(dbFor(WAREHOUSE_A), path(TENANT_A, 'products', 'warehouse-product')), { name: 'Warehouse product' }));
    await assertFails(setDoc(doc(dbFor(SELLER_A), path(TENANT_A, 'products', 'seller-product')), { name: 'Seller product' }));
    await assertSucceeds(updateDoc(doc(dbFor(OWNER_A), path(TENANT_A, 'products', 'product-a')), { stock: 11 }));
    await assertFails(deleteDoc(doc(dbFor(SELLER_A), path(TENANT_A, 'products', 'product-a'))));
  });

  it('allows sales creation only inside the authenticated member tenant', async () => {
    await assertSucceeds(setDoc(doc(dbFor(SELLER_A), path(TENANT_A, 'sales', 'sale-a')), { total: 100 }));
    await assertFails(setDoc(doc(dbFor(SELLER_A), path(TENANT_B, 'sales', 'sale-cross')), { total: 100 }));
  });

  it('allows managers to manage members but blocks ordinary sellers', async () => {
    await assertSucceeds(setDoc(doc(dbFor(OWNER_A), path(TENANT_A, 'members', 'new-member')), { role: 'cajero', status: 'active' }));
    await assertFails(setDoc(doc(dbFor(SELLER_A), path(TENANT_A, 'members', 'seller-created-member')), { role: 'cajero', status: 'active' }));
    await assertFails(deleteDoc(doc(dbFor(OWNER_A), path(TENANT_B, 'members', OWNER_B))));
  });

  it('rejects invalid member roles and statuses', async () => {
    const ownerDb = dbFor(OWNER_A);
    await assertFails(setDoc(doc(ownerDb, path(TENANT_A, 'members', 'invalid-role')), {
      role: 'superadmin',
      status: 'active',
    }));
    await assertFails(setDoc(doc(ownerDb, path(TENANT_A, 'members', 'invalid-status')), {
      role: 'vendedor',
      status: 'pending',
    }));
  });

  it('denies direct access to legacy global collections', async () => {
    await assertFails(getDoc(doc(dbFor(OWNER_A), 'products', 'legacy-product')));
    await assertFails(setDoc(doc(dbFor(OWNER_A), 'products', 'legacy-write'), { name: 'Legacy write' }));
  });

  it('denies access to undeclared tenant collections by default', async () => {
    await assertFails(getDoc(doc(dbFor(OWNER_A), path(TENANT_A, 'unknownCollection', 'unknown'))));
    await assertFails(setDoc(doc(dbFor(OWNER_A), path(TENANT_A, 'unknownCollection', 'unknown')), { shouldBeDenied: true }));
  });

  it('does not permit a tenant to query another tenant through a collection group path', async () => {
    const db = dbFor(OWNER_A);
    await assertFails(addDoc(collection(db, `tenants/${TENANT_B}/products`), { name: 'Query escape' }));
  });
});

export {};
