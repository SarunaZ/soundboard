import http from 'node:http';

const PROBE_TIMEOUT_MS = 1_000;
const MAX_RESPONSE_BYTES = 1_024;
const CACHE_MS = 1_000;

function requestHealth(port, { validate = () => true } = {}) {
  return new Promise(resolve => {
    let settled = false;
    let bytes = 0;
    const chunks = [];
    let request;
    const deadline = setTimeout(() => {
      request?.destroy();
      finish(false);
    }, PROBE_TIMEOUT_MS);
    const finish = healthy => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(healthy);
    };
    request = http.get({ hostname: '127.0.0.1', port, path: '/health', agent: false }, response => {
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE_BYTES) {
          request.destroy();
          finish(false);
          return;
        }
        chunks.push(chunk);
      });
      response.once('end', () => {
        if (response.statusCode !== 200) return finish(false);
        let body;
        try { body = Buffer.concat(chunks).toString('utf8'); } catch { return finish(false); }
        try { finish(validate(body)); } catch { finish(false); }
      });
      response.once('aborted', () => finish(false));
      response.once('error', () => finish(false));
    });
    request.setTimeout(PROBE_TIMEOUT_MS, () => request.destroy());
    request.once('error', () => finish(false));
  });
}

function imliHealthIsValid(body) {
  return JSON.parse(body)?.healthy === true;
}

function apiHealthIsValid(body) {
  const value = JSON.parse(body);
  return value?.ok === true && String(value?.db?.journalMode ?? '').toLowerCase() === 'wal';
}

export function createReadinessMonitor({
  imliPort = 4001,
  apiPort = 8080,
  workerHealthy = () => false,
  editorTokenConfigured = false,
  isStopping = () => false,
  log = () => undefined,
} = {}) {
  let probesCachedAt = 0;
  let probesCached;
  let probesInFlight;
  let previous;

  const getProbes = () => {
    if (probesInFlight) return probesInFlight;
    if (probesCached && Date.now() - probesCachedAt < CACHE_MS) return Promise.resolve(probesCached);
    probesInFlight = Promise.all([
      requestHealth(imliPort, { validate: imliHealthIsValid }),
      requestHealth(apiPort, { validate: apiHealthIsValid }),
    ]).then(([imli, api]) => {
      probesCached = { imli, api };
      probesCachedAt = Date.now();
      return probesCached;
    }).finally(() => { probesInFlight = undefined; });
    return probesInFlight;
  };

  const check = async () => {
    const { imli, api } = await getProbes();
    const checks = {
      imli,
      api,
      worker: Boolean(workerHealthy()),
      editorToken: editorTokenConfigured,
      running: !isStopping(),
    };
    if (previous) {
      for (const [role, healthy] of Object.entries(checks)) {
        if (previous[role] !== healthy) {
          log(`[supervisor] ${role === 'editorToken' ? 'editor token' : role} readiness ${healthy ? 'restored' : 'lost'}`);
        }
      }
    }
    previous = checks;
    return { ready: Object.values(checks).every(Boolean), checks };
  };

  return {
    getReadiness() {
      return check().catch(() => ({
        ready: false,
        checks: { imli: false, api: false, worker: false, editorToken: editorTokenConfigured, running: !isStopping() },
      }));
    },
  };
}
