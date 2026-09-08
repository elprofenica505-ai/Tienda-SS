import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getEntitlementLimit, hasCapacity } from '@/lib/entitlements';

const onboarding = readFileSync('app/onboarding/page.tsx', 'utf8');
const members = readFileSync('app/workspace/members/page.tsx', 'utf8');
const invitePage = readFileSync('app/accept-invitation/page.tsx', 'utf8');
const tenantRoute = readFileSync('app/api/tenants/route.ts', 'utf8');

test('el wizard de dueño tiene como máximo cuatro pasos y cubre negocio, equipo, producto y venta', () => {
  assert.match(onboarding, /Paso \$\{step\} de 4/);
  assert.match(onboarding, /Nombre del negocio/);
  assert.match(onboarding, /api\/invitations/);
  assert.match(onboarding, /Agrega tu primer producto/);
  assert.match(onboarding, /Haz tu primera venta/);
});

test('las invitaciones tienen pantalla de aceptación y el owner no solicita contraseñas', () => {
  assert.match(members, /Enviar invitación/);
  assert.doesNotMatch(members, /Contraseña inicial/);
  assert.match(invitePage, /api\/invitations\/accept/);
  assert.match(invitePage, /Aceptar invitación/);
});

test('la creación de empresa crea tenant y owner sin datos operativos', () => {
  assert.match(tenantRoute, /collection\('tenants'\)\.doc\(uid\)/);
  assert.match(tenantRoute, /role: 'owner'/);
  assert.doesNotMatch(tenantRoute, /collection\(['"](products|sales|customers)['"]\)/);
});

test('los límites Starter/Growth bloquean y permiten capacidad de miembros y productos', () => {
  assert.equal(getEntitlementLimit('starter', 'members'), 3);
  assert.equal(getEntitlementLimit('starter', 'products'), 100);
  assert.equal(hasCapacity('starter', 'members', 3, 1), false);
  assert.equal(hasCapacity('starter', 'products', 99, 1), true);
  assert.equal(hasCapacity('growth', 'members', 14, 1), true);
});
