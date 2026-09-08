import assert from 'node:assert/strict';
import test from 'node:test';
import { auditIntegrityHash } from '@/lib/audit';
import { getApiPolicy } from '@/lib/api-policy';

test('el hash de auditoría es determinista y cambia con el estado', () => {
  const before = { stock: 10, status: 'completed' };
  const after = { stock: 8, status: 'completed' };
  assert.equal(auditIntegrityHash(before), auditIntegrityHash({ stock: 10, status: 'completed' }));
  assert.notEqual(auditIntegrityHash(before), auditIntegrityHash(after));
});

test('los flujos sensibles tienen política API registrada', () => {
  for (const path of [
    '/api/sales/returns',
    '/api/sales/void',
    '/api/receivables/credit-notes',
    '/api/inventory/reservations',
  ]) {
    assert.deepEqual(getApiPolicy(path, 'POST'), { module: path.includes('receivables') ? 'receivables' : path.includes('inventory') ? 'inventory' : 'sales', action: 'create' });
  }
});
