import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const salesApi = readFileSync('app/api/sales/route.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260915210406_add_keyset_order_indexes.sql', 'utf8');

test('ventas usa cursor estable por created_at e id y conserva el tenant autenticado', () => {
  assert.match(salesApi, /\.eq\('tenant_id', context\.tenantId\)/);
  assert.match(salesApi, /\.order\('created_at', \{ ascending: false \}\)\.order\('id', \{ ascending: false \}\)/);
  assert.match(salesApi, /created_at\.lt\.\$\{cursor\.createdAt\}/);
  assert.match(salesApi, /created_at\.eq\.\$\{cursor\.createdAt\},id\.lt\.\$\{cursor\.id\}/);
  assert.match(salesApi, /pagination: \{ pageSize, hasMore, nextCursor \}/);
  assert.match(salesApi, /Cursor de ventas inválido/);
});

test('la migración crea índices compuestos idempotentes para las consultas ordenadas', () => {
  assert.match(migration, /create index if not exists products_tenant_name_id_idx/);
  assert.match(migration, /create index if not exists customers_tenant_name_id_idx/);
  assert.match(migration, /create index if not exists inventory_stocks_tenant_updated_id_idx/);
  assert.match(migration, /create index if not exists sales_tenant_created_id_idx/);
});

assert.ok(salesApi.includes("limit(pageSize + 1)"));
assert.ok(salesApi.includes("const rows = fetchedRows.slice(0, pageSize)"));
