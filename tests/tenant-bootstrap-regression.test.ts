import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const repository = readFileSync('lib/repositories/organization-repository.ts', 'utf8');
const css = readFileSync('app/globals.css', 'utf8');

test('bootstrap de tenant conserva onboarding y asignaciones de sucursal', () => {
  assert.match(repository, /tenants\(id,legacy_firestore_id,slug,name,status,timezone,currency,plan,onboarding_completed/);
  assert.match(repository, /member_branches\(branch_id,branches\(legacy_firestore_id\)\)/);
  assert.match(repository, /mapMember\(row as OrganizationRow, profile\.data as OrganizationRow/);
});

test('drawer móvil no reserva una pantalla vacía antes de abrirse', () => {
  assert.match(css, /\.workspace-sidebar \{ align-items: stretch; height: auto; max-height: none; min-height: 0;[^}]*width: 100%/);
  assert.match(css, /\.workspace-navigation \{ display: none; \}/);
  assert.match(css, /\.workspace-sidebar\.mobile-open \.workspace-navigation \{ display: block;/);
  assert.doesNotMatch(css, /\.workspace-sidebar \{ align-items: stretch; padding: 14px 8px; width: 88px;/);
});
