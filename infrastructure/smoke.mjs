#!/usr/bin/env node
/**
 * AI Zone smoke + load probe (spec §15 performance testing, §16 deploy checks).
 * No dependencies. Usage:
 *   BASE_URL=http://localhost:4000 node infrastructure/smoke.mjs
 *   LOAD_REQUESTS=100 LOAD_CONCURRENCY=10 BASE_URL=... node infrastructure/smoke.mjs
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:4000';
const argv = process.argv.slice(2);
function argValue(flag, fallback) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
}
const REQUESTS = argValue('--requests', Number(process.env.LOAD_REQUESTS ?? 30));
const CONCURRENCY = argValue('--concurrency', Number(process.env.LOAD_CONCURRENCY ?? 5));

const email = `smoke-${Date.now()}@example.com`;
const password = 'smoke-load-test-123';

async function api(path, opts = {}, token = null) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function main() {
  // 1. Health
  const health = await api('/health');
  check('health', health.status === 200 && health.body.db === 'up', JSON.stringify(health.body));

  // 2. Register + auth
  const reg = await api('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName: 'Load Smoke' }),
  });
  check('register', reg.status === 201 && Boolean(reg.body.token), `status ${reg.status}`);
  const token = reg.body.token;
  if (!token) process.exit(1);

  // 3. Model catalog
  const models = await api('/api/v1/models', {}, token);
  check('models', models.status === 200 && models.body.models.length > 0, `${models.body.models?.length ?? 0} models`);

  // 4. Agents catalog
  const agents = await api('/api/v1/agents');
  check('agents', agents.status === 200 && agents.body.agents.length > 0, `${agents.body.agents?.length ?? 0} agents`);

  // 5. Conversation create
  const conv = await api('/api/v1/conversations', { method: 'POST', body: JSON.stringify({}) }, token);
  check('conversation create', conv.status === 201, `status ${conv.status}`);

  // 6. Concurrent latency probe on an authenticated, DB-touching endpoint
  console.log(`\nload probe: ${REQUESTS} requests, concurrency ${CONCURRENCY} (GET /models)`);
  const latencies = [];
  let errors = 0;
  const queue = Array.from({ length: REQUESTS }, (_, i) => i);
  const started = Date.now();

  async function worker() {
    for (;;) {
      const i = queue.shift();
      if (i === undefined) return;
      const t0 = performance.now();
      try {
        const r = await api('/api/v1/models', {}, token);
        if (r.status !== 200) errors += 1;
      } catch {
        errors += 1;
      }
      latencies.push(performance.now() - t0);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const wall = Date.now() - started;

  latencies.sort((a, b) => a - b);
  const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))].toFixed(0);
  console.log(`  requests : ${latencies.length}  errors: ${errors}`);
  console.log(`  wall     : ${wall}ms  throughput: ${((latencies.length / wall) * 1000).toFixed(0)} req/s`);
  console.log(`  p50/p95/p99: ${pct(50)}ms / ${pct(95)}ms / ${pct(99)}ms`);

  check('load probe', errors === 0, `${errors} errors`);

  console.log(failures === 0 ? '\nSMOKE PASS' : `\nSMOKE FAIL (${failures} failures)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('smoke crashed:', err);
  process.exit(1);
});
