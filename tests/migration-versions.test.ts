import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import test from 'node:test';

test('cada migración de Supabase tiene una versión única (dos archivos con la misma versión rompen el despliegue)', () => {
  const files = readdirSync('supabase/migrations').filter((file) => file.endsWith('.sql'));
  const seen = new Map<string, string>();
  for (const file of files) {
    const match = /^(\d+)_/.exec(file);
    assert.ok(match, `${file} debe empezar con su número de versión`);
    const version = match[1];
    assert.equal(seen.has(version), false, `La versión ${version} está repetida: ${seen.get(version)} y ${file}`);
    seen.set(version, file);
  }
});
