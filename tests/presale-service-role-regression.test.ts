import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('las RPC de reserva distinguen service_role de current_user bajo SECURITY DEFINER', async () => {
  const migration = await readFile('supabase/migrations/20260919000001_fix_presale_service_role_authorization.sql', 'utf8');
  assert.match(migration, /create or replace function public\.reserve_inventory/);
  assert.match(migration, /create or replace function public\.release_inventory_reservation/);
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/g);
  assert.doesNotMatch(migration, /current_user\s*[<>!=]+\s*'service_role'/);
});
