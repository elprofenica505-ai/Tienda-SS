import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * Guarda de regresión para el hallazgo crítico de seguridad de octubre 2026:
 * 10 tablas de negocio (etapas 4, 7 y 8) se crearon en el esquema `public` sin
 * `enable row level security`. En Supabase eso equivale a publicar la tabla en
 * la Data API para cualquiera que tenga la anon key (que es pública por diseño).
 *
 * Este test recorre TODAS las migraciones, recoge las tablas creadas en `public`
 * y exige que cada una tenga su `enable row level security` en alguna migración.
 * Si alguien añade una tabla nueva sin RLS, el test falla antes del despliegue.
 */

const MIGRATIONS_DIR = 'supabase/migrations';

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

/** Elimina comentarios de SQL para que la documentación no dispare falsos positivos. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
}

function readAll(): string {
  return stripSqlComments(
    migrationFiles()
      .map((file) => readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8'))
      .join('\n'),
  );
}

/** Tablas creadas explícitamente en el esquema public. */
function createdPublicTables(sql: string): Set<string> {
  const tables = new Set<string>();
  const pattern = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi;
  for (const match of Array.from(sql.matchAll(pattern))) tables.add(match[1].toLowerCase());
  return tables;
}

/**
 * Tablas con RLS habilitada. Cubre tanto `alter table public.x enable row level
 * security` como los bloques `DO $$ ... FOREACH table_name IN ARRAY[...] ... $$
 * que habilitan RLS de forma dinámica (patrón usado en 0002_erp_foundation.sql).
 */
function rlsEnabledTables(files: string[]): Set<string> {
  const enabled = new Set<string>();
  const direct = /alter\s+table\s+(?:if\s+exists\s+)?public\.([a-z_][a-z0-9_]*)[^;]*?enable\s+row\s+level\s+security/gi;

  for (const file of files) {
    const sql = stripSqlComments(readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8'));
    for (const match of Array.from(sql.matchAll(direct))) enabled.add(match[1].toLowerCase());

    // Bloques dinámicos: sólo se expanden si el archivo habilita RLS por bucle.
    if (!/enable\s+row\s+level\s+security/i.test(sql)) continue;
    for (const arrayMatch of Array.from(sql.matchAll(/array\s*\[([\s\S]*?)\]/gi))) {
      for (const name of Array.from(arrayMatch[1].matchAll(/'([a-z_][a-z0-9_]*)'/gi))) {
        enabled.add(name[1].toLowerCase());
      }
    }
  }
  return enabled;
}

test('toda tabla creada en el esquema public tiene Row Level Security habilitada', () => {
  const files = migrationFiles();
  const sql = readAll();
  const created = createdPublicTables(sql);
  const enabled = rlsEnabledTables(files);

  assert.ok(created.size > 40, `se esperaban muchas tablas, se encontraron ${created.size}`);

  const missing = Array.from(created).filter((table) => !enabled.has(table)).sort();
  assert.deepEqual(
    missing,
    [],
    `Estas tablas están en el esquema public SIN row level security y quedan expuestas a la anon key: ${missing.join(', ')}`,
  );
});

test('las tablas de etapas 4, 7 y 8 revierten los privilegios por defecto de la Data API', () => {
  const sql = readAll();
  const sensitive = [
    'price_lists',
    'price_list_items',
    'customer_price_lists',
    'branch_price_lists',
    'commercial_rules',
    'sales_commissions',
    'payables',
    'payable_payments',
    'financial_outflows',
    'cash_reconciliations',
  ];
  for (const table of sensitive) {
    assert.match(
      sql,
      new RegExp(`revoke all on table[\\s\\S]{0,900}public\\.${table}\\b`, 'i'),
      `${table} debe revocar los privilegios de anon/authenticated`,
    );
    assert.match(
      sql,
      new RegExp(`${table}_client_deny`, 'i'),
      `${table} debe declarar una política de denegación explícita`,
    );
  }
});

test('no se usa force row level security (rompería las funciones security definer)', () => {
  assert.doesNotMatch(readAll(), /force\s+row\s+level\s+security/i);
});

/**
 * En PostgreSQL `create function` concede EXECUTE a PUBLIC automáticamente, y
 * `anon`/`authenticated` heredan de PUBLIC. Toda función `security definer` que
 * quede sin revocar es invocable desde la Data API de Supabase
 * (`POST /rest/v1/rpc/<funcion>`) sin autenticación.
 */
test('toda función de public revoca EXECUTE de public, anon y authenticated', () => {
  const sql = readAll();

  const created = new Set<string>();
  for (const match of Array.from(sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_][a-z0-9_]*)/gi))) {
    created.add(match[1].toLowerCase());
  }
  assert.ok(created.size > 30, `se esperaban muchas funciones, se encontraron ${created.size}`);

  // Una sentencia revoke puede listar varias funciones separadas por comas.
  const revoked = new Set<string>();
  for (const stmt of Array.from(sql.matchAll(/revoke\s+(?:all|execute)[\s\S]*?on\s+function([\s\S]*?)\bfrom\s+(?:public|anon|authenticated)/gi))) {
    for (const fn of Array.from(stmt[1].matchAll(/public\.([a-z_][a-z0-9_]*)/gi))) {
      revoked.add(fn[1].toLowerCase());
    }
  }

  const exposed = Array.from(created).filter((fn) => !revoked.has(fn)).sort();
  assert.deepEqual(
    exposed,
    [],
    `Estas funciones son invocables por anon/authenticated desde /rest/v1/rpc y deben revocarse: ${exposed.join(', ')}`,
  );
});

test('ninguna vista del esquema public queda sin security_invoker (evita saltarse la RLS)', () => {
  const sql = readAll();
  const views = new Set<string>();
  for (const match of Array.from(sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+public\.([a-z_][a-z0-9_]*)/gi))) {
    views.add(match[1].toLowerCase());
  }
  for (const view of Array.from(views)) {
    assert.match(
      sql,
      new RegExp(`alter\\s+view\\s+public\\.${view}\\s+set\\s*\\(\\s*security_invoker\\s*=\\s*true`, 'i'),
      `La vista ${view} debe declarar security_invoker = true o puede saltarse la RLS de las tablas subyacentes`,
    );
  }
});
