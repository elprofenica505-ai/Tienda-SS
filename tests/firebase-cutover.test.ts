import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

test('Workspace operativo no importa Firebase ni Firebase Admin', async () => {
  const files = (await Promise.all(['app', 'components', 'lib'].map(sourceFiles))).flat();
  const offenders: string[] = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    if (/from ['"](?:firebase|firebase-admin)|require\(['"](?:firebase|firebase-admin)|getAdminDb|getAdminAuth/.test(content)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test('catálogo import/export usan Supabase y RPC, no Firestore', async () => {
  const imp = await readFile('app/api/catalog/import/route.ts', 'utf8');
  const exp = await readFile('app/api/catalog/export/route.ts', 'utf8');
  assert.match(imp, /import_catalog_products/);
  assert.match(exp, /consume_catalog_export/);
  assert.doesNotMatch(`${imp}\n${exp}`, /firestore|firebase/i);
});
