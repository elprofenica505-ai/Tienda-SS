import { writeFile } from 'node:fs/promises';
import { getAdminDb } from '../lib/firebaseAdmin';

const LEGACY_PRODUCTS = 'productos';
const LEGACY_CATEGORIES = 'categorias';
const DEFAULT_TENANT_ID = 'tienda-principal';
const DEFAULT_REPORT = 'reports/migration-products-categories-dry-run.json';

type AnyRecord = Record<string, unknown>;

type ProductAnalysis = {
  id: string;
  name: string;
  category: string;
  issues: string[];
};

type CategoryAnalysis = {
  id: string;
  name: string;
  issues: string[];
};

type MigrationReport = {
  mode: 'dry-run';
  generatedAt: string;
  tenantId: string;
  sourceCollections: {
    products: string;
    categories: string;
  };
  destinationCollections: {
    products: string;
    categories: string;
  };
  destinationTenantExists: boolean;
  sourceCounts: {
    products: number;
    categories: number;
  };
  plannedOperations: {
    createProducts: number;
    createCategories: number;
    skipExistingDestinationDocuments: number;
    requireReview: number;
  };
  categoryNames: string[];
  products: ProductAnalysis[];
  categories: CategoryAnalysis[];
  warnings: string[];
  writesPerformed: number;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const values: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) continue;

    const [rawKey, inlineValue] = argument.slice(2).split('=', 2);
    const nextValue = inlineValue ?? args[index + 1];
    const hasNextValue = inlineValue !== undefined || (
      nextValue !== undefined && !nextValue.startsWith('--')
    );

    values[rawKey] = hasNextValue ? nextValue : 'true';
    if (inlineValue === undefined && hasNextValue) index += 1;
  }

  return {
    tenantId: values['tenant-id'] || process.env.MIGRATION_TENANT_ID || DEFAULT_TENANT_ID,
    report: values.report || process.env.MIGRATION_REPORT || DEFAULT_REPORT,
    help: values.help === 'true'
  };
}

function printHelp() {
  console.log(`
Uso:
  npx tsx scripts/migrate-global-data.ts --tenant-id=tienda-principal

Opciones:
  --tenant-id=ID  Tenant destino que se analizará. También MIGRATION_TENANT_ID.
  --report=RUTA   Reporte JSON local. También MIGRATION_REPORT.
  --help          Mostrar esta ayuda.

Seguridad:
  Este script está bloqueado en modo dry-run. No ejecuta set, update, delete ni batch.commit.
  Requiere FIREBASE_SERVICE_ACCOUNT_KEY en el entorno donde se ejecute.
`);
}

function asRecord(value: FirebaseFirestore.DocumentData): AnyRecord {
  return value as AnyRecord;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function analyzeProduct(id: string, data: AnyRecord): ProductAnalysis {
  const name = text(data.nombre ?? data.name ?? data.descripcion);
  const category = text(data.categoria ?? data.category) || 'Sin categoría';
  const issues: string[] = [];

  if (!name) issues.push('missing_name');
  if (numberValue(data.precio ?? data.price) === null) issues.push('missing_or_invalid_price');
  if (numberValue(data.stock) === null) issues.push('missing_or_invalid_stock');
  if (text(data.codigo ?? data.sku) === '') issues.push('missing_sku_or_code');
  if (category === 'Sin categoría') issues.push('missing_category');

  return { id, name, category, issues };
}

function analyzeCategory(id: string, data: AnyRecord): CategoryAnalysis {
  const name = text(data.nombre ?? data.name);
  const issues: string[] = [];

  if (!name) issues.push('missing_name');

  return { id, name, issues };
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.tenantId || options.tenantId.includes('/')) {
    throw new Error('El tenant-id debe ser un identificador simple sin barras.');
  }

  const db = getAdminDb();
  const destinationTenant = db.collection('tenants').doc(options.tenantId);
  const destinationTenantSnapshot = await destinationTenant.get();

  const [productsSnapshot, categoriesSnapshot] = await Promise.all([
    db.collection(LEGACY_PRODUCTS).get(),
    db.collection(LEGACY_CATEGORIES).get()
  ]);

  const products = productsSnapshot.docs.map((document) => (
    analyzeProduct(document.id, asRecord(document.data()))
  ));

  const categories = categoriesSnapshot.docs.map((document) => (
    analyzeCategory(document.id, asRecord(document.data()))
  ));

  const categoryNames = unique(categories.map((category) => category.name));
  const productCategoryNames = unique(products.map((product) => product.category));
  const missingReferencedCategories = productCategoryNames.filter(
    (category) => category !== 'Sin categoría' && !categoryNames.includes(category)
  );

  const [destinationProductsSnapshot, destinationCategoriesSnapshot] = destinationTenantSnapshot.exists
    ? await Promise.all([
      destinationTenant.collection('products').get(),
      destinationTenant.collection('categories').get()
    ])
    : [{ docs: [] }, { docs: [] }];
  const destinationProductIds = new Set(destinationProductsSnapshot.docs.map((document) => document.id));
  const destinationCategoryIds = new Set(destinationCategoriesSnapshot.docs.map((document) => document.id));

  const existingDestinationDocuments = products.filter((product) => destinationProductIds.has(product.id)).length
    + categories.filter((category) => destinationCategoryIds.has(category.id)).length;
  const recordsRequiringReview = products.filter((product) => product.issues.length > 0).length
    + categories.filter((category) => category.issues.length > 0).length;

  const warnings = [
    'No se escribieron documentos: este informe es exclusivamente dry-run.',
    'La colección legacy permanece intacta.',
    'La migración no se debe ejecutar hasta revisar los registros con issues.',
    ...(destinationTenantSnapshot.exists
      ? []
      : [`El tenant destino tenants/${options.tenantId} todavía no existe; el análisis no lo creó.`]),
    ...(missingReferencedCategories.length > 0
      ? [`Hay categorías usadas por productos que no aparecen en categorias: ${missingReferencedCategories.join(', ')}`]
      : []),
    ...(existingDestinationDocuments > 0
      ? [`Hay ${existingDestinationDocuments} documentos con el mismo ID en el destino; se omitirían para evitar sobrescritura.`]
      : [])
  ];

  const report: MigrationReport = {
    mode: 'dry-run',
    generatedAt: new Date().toISOString(),
    tenantId: options.tenantId,
    sourceCollections: {
      products: LEGACY_PRODUCTS,
      categories: LEGACY_CATEGORIES
    },
    destinationCollections: {
      products: `tenants/${options.tenantId}/products`,
      categories: `tenants/${options.tenantId}/categories`
    },
    destinationTenantExists: destinationTenantSnapshot.exists,
    sourceCounts: {
      products: products.length,
      categories: categories.length
    },
    plannedOperations: {
      createProducts: products.length - products.filter((product) => destinationProductIds.has(product.id)).length,
      createCategories: categories.length - categories.filter((category) => destinationCategoryIds.has(category.id)).length,
      skipExistingDestinationDocuments: existingDestinationDocuments,
      requireReview: recordsRequiringReview
    },
    categoryNames,
    products,
    categories,
    warnings,
    writesPerformed: 0
  };

  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    mode: report.mode,
    tenantId: report.tenantId,
    sourceCounts: report.sourceCounts,
    plannedOperations: report.plannedOperations,
    report: options.report,
    writesPerformed: report.writesPerformed,
    warnings: report.warnings
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error('migration_dry_run_failed', {
    message: error instanceof Error ? error.message : 'Unknown error'
  });
  process.exitCode = 1;
});
