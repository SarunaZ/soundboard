import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createReadinessMonitor } from './health.mjs';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

async function close(server) {
  if (!server.listening) return;
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
}

test('readiness validates API database health and combines bounded service and worker checks', async () => {
  let imliHits = 0;
  let apiHits = 0;
  let apiBody = JSON.stringify({ ok: true, db: { journalMode: 'wal', path: '/secret' } });
  const imli = http.createServer((_request, response) => { imliHits++; response.end(JSON.stringify({ healthy: true })); });
  const api = http.createServer((_request, response) => { apiHits++; response.end(apiBody); });
  const imliPort = await listen(imli);
  const apiPort = await listen(api);
  let worker = true;
  let stopping = false;
  const monitor = createReadinessMonitor({ imliPort, apiPort, workerHealthy: () => worker, editorTokenConfigured: true, isStopping: () => stopping });
  try {
    const [ready, sameA, sameB] = await Promise.all([monitor.getReadiness(), monitor.getReadiness(), monitor.getReadiness()]);
    assert.deepEqual(ready, { ready: true, checks: { imli: true, api: true, worker: true, editorToken: true, running: true } });
    assert.equal(sameA.ready, true);
    assert.equal(sameB.ready, true);
    const [cachedA, cachedB] = await Promise.all([monitor.getReadiness(), monitor.getReadiness()]);
    assert.equal(cachedA.ready, true);
    assert.equal(cachedB.ready, true);
    assert.equal(imliHits, 1);
    assert.equal(apiHits, 1);
    stopping = true;
    const stoppingResult = await monitor.getReadiness();
    assert.equal(stoppingResult.ready, false);
    assert.equal(stoppingResult.checks.running, false);
    stopping = false;
    worker = false;
    apiBody = JSON.stringify({ ok: true, db: { journalMode: '' } });
    await new Promise(resolve => setTimeout(resolve, 1_010));
    const unready = await monitor.getReadiness();
    assert.equal(unready.ready, false);
    assert.deepEqual(unready.checks, { imli: true, api: false, worker: false, editorToken: true, running: true });
  } finally {
    await close(imli);
    await close(api);
  }
});

test('readiness uses an absolute deadline for slow responses and rejects oversized bodies', async () => {
  const imli = http.createServer((_request, response) => {
    response.writeHead(200);
    const drip = setInterval(() => response.write('x'.repeat(10)), 100);
    response.once('close', () => clearInterval(drip));
  });
  const api = http.createServer((_request, response) => response.end('x'.repeat(1_100)));
  const imliPort = await listen(imli);
  const apiPort = await listen(api);
  const monitor = createReadinessMonitor({ imliPort, apiPort, workerHealthy: () => true, editorTokenConfigured: true });
  try {
    const startedAt = Date.now();
    const result = await monitor.getReadiness();
    assert.equal(result.ready, false);
    assert.equal(result.checks.imli, false);
    assert.equal(result.checks.api, false);
    assert.ok(Date.now() - startedAt < 1_500);
  } finally {
    await close(imli);
    await close(api);
  }
});
