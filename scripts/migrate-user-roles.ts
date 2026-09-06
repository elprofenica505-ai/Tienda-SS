import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAdminDb } from '../lib/firebaseAdmin';

type AnyRecord = Record<string, unknown>;
type TargetRole =
  | 'owner'
  | 'admin'
  | 'gerente'
  | 'supervisor_sucursal'
  | 'vendedor'
  | 'cajero'
  | 'bodega'
  | 'compras'
  | 'chofer'
  | 'despachador'
  | 'solo_lectura';
type SourceKind = 'tenant-member' | 'legacy-user';
type PlannedChange = {
  source: SourceKind;
  path: string;
  identity: string;
  previousRole: string | null;
  nextRole: TargetRole;
  reason: string;
};

type MigrationReport = {
  mode: 'dry-run' | 'apply';
  generatedAt: string;
  tenantFilter: string | null;
  counts: {
    tenantsScanned: number;
    membersScanned: number;
    legacyUsersScanned: number;
    changesPlanned: number;
    changesApplied: number;
    unchanged: number;
  };
  changes: PlannedChange[];
  warnings: string[];
};

const DEFAULT_REPORT = 'reports/migration-user-roles.json';
const CONFIRMATION = 'UPDATE_ROLES';
const VALID_ROLES = new Set<TargetRole>([
  'owner', 'admin', 'gerente', 'supervisor_sucursal', 'vendedor', 'cajero',
  'bodega', 'compras', 'chofer', 'despachador', 'solo_lectura',
]);

function parseArgs() {
  const values: Record<string, string> = {};
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) continue;
    const [key, inlineValue] = argument.slice(2).split('=', 2);
    const nextValue = inlineValue ?? args[index + 1];
    const hasValue = inlineValue !== undefined || (nextValue !== undefined && !nextValue.startsWith('--'));
    values[key] = hasValue ? nextValue : 'true';
    if (inlineValue === undefined && hasValue) index += 1;
  }
  return {
    apply: values.apply === 'true',
    confirm: values.confirm || '',
    tenantId: values['tenant-id'] || process.env.MIGRATION_TENANT_ID || '',
    report: values.report || process.env.MIGRATION_REPORT || DEFAULT_REPORT,
    help: values.help === 'true',
  };
}

function printHelp() {
  console.log(`
Uso seguro:
  npx tsx scripts/migrate-user-roles.ts --tenant-id=TENANT_ID
  npx tsx scripts/migrate-user-roles.ts --apply --confirm=${CONFIRMATION}

Opciones:
  --tenant-id=ID  Limita la migración a un tenant. Sin esta opción revisa todos.
  --apply         Ejecuta los cambios. Sin esta opción solo genera un dry-run.
  --confirm=TEXT  Debe ser ${CONFIRMATION} junto con --apply.
  --report=PATH   Reporte JSON local. También MIGRATION_REPORT.
  --help          Muestra esta ayuda.

Reglas:
  - Las asignaciones ya válidas de los once roles no se modifican.
  - El rol legacy jefe se migra a gerente por conservar permisos de administración.
  - Roles ausentes o desconocidos se asignan a solo_lectura como valor seguro.
  - La cuenta owner nunca se degrada.
  - FIREBASE_SERVICE_ACCOUNT_KEY es obligatoria.
`);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
}

export function roleFor(value: unknown): { role: TargetRole; reason: string } {
  const raw = text(value);
  const normalized = normalize(raw);
  if (VALID_ROLES.has(normalized as TargetRole)) {
    return { role: normalized as TargetRole, reason: 'already_valid_role' };
  }

  const aliases: Record<string, TargetRole> = {
    propietario: 'owner',
    administrador: 'admin',
    manager: 'gerente',
    jefe: 'gerente',
    supervisor: 'supervisor_sucursal',
    supervisor_de_sucursal: 'supervisor_sucursal',
    vendedor: 'vendedor',
    cajero: 'cajero',
    bodega: 'bodega',
    compras: 'compras',
    comprador: 'compras',
    chofer: 'chofer',
    despachador: 'despachador',
    solo_lectura: 'solo_lectura',
    lectura: 'solo_lectura',
    readonly: 'solo_lectura',
  };

  if (aliases[normalized]) {
    return {
      role: aliases[normalized],
      reason: raw ? `legacy_alias:${normalized}` : 'missing_role_default',
    };
  }

  return { role: 'solo_lectura', reason: raw ? `unknown_role_default:${normalized}` : 'missing_role_default' };
}

function identity(data: AnyRecord, fallback: string): string {
  return text(data.email) || text(data.name) || text(data.nombre) || fallback;
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }
  if (options.apply && options.confirm !== CONFIRMATION) {
    throw new Error(`Para aplicar cambios debes usar --confirm=${CONFIRMATION}.`);
  }
  if (options.tenantId.includes('/')) {
    throw new Error('El tenant-id debe ser un identificador simple sin barras.');
  }

  const db = getAdminDb();
  const report: MigrationReport = {
    mode: options.apply ? 'apply' : 'dry-run',
    generatedAt: new Date().toISOString(),
    tenantFilter: options.tenantId || null,
    counts: { tenantsScanned: 0, membersScanned: 0, legacyUsersScanned: 0, changesPlanned: 0, changesApplied: 0, unchanged: 0 },
    changes: [],
    warnings: [],
  };
  const writes: Array<{ path: string; data: AnyRecord }> = [];

  const tenantSnapshot = options.tenantId
    ? await db.collection('tenants').doc(options.tenantId).get().then((doc) => doc.exists ? [doc] : [])
    : (await db.collection('tenants').get()).docs;

  for (const tenant of tenantSnapshot) {
    report.counts.tenantsScanned += 1;
    const members = await tenant.ref.collection('members').get();
    for (const member of members.docs) {
      report.counts.membersScanned += 1;
      const data = member.data() as AnyRecord;
      const current = text(data.role) || null;
      const resolved = roleFor(current);
      if (current && resolved.reason === 'already_valid_role') {
        report.counts.unchanged += 1;
        continue;
      }
      const change: PlannedChange = {
        source: 'tenant-member',
        path: member.ref.path,
        identity: identity(data, member.id),
        previousRole: current,
        nextRole: resolved.role,
        reason: resolved.reason,
      };
      report.changes.push(change);
      writes.push({ path: member.ref.path, data: { role: resolved.role, roleMigratedAt: new Date(), roleMigrationSource: 'migrate-user-roles' } });
    }
  }

  if (!options.tenantId) {
    const users = await db.collection('usuarios').get();
    for (const user of users.docs) {
      report.counts.legacyUsersScanned += 1;
      const data = user.data() as AnyRecord;
      const current = text(data.rol) || null;
      const resolved = roleFor(current);
      if (current && resolved.reason === 'already_valid_role') {
        report.counts.unchanged += 1;
        continue;
      }
      const change: PlannedChange = {
        source: 'legacy-user',
        path: user.ref.path,
        identity: identity(data, user.id),
        previousRole: current,
        nextRole: resolved.role,
        reason: resolved.reason,
      };
      report.changes.push(change);
      writes.push({ path: user.ref.path, data: { rol: resolved.role, roleMigratedAt: new Date(), roleMigrationSource: 'migrate-user-roles' } });
    }
  } else {
    report.warnings.push('Se omitió la colección global usuarios porque se especificó --tenant-id.');
  }

  report.counts.changesPlanned = writes.length;
  if (!options.apply) {
    report.warnings.push('Dry-run: no se escribieron documentos.');
  } else {
    for (let index = 0; index < writes.length; index += 450) {
      const batch = db.batch();
      for (const write of writes.slice(index, index + 450)) {
        batch.set(db.doc(write.path), write.data, { merge: true });
      }
      await batch.commit();
      report.counts.changesApplied += Math.min(450, writes.length - index);
    }
  }

  await mkdir(dirname(options.report), { recursive: true });
  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ mode: report.mode, counts: report.counts, report: options.report, warnings: report.warnings }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error('migration_user_roles_failed', { message: error instanceof Error ? error.message : 'Unknown error' });
    process.exitCode = 1;
  });
}
