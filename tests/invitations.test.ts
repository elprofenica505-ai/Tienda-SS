import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAssignInvitationRole,
  canResendInvitation,
  createInvitationToken,
  hashInvitationToken,
  invitationExpiry,
  isInvitationExpired,
  isInvitationRole,
  normalizeInvitationEmail,
  INVITATION_RESEND_COOLDOWN_MS,
} from '@/lib/invitations';
import { getApiPolicy, isPublicApiRoute } from '@/lib/api-policy';

test('token de invitación tiene alta entropía y solo se persiste su hash', () => {
  const token = createInvitationToken();
  assert.ok(token.length >= 40);
  assert.notEqual(hashInvitationToken(token), token);
  assert.equal(hashInvitationToken(token), hashInvitationToken(token));
  assert.notEqual(hashInvitationToken(token), hashInvitationToken(createInvitationToken()));
});

test('invitación expira exactamente después del TTL y no acepta replay lógico', () => {
  const now = Date.now();
  const expiresAt = invitationExpiry(now);
  assert.equal(isInvitationExpired(expiresAt, now), false);
  assert.equal(isInvitationExpired(expiresAt, expiresAt.getTime()), true);
  assert.equal(isInvitationExpired(new Date(now - 1), now), true);
});

test('reenvío exige cooldown y permite reenviar cuando la ventana termina', () => {
  const now = Date.now();
  assert.equal(canResendInvitation(undefined, now), true);
  assert.equal(canResendInvitation(new Date(now - INVITATION_RESEND_COOLDOWN_MS + 1), now), false);
  assert.equal(canResendInvitation(new Date(now - INVITATION_RESEND_COOLDOWN_MS), now), true);
});

test('normaliza email y limita roles a los roles asignables', () => {
  assert.equal(normalizeInvitationEmail('  Persona@Example.COM  '), 'persona@example.com');
  assert.equal(normalizeInvitationEmail('x'.repeat(300)).length, 160);
  assert.equal(isInvitationRole('vendedor'), true);
  assert.equal(isInvitationRole('owner'), false);
  assert.equal(isInvitationRole('superadmin'), false);
  assert.equal(canAssignInvitationRole('admin', 'jefe'), true);
  assert.equal(canAssignInvitationRole('admin', 'admin'), false);
  assert.equal(canAssignInvitationRole('gerente', 'vendedor'), true);
  assert.equal(canAssignInvitationRole('gerente', 'admin'), false);
  assert.equal(canAssignInvitationRole('vendedor', 'cajero'), false);
});

test('política de invitaciones protege la gestión y publica solo aceptación/consulta', () => {
  assert.deepEqual(getApiPolicy('/api/invitations', 'GET'), { module: 'members', action: 'view' });
  assert.deepEqual(getApiPolicy('/api/invitations', 'POST'), { module: 'members', action: 'create' });
  assert.deepEqual(getApiPolicy('/api/invitations', 'DELETE'), { module: 'members', action: 'delete' });
  assert.equal(isPublicApiRoute('/api/invitations/accept', 'GET'), true);
  assert.equal(isPublicApiRoute('/api/invitations/accept', 'POST'), true);
  assert.equal(isPublicApiRoute('/api/invitations', 'POST'), false);
});
