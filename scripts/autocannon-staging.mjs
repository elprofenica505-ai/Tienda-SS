import autocannon from 'autocannon';

const baseUrl = process.env.LOAD_BASE_URL || 'http://127.0.0.1:3000';
const target = process.env.LOAD_TEST_TARGET || '';
const duration = Number(process.env.LOAD_DURATION_SECONDS || 15);
const scenarioName = process.env.LOAD_SCENARIO || 'medium';
const tenantIds = (process.env.LOAD_TENANT_IDS || '').split(',').map((value) => value.trim()).filter(Boolean);
const tokens = (process.env.LOAD_TOKENS || '').split(',').map((value) => value.trim()).filter(Boolean);
const scenarios = {
  low: { connections: 25 },
  medium: { connections: 100 },
  high: { connections: 250 },
  stress: { connections: 500 },
};
const scenario = scenarios[scenarioName];
const endpoints = [
  { name: 'catalog', path: '/api/catalog?limit=50', weight: 30 },
  { name: 'inventory', path: '/api/inventory?products=true&limit=50', weight: 25 },
  { name: 'contacts', path: '/api/contacts?type=customer&limit=50', weight: 20 },
  { name: 'sales', path: '/api/sales?limit=50', weight: 15 },
  { name: 'health', path: '/api/health', weight: 10 },
];

if (target !== 'staging') throw new Error('Refusing to run: set LOAD_TEST_TARGET=staging explicitly.');
if (!scenario) throw new Error(`Unknown LOAD_SCENARIO: ${scenarioName}`);
if (!tenantIds.length) throw new Error('Provide comma-separated LOAD_TENANT_IDS for test tenants.');
if (tokens.length !== tenantIds.length) throw new Error('LOAD_TOKENS must contain one test token per tenant ID.');
const parsed = new URL(baseUrl);
if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
  // Local testing is allowed only with the explicit staging marker above.
} else if (!/(staging|preview|dev|test)/i.test(parsed.hostname)) {
  throw new Error(`Refusing target hostname ${parsed.hostname}; use a staging/preview host.`);
}

const totalWeight = endpoints.reduce((sum, endpoint) => sum + endpoint.weight, 0);
const connectionsPerTenant = Math.max(1, Math.floor(scenario.connections / tenantIds.length));

function runOne(tenantId, token, endpoint, connections) {
  return new Promise((resolve, reject) => {
    autocannon({
      url: `${baseUrl}${endpoint.path}`,
      duration,
      connections,
      pipelining: 1,
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': tenantId,
        accept: 'application/json',
      },
      bailout: false,
    }, (error, result) => {
      if (error) return reject(error);
      resolve({ tenantId, endpoint: endpoint.name, weight: endpoint.weight / totalWeight, result });
    });
  });
}

const jobs = [];
for (let tenantIndex = 0; tenantIndex < tenantIds.length; tenantIndex += 1) {
  for (const endpoint of endpoints) {
    const endpointConnections = Math.max(1, Math.round((connectionsPerTenant * endpoint.weight) / totalWeight * totalWeight));
    jobs.push(runOne(tenantIds[tenantIndex], tokens[tenantIndex], endpoint, endpointConnections));
  }
}
const results = await Promise.all(jobs);
const aggregate = results.map(({ tenantId, endpoint, weight, result }) => ({
  tenantId,
  endpoint,
  weight,
  requests: result.requests.total,
  errors: result.errors,
  timeouts: result.timeouts,
  non2xx: result.non2xx,
  p50Ms: result.latency.p50,
  p95Ms: result.latency.p95,
  p99Ms: result.latency.p99,
  maxMs: result.latency.max,
  throughputPerSec: Number(result.requests.average.toFixed(2)),
}));
const totals = aggregate.reduce((sum, row) => ({ requests: sum.requests + row.requests, errors: sum.errors + row.errors, timeouts: sum.timeouts + row.timeouts, non2xx: sum.non2xx + row.non2xx }), { requests: 0, errors: 0, timeouts: 0, non2xx: 0 });
const weightedP95 = aggregate.reduce((sum, row) => sum + (row.p95Ms * row.weight), 0) / tenantIds.length;
const errorRate = (totals.errors + totals.timeouts + totals.non2xx) / Math.max(totals.requests, 1);
const summary = {
  baseUrl,
  target,
  scenario: scenarioName,
  durationSeconds: duration,
  tenantCount: tenantIds.length,
  configuredConnections: scenario.connections,
  connectionsPerTenant,
  totals: { ...totals, errorRate: Number(errorRate.toFixed(5)) },
  weightedP95Ms: Math.round(weightedP95),
  thresholds: { maxWeightedP95Ms: 800, maxErrorRate: 0.005 },
  passed: weightedP95 <= 800 && errorRate <= 0.005,
  byTenantAndEndpoint: aggregate,
};
console.log(JSON.stringify(summary, null, 2));
if (!summary.passed) process.exitCode = 1;
