import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('cash_session_action califica las columnas del arqueo y evita amount ambiguo', async () => {
  const migration = await readFile('supabase/migrations/20260919000004_fix_cash_action_ambiguous_columns.sql', 'utf8');
  assert.match(migration, /cm\.amount as movement_amount/);
  assert.match(migration, /cm\.metadata as movement_metadata/);
  assert.doesNotMatch(migration, /select amount,metadata from public\.cash_movements/);
});
