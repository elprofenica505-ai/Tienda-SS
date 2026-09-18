import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260918000009_fix_commercial_price_product_id_ambiguity.sql',
  'utf8',
);
const inventoryMigration = readFileSync(
  'supabase/migrations/20260918000012_fix_create_sale_inventory_product_id_ambiguity.sql',
  'utf8',
);

test('la resolución de precios comerciales califica el product id sin ambigüedad SQL', () => {
  assert.match(migration, /resolved_product_id uuid/);
  assert.match(migration, /pli\.product_id = resolved_product_id/);
  assert.doesNotMatch(migration, /pli\.product_id = product_id/);
  assert.match(migration, /grant execute on function public\.erp_commercial_price_items/);
  assert.match(inventoryMigration, /target_product_id uuid/);
  assert.match(inventoryMigration, /inventory_stock\.product_id=target_product_id/);
  assert.doesNotMatch(inventoryMigration, /inventory_stock\.product_id=product_id/);
});
