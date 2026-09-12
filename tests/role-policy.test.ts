import assert from 'node:assert/strict';
import test from 'node:test';
import { canAssignRole, canManageRole } from '../lib/role-policy';

test('owner puede asignar cualquier rol de tenant distinto de owner', () => {
  assert.equal(canManageRole('owner', 'admin', 'gerente'), true);
  assert.equal(canManageRole('owner', 'vendedor', 'admin'), true);
});

test('admin puede administrar roles inferiores, pero no a otro admin ni owner', () => {
  assert.equal(canManageRole('admin', 'gerente', 'supervisor_sucursal'), true);
  assert.equal(canManageRole('admin', 'gerente', 'admin'), false);
  assert.equal(canManageRole('admin', 'owner', 'gerente'), false);
});

test('supervisor no puede promover a gerente o administrador', () => {
  assert.equal(canManageRole('supervisor_sucursal', 'vendedor', 'gerente'), false);
  assert.equal(canManageRole('supervisor_sucursal', 'vendedor', 'admin'), false);
});

test('un rol no puede conceder owner ni superadmin', () => {
  assert.equal(canManageRole('owner', 'admin', 'owner'), false);
  assert.equal(canManageRole('admin', 'gerente', 'superadmin' as never), false);
});

test('un actor no puede cambiar un objetivo de igual o mayor privilegio', () => {
  assert.equal(canManageRole('gerente', 'gerente', 'vendedor'), false);
  assert.equal(canManageRole('gerente', 'admin', 'vendedor'), false);
});

test('la creación directa de miembros respeta la jerarquía de asignación', () => {
  assert.equal(canAssignRole('owner', 'admin'), true);
  assert.equal(canAssignRole('admin', 'gerente'), true);
  assert.equal(canAssignRole('supervisor_sucursal', 'vendedor'), true);
  assert.equal(canAssignRole('supervisor_sucursal', 'gerente'), false);
  assert.equal(canAssignRole('supervisor_sucursal', 'admin'), false);
  assert.equal(canAssignRole('admin', 'owner'), false);
});
