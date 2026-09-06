import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultPermissions } from '../lib/permissions';

test('Supervisor de Sucursal puede operar y supervisar, pero no administrar el tenant', () => {
  const permissions = defaultPermissions.supervisor_sucursal;

  assert.equal(permissions.dashboard.view, true);
  assert.equal(permissions.sales.create, true);
  assert.equal(permissions.sales.edit, true);
  assert.equal(permissions.inventory.create, true);
  assert.equal(permissions.finance.edit, true);
  assert.equal(permissions.reports.export, true);
  assert.equal(permissions.members.view, true);
  assert.equal(permissions.members.create, true);
  assert.equal(permissions.members.edit, true);
  assert.equal(permissions.members.delete, false);
});

test('Cajero puede operar ventas, clientes, cobros y caja, pero no inventario ni miembros', () => {
  const permissions = defaultPermissions.cajero;

  assert.equal(permissions.sales.view, true);
  assert.equal(permissions.sales.create, true);
  assert.equal(permissions.sales.edit, true);
  assert.equal(permissions.sales.delete, false);
  assert.equal(permissions.contacts.create, true);
  assert.equal(permissions.receivables.create, true);
  assert.equal(permissions.finance.create, true);
  assert.equal(permissions.inventory.create, false);
  assert.equal(permissions.inventory.edit, false);
  assert.equal(permissions.members.view, false);
  assert.equal(permissions.members.create, false);
  assert.equal(permissions.members.edit, false);
});
