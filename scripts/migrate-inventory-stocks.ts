import { writeFile } from 'node:fs/promises';
import { getAdminDb } from '../lib/firebaseAdmin';
import { inventoryNumber, stockKey } from '../lib/inventory-cost';

const CONFIRM = 'MIGRATE_INVENTORY_STOCKS';
const DEFAULT_REPORT = 'reports/migration-inventory-stocks.json';
const BATCH_LIMIT = 400;

type AnyRecord = Record<string, unknown>;
type PlannedCreate = { tenantId: string; productId: string; warehouseId: string; branchId: string; quantity: number; averageCost: number };
type Difference = { tenantId: string; productId: string; warehouseId: string; productStock: number; canonicalStock: number; difference: number };
type MigrationReport = {
  mode: 'dry-run' | 'apply';
  generatedAt: string;
  tenantFilter: string | null;
  source: string;
  destination: string;
  tenantsScanned: number;
  productsScanned: number;
  warehouseStocksScanned: number;
  plannedCreates: number;
  created: number;
  existingCanonical: number;
  differences: Difference[];
  warnings: string[];
  writesPerformed: number;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) continue;
    const [key, inlineValue] = argument.slice(2).split('=', 2);
    const next = inlineValue ?? args[index + 1];
    const hasValue = inlineValue !== undefined || (next !== undefined && !next.startsWith('--'));
    values[key] = hasValue ? next : 'true';
    if (inlineValue === undefined && hasValue) index += 1;
  }
  return {
    tenantId: values['tenant-id'] || '',
    report: values.report || DEFAULT_REPORT,
    apply: values.apply === 'true',
    confirm: values.confirm || '',
    help: values.help === 'true',
  };
}

function printHelp() {
  console.log(`
Uso:
  npx tsx scripts/migrate-inventory-stocks.ts [--tenant-id=ID] [--report=RUTA]
  npx tsx scripts/migrate-inventory-stocks.ts --tenant-id=ID --apply --confirm=${CONFIRM}

Comportamiento:
  Sin --apply ejecuta un dry-run y no escribe Firestore.
  Con --apply solo crea inventoryStocks faltantes para warehouse-main.
  Nunca sobrescribe un inventoryStocks existente ni crea stock para otros almacenes.

Seguridad:
  --apply exige --confirm=${CONFIRM}.
  Requiere FIREBASE_SERVICE_ACCOUNT_KEY en el entorno donde se ejecute.
`);
}

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function asRecord(value: FirebaseFirestore.DocumentData): AnyRecord { return value as AnyRecord; }

async function main() {
  const options = parseArgs();
  if (options.help) return printHelp();
  if (options.tenantId.includes('/')) throw new Error('El tenant-id no puede contener barras.');
  if (options.apply && options.confirm !== CONFIRM) throw new Error(`Para aplicar cambios usa --confirm=${CONFIRM}.`);

  const db = getAdminDb();
  const tenantSnapshots = options.tenantId
    ? [(await db.collection('tenants').doc(options.tenantId).get())]
    : (await db.collection('tenants').get()).docs;
  const planned: PlannedCreate[] = [];
  const differences: Difference[] = [];
  const warnings: string[] = [];
  let productsScanned = 0;
  let warehouseStocksScanned = 0;
  let existingCanonical = 0;

  for (const tenantSnapshot of tenantSnapshots) {
    if (!tenantSnapshot.exists) {
      warnings.push(`Tenant inexistente: ${options.tenantId}`);
      continue;
    }
    const tenantId = tenantSnapshot.id;
    const tenant = tenantSnapshot.ref;
    const [warehouseSnapshot, productsSnapshot] = await Promise.all([
      tenant.collection('warehouses').doc('warehouse-main').get(),
      tenant.collection('products').get(),
    ]);
    if (!warehouseSnapshot.exists || warehouseSnapshot.data()?.active === false) {
      warnings.push(`Tenant ${tenantId} no tiene warehouse-main activo; sus productos no se migraron.`);
      continue;
    }
    const branchId = text(warehouseSnapshot.data()?.branchId);
    if (!branchId) {
      warnings.push(`Tenant ${tenantId} tiene warehouse-main sin branchId; sus productos no se migraron.`);
      continue;
    }
    const canonicalSnapshot = await tenant.collection('inventoryStocks').get();
    warehouseStocksScanned += canonicalSnapshot.size;
    const canonicalByProduct = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
    for (const document of canonicalSnapshot.docs) {
      const productId = text(document.data()?.productId);
      if (!productId) continue;
      canonicalByProduct.set(productId, [...(canonicalByProduct.get(productId) || []), document]);
    }
    for (const productSnapshot of productsSnapshot.docs) {
      productsScanned += 1;
      const product = asRecord(productSnapshot.data());
      const productId = productSnapshot.id;
      const legacyStock = inventoryNumber(product.stock);
      const canonicalDocs = canonicalByProduct.get(productId) || canonicalByProduct.get(text(product.productId)) || [];
      const mainCanonical = canonicalDocs.find((document) => text(document.data()?.warehouseId) === 'warehouse-main');
      if (mainCanonical) {
        existingCanonical += 1;
        const canonicalStock = canonicalDocs.reduce((sum, document) => sum + inventoryNumber(document.data()?.quantity), 0);
        if (canonicalStock !== legacyStock) differences.push({ tenantId, productId, warehouseId: 'warehouse-main', productStock: legacyStock, canonicalStock, difference: legacyStock - canonicalStock });
        continue;
      }
      planned.push({ tenantId, productId, warehouseId: 'warehouse-main', branchId, quantity: legacyStock, averageCost: inventoryNumber(product.averageCost) });
    }
  }

  let writesPerformed = 0;
  if (options.apply) {
    for (let index = 0; index < planned.length; index += BATCH_LIMIT) {
      const batch = db.batch();
      for (const item of planned.slice(index, index + BATCH_LIMIT)) {
        const ref = db.collection('tenants').doc(item.tenantId).collection('inventoryStocks').doc(stockKey(item.warehouseId, item.productId));
        batch.create(ref, { warehouseId: item.warehouseId, branchId: item.branchId, productId: item.productId, quantity: item.quantity, averageCost: item.averageCost, migratedFrom: 'products.stock', migration: 'inventory-stocks-v1', createdAt: new Date(), updatedAt: new Date() });
      }
      if (planned.slice(index, index + BATCH_LIMIT).length) { await batch.commit(); writesPerformed += planned.slice(index, index + BATCH_LIMIT).length; }
    }
  }

  if (differences.length) warnings.push(`Se detectaron ${differences.length} diferencias entre products.stock e inventoryStocks; no se sobrescribieron.`);
  if (!options.apply) warnings.push('Dry-run: no se escribieron documentos en Firestore.');
  if (options.apply && writesPerformed !== planned.length) warnings.push('La cantidad de escrituras no coincide con el plan; revisar el reporte.');

  const report: MigrationReport = {
    mode: options.apply ? 'apply' : 'dry-run', generatedAt: new Date().toISOString(), tenantFilter: options.tenantId || null,
    source: 'tenants/{tenantId}/products.stock', destination: 'tenants/{tenantId}/inventoryStocks/{warehouseId}__{productId}',
    tenantsScanned: tenantSnapshots.filter((snapshot) => snapshot.exists).length, productsScanned, warehouseStocksScanned, plannedCreates: planned.length,
    created: writesPerformed, existingCanonical, differences, warnings, writesPerformed,
  };
  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, report: options.report }, null, 2));
}

main().catch((error: unknown) => { console.error('inventory_stock_migration_failed', { message: error instanceof Error ? error.message : 'Unknown error' }); process.exitCode = 1; });
