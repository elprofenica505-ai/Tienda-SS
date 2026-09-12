import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

test('onSnapshot queda encapsulado en el hook realtime', () => {
  const hook = read('hooks/useFirestoreCollection.ts');
  assert.match(hook, /onSnapshot/);
  assert.match(hook, /return unsubscribe/);

  const applicationSources = [
    'app/workspace/page.tsx',
    'app/workspace/catalog/page.tsx',
    'app/workspace/inventory/page.tsx',
    'components/tenant/TenantProvider.tsx',
    'components/legacy/LegacyApp.tsx',
    'components/ProductosAdmin.tsx',
    'lib/firebase.ts',
  ];
  for (const source of applicationSources) {
    assert.doesNotMatch(read(source), /onSnapshot/);
  }
});

test('TenantProvider conserva cleanup para el listener de autenticación', () => {
  const provider = read('components/tenant/TenantProvider.tsx');
  assert.match(provider, /onIdTokenChanged/);
  assert.match(provider, /useEffect\(\(\) => onIdTokenChanged/);
});

test('la regla de costo queda documentada', () => {
  const guide = read('docs/FIRESTORE-LISTENERS-GUIDE.md');
  assert.match(guide, /getDocs.*carga inicial.*onSnapshot.*solo tiempo real necesario/);
});
