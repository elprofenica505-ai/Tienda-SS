import assert from 'node:assert/strict';
import test from 'node:test';
import { roleFor } from '../scripts/migrate-user-roles';

test('mapea roles legacy a los roles nuevos esperados', () => {
  const cases = [
    ['jefe', 'gerente'],
    ['Jefe', 'gerente'],
    ['supervisor', 'supervisor_sucursal'],
    ['Supervisor de Sucursal', 'supervisor_sucursal'],
    ['administrador', 'admin'],
    ['manager', 'gerente'],
    ['propietario', 'owner'],
    ['comprador', 'compras'],
    ['lectura', 'solo_lectura'],
    ['readonly', 'solo_lectura'],
  ] as const;

  for (const [legacyRole, expectedRole] of cases) {
    const result = roleFor(legacyRole);
    assert.equal(result.role, expectedRole, `El rol ${legacyRole} debe mapear a ${expectedRole}`);
    assert.notEqual(result.reason, 'unknown_role_default');
  }
});

test('conserva los once roles nuevos sin modificación', () => {
  const newRoles = [
    'owner',
    'admin',
    'gerente',
    'supervisor_sucursal',
    'vendedor',
    'cajero',
    'bodega',
    'compras',
    'chofer',
    'despachador',
    'solo_lectura',
  ] as const;

  for (const role of newRoles) {
    assert.deepEqual(roleFor(role), { role, reason: 'already_valid_role' });
  }
});

test('asigna solo_lectura como valor seguro para roles vacíos o desconocidos', () => {
  assert.deepEqual(roleFor(''), { role: 'solo_lectura', reason: 'missing_role_default' });
  assert.deepEqual(roleFor(null), { role: 'solo_lectura', reason: 'missing_role_default' });
  assert.deepEqual(roleFor('superusuario_inexistente'), {
    role: 'solo_lectura',
    reason: 'unknown_role_default:superusuario_inexistente',
  });
});
