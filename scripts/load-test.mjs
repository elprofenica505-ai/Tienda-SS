const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3000';
const total = Number(process.env.LOAD_REQUESTS || 120);
const concurrency = Number(process.env.LOAD_CONCURRENCY || 20);
const results = [];
let next = 0;
async function worker() {
  while (true) {
    const index = next++;
    if (index >= total) return;
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}/api/health`, { cache: 'no-store' });
      results[index] = { status: response.status, durationMs: Math.round(performance.now() - started) };
    } catch (error) {
      results[index] = { status: 0, durationMs: Math.round(performance.now() - started), error: String(error) };
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
const durations = results.map((item) => item.durationMs).sort((a, b) => a - b);
const ok = results.filter((item) => item.status === 200).length;
const percentile = (value) => durations[Math.min(durations.length - 1, Math.floor(durations.length * value))] || 0;
const summary = { baseUrl, total, concurrency, ok, failed: total - ok, p50Ms: percentile(.5), p95Ms: percentile(.95), maxMs: durations.at(-1) || 0, threshold: { minSuccessRate: .99, maxP95Ms: 1000 }, passed: ok / total >= .99 && percentile(.95) <= 1000 };
console.log(JSON.stringify(summary, null, 2));
if (!summary.passed) process.exitCode = 1;
