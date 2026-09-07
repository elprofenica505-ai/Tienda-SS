import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeDistributedRateLimits, consumeRateLimits, getClientAddress } from '@/lib/rate-limit';

process.env.RATE_LIMIT_SHARED = 'false';

const limits = { ip: 2, uid: 2, tenant: 2, endpoint: 2, composite: 2 } as const;

function dimensions(overrides: Record<string, string> = {}) {
  return { endpoint: `abuse-${Math.random().toString(36).slice(2)}`, ip: '198.51.100.10', uid: 'uid-a', tenantId: 'tenant-a', ...overrides };
}

test('anti-abuso: una IP no puede repartir intentos entre múltiples usuarios', () => {
  const endpoint = 'abuse-ip-isolation';
  const base = { endpoint, ip: '198.51.100.11', tenantId: 'tenant-a' };
  assert.equal(consumeRateLimits({ ...base, uid: 'uid-a' }, limits, 60_000).allowed, true);
  assert.equal(consumeRateLimits({ ...base, uid: 'uid-b' }, limits, 60_000).allowed, true);
  const blocked = consumeRateLimits({ ...base, uid: 'uid-c' }, limits, 60_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.blockedBy, 'ip');
});

test('anti-abuso: un UID no puede rotar IPs para superar su límite', () => {
  const endpoint = 'abuse-uid-isolation';
  assert.equal(consumeRateLimits({ endpoint, ip: '198.51.100.12', uid: 'uid-b', tenantId: 'tenant-b' }, limits, 60_000).allowed, true);
  assert.equal(consumeRateLimits({ endpoint, ip: '198.51.100.13', uid: 'uid-b', tenantId: 'tenant-b' }, limits, 60_000).allowed, true);
  const blocked = consumeRateLimits({ endpoint, ip: '198.51.100.14', uid: 'uid-b', tenantId: 'tenant-b' }, limits, 60_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.blockedBy, 'uid');
});

test('anti-abuso: un tenant comparte límite entre sus miembros', () => {
  const endpoint = 'abuse-tenant-isolation';
  assert.equal(consumeRateLimits({ endpoint, ip: '198.51.100.15', uid: 'uid-a', tenantId: 'tenant-c' }, limits, 60_000).allowed, true);
  assert.equal(consumeRateLimits({ endpoint, ip: '198.51.100.16', uid: 'uid-b', tenantId: 'tenant-c' }, limits, 60_000).allowed, true);
  const blocked = consumeRateLimits({ endpoint, ip: '198.51.100.17', uid: 'uid-c', tenantId: 'tenant-c' }, limits, 60_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.blockedBy, 'tenant');
});

test('anti-abuso: endpoint y combinación completa tienen límites propios', async () => {
  const endpoint = 'abuse-endpoint-isolation';
  const first = { endpoint, ip: '198.51.100.18', uid: 'uid-d', tenantId: 'tenant-d' };
  assert.equal((await consumeDistributedRateLimits(first, { endpoint: 1 }, 60_000)).allowed, true);
  const endpointBlocked = await consumeDistributedRateLimits({ ...first, ip: '198.51.100.19', uid: 'uid-e' }, { endpoint: 1 }, 60_000);
  assert.equal(endpointBlocked.allowed, false);
  assert.equal(endpointBlocked.blockedBy, 'endpoint');

  const compositeEndpoint = 'abuse-composite-isolation';
  const composite = { ...first, endpoint: compositeEndpoint };
  assert.equal(consumeRateLimits(composite, { composite: 1 }, 60_000).allowed, true);
  const compositeBlocked = consumeRateLimits(composite, { composite: 1 }, 60_000);
  assert.equal(compositeBlocked.allowed, false);
  assert.equal(compositeBlocked.blockedBy, 'composite');
});

test('anti-abuso: una ventana vencida reinicia el bucket sin heredar conteos', () => {
  const endpoint = 'abuse-window-reset';
  const dimensions = { endpoint, ip: '198.51.100.21', uid: 'uid-reset', tenantId: 'tenant-reset' };
  assert.equal(consumeRateLimits(dimensions, { composite: 1 }, 1_000, 10_000).allowed, true);
  assert.equal(consumeRateLimits(dimensions, { composite: 1 }, 1_000, 10_500).allowed, false);
  assert.equal(consumeRateLimits(dimensions, { composite: 1 }, 1_000, 11_001).allowed, true);
});

test('anti-abuso: cabeceras de IP no confiables se normalizan a unknown', () => {
  const request = new Request('https://example.test', { headers: { 'x-forwarded-for': 'attacker.example, 198.51.100.20' } });
  assert.equal(getClientAddress(request), 'unknown');
});
