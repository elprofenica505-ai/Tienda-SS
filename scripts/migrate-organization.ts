import { getAdminDb } from '../lib/firebaseAdmin';

const CONFIRM = 'MIGRATE_ORGANIZATION';
const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes(`--confirm=${CONFIRM}`);
const tenantFilter = process.argv.find((arg) => arg.startsWith('--tenant-id='))?.slice('--tenant-id='.length) || '';

if (apply && !confirmed) throw new Error(`Para aplicar cambios usa --confirm=${CONFIRM}.`);
if (tenantFilter.includes('/')) throw new Error('El tenant-id no puede contener barras.');

async function main() {
  const db = getAdminDb();
  const tenants = tenantFilter ? (await db.collection('tenants').doc(tenantFilter).get()).exists ? [await db.collection('tenants').doc(tenantFilter).get()] : [] : (await db.collection('tenants').get()).docs;
  let tenantsScanned = 0; let membersUpdated = 0; let resourcesCreated = 0;
  for (const tenant of tenants) {
    tenantsScanned += 1;
    const now = new Date();
    const branch = tenant.ref.collection('branches').doc('branch-main');
    const warehouse = tenant.ref.collection('warehouses').doc('warehouse-main');
    const register = tenant.ref.collection('cashRegisters').doc('register-main');
    const [branchSnapshot, warehouseSnapshot, registerSnapshot, members] = await Promise.all([branch.get(), warehouse.get(), register.get(), tenant.ref.collection('members').get()]);
    const batch = db.batch();
    if (!branchSnapshot.exists) { batch.create(branch, { name: 'Sucursal principal', code: 'PRINCIPAL', active: true, timezone: 'America/Managua', createdAt: now, updatedAt: now }); resourcesCreated += 1; }
    if (!warehouseSnapshot.exists) { batch.create(warehouse, { branchId: branch.id, name: 'Almacén principal', code: 'ALM-PRINCIPAL', type: 'warehouse', active: true, createdAt: now, updatedAt: now }); resourcesCreated += 1; }
    if (!registerSnapshot.exists) { batch.create(register, { branchId: branch.id, name: 'Caja principal', code: 'CAJA-PRINCIPAL', active: true, createdAt: now, updatedAt: now }); resourcesCreated += 1; }
    for (const member of members.docs) {
      if (!Array.isArray(member.data().branchIds) || member.data().branchIds.length === 0) { batch.update(member.ref, { branchIds: [branch.id], updatedAt: now, migration: 'organization-v1' }); membersUpdated += 1; }
    }
    if (apply) await batch.commit();
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', tenantsScanned, membersUpdated, resourcesCreated }, null, 2));
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
