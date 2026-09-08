import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const loginSource = readFileSync('components/Login.tsx', 'utf8');
const tenantRouteSource = readFileSync('app/api/tenants/route.ts', 'utf8');

test('el login de producción no expone accesos demo ni la clave 1234', () => {
  assert.equal(loginSource.includes('Accesos rápidos'), false);
  assert.equal(loginSource.includes('Accesos rapidos'), false);
  assert.equal(loginSource.includes('Clave: 1234'), false);
  assert.equal(loginSource.includes('test.com'), false);
  assert.equal(loginSource.includes("setPassInput('1234')"), false);
});

test('la creación de empresa no contiene semillas de productos, ventas o clientes', () => {
  assert.equal(/collection\(['"](products|sales|customers|inventoryMovements)['"]\)/i.test(tenantRouteSource), false);
  assert.equal(/seed|demo|fake|fixture/i.test(tenantRouteSource), false);
});
