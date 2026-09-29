import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let testEnvironment: RulesTestEnvironment;

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: 'demo-tienda-firestore-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await testEnvironment.cleanup();
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'tenants/alpha'), { name: 'Empresa Alpha' }),
      setDoc(doc(db, 'tenants/alpha/members/owner-alpha'), { role: 'owner', status: 'active' }),
      setDoc(doc(db, 'tenants/alpha/members/member-alpha'), { role: 'vendedor', status: 'active' }),
      setDoc(doc(db, 'tenants/alpha/members/inactive-alpha'), { role: 'owner', status: 'inactive' }),
      setDoc(doc(db, 'tenants/alpha/notifications/notice-1'), { title: 'Aviso privado' }),
      setDoc(doc(db, 'tenants/beta'), { name: 'Empresa Beta' }),
      setDoc(doc(db, 'tenants/beta/members/owner-beta'), { role: 'owner', status: 'active' }),
    ]);
  });
});

test('rechaza lecturas sin autenticar y accesos a empresas ajenas', async () => {
  const anonymousDb = testEnvironment.unauthenticatedContext().firestore();
  const alphaMemberDb = testEnvironment.authenticatedContext('member-alpha').firestore();

  await assertFails(getDoc(doc(anonymousDb, 'tenants/alpha')));
  await assertSucceeds(getDoc(doc(alphaMemberDb, 'tenants/alpha')));
  await assertFails(getDoc(doc(alphaMemberDb, 'tenants/beta')));
});

test('rechaza usuarios inactivos aunque exista su registro de miembro', async () => {
  const inactiveDb = testEnvironment.authenticatedContext('inactive-alpha').firestore();
  await assertFails(getDoc(doc(inactiveDb, 'tenants/alpha')));
});

test('solo un gerente activo puede modificar los datos de la empresa', async () => {
  const ownerDb = testEnvironment.authenticatedContext('owner-alpha').firestore();
  const memberDb = testEnvironment.authenticatedContext('member-alpha').firestore();

  await assertSucceeds(updateDoc(doc(ownerDb, 'tenants/alpha'), { name: 'Nombre actualizado' }));
  await assertFails(updateDoc(doc(memberDb, 'tenants/alpha'), { name: 'Cambio no autorizado' }));
});

test('un miembro activo puede leer notificaciones de su empresa, no crear otras', async () => {
  const memberDb = testEnvironment.authenticatedContext('member-alpha').firestore();

  await assertSucceeds(getDoc(doc(memberDb, 'tenants/alpha/notifications/notice-1')));
  await assertFails(setDoc(doc(memberDb, 'tenants/alpha/notifications/notice-2'), { title: 'No autorizado' }));
});
