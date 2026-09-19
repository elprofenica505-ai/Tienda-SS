import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('la auditoría califica digest en el esquema extensions de Supabase', async () => {
  const migration = await readFile('supabase/migrations/20260919000002_fix_audit_digest_search_path.sql', 'utf8');
  assert.match(migration, /set search_path\s*=\s*public, extensions, pg_temp/i);
  assert.match(migration, /extensions\.digest\(payload::text, 'sha256'::text\)/);
});
