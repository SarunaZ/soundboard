import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const base = process.env.API_BASE ?? 'http://gateway:4000';
const token = process.env.EDITOR_TOKEN ?? 'local-editor-test-only-placeholder';
const graphqlUrl = process.env.GRAPHQL_URL ?? `${base}/graphql`;
const dbReadUrl = process.env.IMLI_READ_ENDPOINT ?? `${base}/api/get-cheeks?page=1&limit=10`;
const loadConcurrency = Number(process.env.LOAD_CONCURRENCY ?? 4);
const safeguardsEnabled = process.env.SAFEGUARDS === '1';
const soakSeconds = Number(process.env.SOAK_SECONDS ?? 300);

const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  environment: {
    apiBase: base,
    fixture: 'local synthetic AAC generated with ffmpeg; fake yt-dlp has no network access',
    nearLimitSourceDurationSeconds: 1199,
    nearLimitSourceMaximumBytes: 32 * 1024 * 1024,
    exactBoundaryFixture: '3-second PCM16 WAV padded to exactly 32 MiB; duration and size limits are separate checks',
    loadConcurrency,
    safeguardsEnabled,
    soakSeconds: safeguardsEnabled ? soakSeconds : null,
  },
  checks: [],
  timings: [],
  memorySamples: [],
  caveats: [
    'Sources are deterministic local fixtures, not YouTube media.',
    'The exact 32 MiB boundary fixture is a three-second PCM16 WAV padded with trailing zero bytes; the 1199-second AAC source and 60-second render are separate checks.',
    'This local run does not establish production capacity or production memory headroom.',
    'Memory samples are collected by the host runner when available; the harness process itself is not counted as application memory.',
  ],
};

const assertCheck = (name, condition, detail = '') => {
  report.checks.push({ name, passed: Boolean(condition), ...(detail ? { detail } : {}) });
  if (!condition) throw new Error(`${name} failed${detail ? `: ${detail}` : ''}`);
};

const percentile = (sorted, fraction) => sorted.length
  ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
  : null;

function summarizeTimings() {
  const groups = new Map();
  for (const row of report.timings) {
    const group = groups.get(row.operation) ?? [];
    group.push(row);
    groups.set(row.operation, group);
  }
  return [...groups].map(([operation, rows]) => {
    const values = rows.map(row => row.durationMs).sort((a, b) => a - b);
    return {
      operation,
      count: rows.length,
      failures: rows.filter(row => !row.ok).length,
      p50Ms: percentile(values, 0.5),
      p95Ms: percentile(values, 0.95),
      maxMs: values.at(-1) ?? null,
    };
  });
}

async function timed(operation, fn) {
  const start = performance.now();
  try {
    const result = await fn();
    const durationMs = Number((performance.now() - start).toFixed(2));
    report.timings.push({ operation, durationMs, ok: true });
    return result;
  } catch (error) {
    const durationMs = Number((performance.now() - start).toFixed(2));
    report.timings.push({ operation, durationMs, ok: false, error: String(error?.message ?? error) });
    throw error;
  }
}

function fetchBounded(url, init = {}) {
  return fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(15_000) });
}

const authHeaders = { Authorization: `Bearer ${token}` };
const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };

async function requestJson(operation, url, init, expectedStatus) {
  return timed(operation, async () => {
    const response = await fetchBounded(url, init);
    if (response.status !== expectedStatus) {
      const body = await response.text();
      throw new Error(`expected HTTP ${expectedStatus}, got ${response.status}: ${body.slice(0, 300)}`);
    }
    return { response, body: await response.json() };
  });
}

async function waitForState(id, state, timeoutMs = 180_000) {
  const started = performance.now();
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    const result = await requestJson(`editor-poll-${state}`, `${base}/editor/sessions/${id}`, { headers: authHeaders }, 200);
    last = result.body;
    if (last.state === state) {
      report.timings.push({ operation: `editor-${state}-ready`, durationMs: Number((performance.now() - started).toFixed(2)), ok: true });
      return last;
    }
    if (last.state === 'failed') throw new Error(`fixture pipeline failed: ${last.error}`);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`timed out waiting for state=${state}; last=${JSON.stringify(last)}`);
}

async function createSession(videoId, label) {
  const result = await requestJson(`editor-create-${label}`, `${base}/editor/sessions`, {
    method: 'POST', headers: jsonHeaders,
    body: JSON.stringify({ url: `https://youtu.be/${videoId}` }),
  }, 202);
  assertCheck(`editor create accepted (${label})`, result.body.state === 'queued', `state=${result.body.state}`);
  return result.body;
}

async function loadRead(operation) {
  const result = await requestJson(operation, graphqlUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'query SharedContainerIntrospection { __typename }' }),
  }, 200);
  assertCheck('GraphQL read-only introspection', result.body?.data?.__typename === 'Query', JSON.stringify(result.body).slice(0, 180));

  const read = await requestJson('imli-db-backed-read', dbReadUrl, { headers: { Accept: 'application/json' } }, 200);
  assertCheck('Imli read-only DB route', read.body?.status === 'success' && Array.isArray(read.body?.data), JSON.stringify(read.body).slice(0, 180));
  assertCheck('Imli fixture rows visible', read.body.data.length === 10, `returned ${read.body.data.length} rows`);
}

async function runConcurrentLoad(scenario) {
  const started = Date.now();
  let stopping = false;
  let loadFailure;
  const workers = Array.from({ length: loadConcurrency }, (_, worker) => (async () => {
    let sequence = 0;
    while (!stopping) {
      await timed('load-health', async () => {
        const response = await fetchBounded(`${base}/health`);
        if (!response.ok) throw new Error(`health returned ${response.status}`);
        const body = await response.json();
        if (body.healthy !== true) throw new Error(`unexpected Imli health body ${JSON.stringify(body)}`);
      });
      if (safeguardsEnabled) {
        await timed('load-live', async () => {
          const response = await fetchBounded(`${base}/__shared/live`);
          const body = await response.json();
          if (!response.ok || body.alive !== true) throw new Error(`live returned ${response.status}: ${JSON.stringify(body)}`);
        });
        await timed('load-ready', async () => {
          const response = await fetchBounded(`${base}/__shared/ready`);
          const body = await response.json();
          if (!response.ok || body.ready !== true) throw new Error(`ready returned ${response.status}: ${JSON.stringify(body)}`);
        });
      }
      const op = sequence++ % 2 === 0 ? 'load-graphql' : 'load-imli-db-read';
      if (op === 'load-graphql') {
        await timed(op, async () => {
          const response = await fetchBounded(graphqlUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'query SharedContainerLoadRead { __typename }' }),
          });
          if (!response.ok) throw new Error(`GraphQL returned ${response.status}`);
          const body = await response.json();
          if (body?.data?.__typename !== 'Query' || body.errors?.length) throw new Error(JSON.stringify(body));
        });
      } else {
        await timed(op, async () => {
          const response = await fetchBounded(dbReadUrl, { headers: { Accept: 'application/json' } });
          if (!response.ok) throw new Error(`Imli read returned ${response.status}`);
          const body = await response.json();
          if (body?.status !== 'success' || !Array.isArray(body?.data)) throw new Error(JSON.stringify(body));
        });
      }
      await new Promise(resolve => setTimeout(resolve, 100 + worker * 15));
    }
  })().catch(error => {
    loadFailure = error;
    stopping = true;
  }));
  report.load = { concurrency: loadConcurrency, mode: safeguardsEnabled ? `sustained mixed API load during ${soakSeconds}-second render soak` : 'load remains active through the near-limit fetch and 60-second ffmpeg render', startedAt: new Date(started).toISOString() };
  try {
    await scenario();
  } finally {
    stopping = true;
    await Promise.all(workers);
    report.load.completedDurationMs = Date.now() - started;
    report.load.endedAt = new Date().toISOString();
  }
  if (loadFailure) throw loadFailure;
}

let failure;
try {
  const health = await requestJson('health', `${base}/health`, {}, 200);
  assertCheck('Imli gateway health', health.body?.healthy === true, JSON.stringify(health.body));
  if (safeguardsEnabled) {
    const live = await requestJson('shared-live', `${base}/__shared/live`, {}, 200);
    assertCheck('shared gateway liveness is safe JSON', live.body?.alive === true && Object.keys(live.body).length === 1, JSON.stringify(live.body));
    const ready = await requestJson('shared-ready', `${base}/__shared/ready`, {}, 200);
    const readinessText = JSON.stringify(ready.body);
    const readinessChecks = ready.body?.checks;
    assertCheck('shared readiness is safe JSON without token material', ready.body?.ready === true
      && readinessChecks && Object.keys(readinessChecks).length >= 5
      && Object.values(readinessChecks).every(value => typeof value === 'boolean')
      && !readinessText.includes(token), readinessText);
  }
  await loadRead('graphql-introspection');

  const unauthorized = await timed('editor-unauthorized', () => fetchBounded(`${base}/editor/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://youtu.be/aB_cD-12345' }),
  }));
  assertCheck('editor auth rejects missing token', unauthorized.status === 401, `status=${unauthorized.status}`);

  const malformed = await timed('editor-malformed', () => fetchBounded(`${base}/editor/sessions`, {
    method: 'POST', headers: jsonHeaders, body: '{',
  }));
  assertCheck('malformed JSON rejected', malformed.status === 400, `status=${malformed.status}`);

  const short = await createSession('aB_cD-12345', 'short');
  const shortReady = await waitForState(short.id, 'ready');
  assertCheck('short fixture ready', shortReady.durationMs === 3000, `durationMs=${shortReady.durationMs}`);
  const preview = await timed('preview-range-32-bytes', async () => {
    const response = await fetchBounded(`${base}${shortReady.previewPath}`, { headers: { ...authHeaders, Range: 'bytes=0-31' } });
    return { status: response.status, bytes: (await response.arrayBuffer()).byteLength };
  });
  assertCheck('preview supports HTTP Range', preview.status === 206 && preview.bytes === 32, `status=${preview.status}, bytes=${preview.bytes}`);

  const tooShort = await timed('render-reject-99ms', () => fetchBounded(`${base}/editor/sessions/${short.id}/render`, {
    method: 'POST', headers: jsonHeaders, body: JSON.stringify({ startMs: 0, endMs: 99 }),
  }));
  assertCheck('render rejects below 100 ms', tooShort.status === 400, `status=${tooShort.status}`);
  const minRange = await requestJson('render-accept-100ms', `${base}/editor/sessions/${short.id}/render`, {
    method: 'POST', headers: jsonHeaders, body: JSON.stringify({ startMs: 0, endMs: 100 }),
  }, 202);
  assertCheck('render accepts 100 ms minimum', minRange.body.state === 'rendering', `state=${minRange.body.state}`);
  await waitForState(short.id, 'rendered');
  const shortDelete = await timed('editor-delete-short', () => fetchBounded(`${base}/editor/sessions/${short.id}`, { method: 'DELETE', headers: authHeaders }));
  assertCheck('short session delete accepted', shortDelete.status === 204, `status=${shortDelete.status}`);
  const shortGone = await timed('editor-get-after-delete', () => fetchBounded(`${base}/editor/sessions/${short.id}`, { headers: authHeaders }));
  assertCheck('deleted session returns 404', shortGone.status === 404, `status=${shortGone.status}`);

  const long = await createSession('bC_dE-1199x', '1199-second-near-limit');
  const repeatedShorts = [];
  for (let i = 0; i < 3; i++) repeatedShorts.push(await createSession('aB_cD-12345', `repeat-${i + 1}`));
  let longReady;
  let rendered;
  await runConcurrentLoad(async () => {
    longReady = await waitForState(long.id, 'ready', 240_000);
    assertCheck('near-limit source duration stays under 20 minutes', longReady.durationMs > 1_198_000 && longReady.durationMs <= 1_200_000, `durationMs=${longReady.durationMs}`);
    const overMax = await timed('render-reject-60001ms', () => fetchBounded(`${base}/editor/sessions/${long.id}/render`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ startMs: 0, endMs: 60_001 }),
    }));
    assertCheck('render rejects over 60 seconds', overMax.status === 400, `status=${overMax.status}`);
    const maxRange = await requestJson('render-accept-60000ms', `${base}/editor/sessions/${long.id}/render`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ startMs: 0, endMs: 60_000 }),
    }, 202);
    assertCheck('render accepts exactly 60 seconds', maxRange.body.state === 'rendering', `state=${maxRange.body.state}`);
    rendered = await waitForState(long.id, 'rendered', 120_000);
    assertCheck('real ffmpeg produced 60 second render', rendered.clipPath !== null && rendered.state === 'rendered', `state=${rendered.state}`);
    const renderedClip = await timed('rendered-clip-fetch', async () => {
      const response = await fetchBounded(`${base}${rendered.clipPath}`, { headers: authHeaders });
      return { status: response.status, contentType: response.headers.get('content-type') ?? '', bytes: (await response.arrayBuffer()).byteLength };
    });
    assertCheck('rendered clip is served as audio/mp4', renderedClip.status === 200 && /audio\/mp4/.test(renderedClip.contentType) && renderedClip.bytes > 0, `status=${renderedClip.status}, bytes=${renderedClip.bytes}`);
    for (let i = 0; i < repeatedShorts.length; i++) {
      const session = repeatedShorts[i];
      const ready = await waitForState(session.id, 'ready');
      const queuedRender = await requestJson(`repeat-render-${i + 1}`, `${base}/editor/sessions/${session.id}/render`, {
        method: 'POST', headers: jsonHeaders, body: JSON.stringify({ startMs: 500, endMs: 2_000 }),
      }, 202);
      assertCheck(`repeat short render queued ${i + 1}`, queuedRender.body.state === 'rendering', `state=${queuedRender.body.state}`);
      await waitForState(session.id, 'rendered');
      const removed = await timed(`repeat-cleanup-${i + 1}`, () => fetchBounded(`${base}/editor/sessions/${session.id}`, { method: 'DELETE', headers: authHeaders }));
      assertCheck(`repeat short cleanup ${i + 1}`, removed.status === 204, `status=${removed.status}; source=${ready.durationMs}ms`);
    }
  });

  const longDelete = await timed('editor-delete-long', () => fetchBounded(`${base}/editor/sessions/${long.id}`, { method: 'DELETE', headers: authHeaders }));
  assertCheck('near-limit session cleanup accepted', longDelete.status === 204, `status=${longDelete.status}`);
  const longGone = await timed('editor-get-after-cleanup', () => fetchBounded(`${base}/editor/sessions/${long.id}`, { headers: authHeaders }));
  assertCheck('cleaned session returns 404', longGone.status === 404, `status=${longGone.status}`);

  if (safeguardsEnabled) {
    const exact = await createSession('exact32MiBx', 'exact-32-mib');
    const exactReady = await waitForState(exact.id, 'ready', 180_000);
    assertCheck('exact 32 MiB source reaches ready', exactReady.durationMs === 3000, `durationMs=${exactReady.durationMs}`);
    const exactPreview = await timed('exact-boundary-preview-range', async () => {
      const response = await fetchBounded(`${base}${exactReady.previewPath}`, { headers: { ...authHeaders, Range: 'bytes=0-31' } });
      return { status: response.status, bytes: (await response.arrayBuffer()).byteLength };
    });
    assertCheck('exact-boundary source produces ranged preview', exactPreview.status === 206 && exactPreview.bytes === 32, `status=${exactPreview.status}, bytes=${exactPreview.bytes}`);
    report.safeguards = { exactSourceSessionId: exact.id, exactSourceBytes: 32 * 1024 * 1024 };

    const oversized = await createSession('over32MiBx1', 'over-32-mib');
    const oversizedFailed = await waitForState(oversized.id, 'failed', 90_000);
    assertCheck('source one byte over 32 MiB is rejected with the byte-limit error', oversizedFailed.state === 'failed'
      && typeof oversizedFailed.error === 'string'
      && oversizedFailed.error.includes('larger than the 32 MB limit'), `state=${oversizedFailed.state}; error=${oversizedFailed.error}`);
    assertCheck('oversized source produces no preview', oversizedFailed.previewPath === null, `previewPath=${oversizedFailed.previewPath}`);
    const oversizedPreview = await timed('oversized-preview-not-found', () => fetchBounded(`${base}/editor/sessions/${oversized.id}/preview`, { headers: authHeaders }));
    assertCheck('oversized source preview endpoint returns 404', oversizedPreview.status === 404, `status=${oversizedPreview.status}`);
    const oversizedDelete = await timed('oversized-session-cleanup', () => fetchBounded(`${base}/editor/sessions/${oversized.id}`, { method: 'DELETE', headers: authHeaders }));
    assertCheck('oversized fixture session cleanup accepted', oversizedDelete.status === 204, `status=${oversizedDelete.status}`);

    const soakSessions = [];
    for (let i = 0; i < 3; i++) soakSessions.push(await createSession('aB_cD-12345', `soak-${i + 1}`));
    await runConcurrentLoad(async () => {
      const readySessions = [];
      for (const session of soakSessions) readySessions.push(await waitForState(session.id, 'ready'));
      const endAt = Date.now() + soakSeconds * 1000;
      let cycle = 0;
      while (Date.now() < endAt) {
        const sessions = soakSessions.map((session, index) => ({ session, index }));
        for (const { session, index } of sessions) {
          const queued = await requestJson(`soak-render-queue-${cycle + 1}-${index + 1}`, `${base}/editor/sessions/${session.id}/render`, {
            method: 'POST', headers: jsonHeaders, body: JSON.stringify({ startMs: 500, endMs: 2_000 }),
          }, 202);
          assertCheck(`soak render queued cycle ${cycle + 1} job ${index + 1}`, queued.body.state === 'rendering', `state=${queued.body.state}`);
        }
        for (const { session } of sessions) await waitForState(session.id, 'rendered', 90_000);
        cycle++;
      }
      report.soak = { requestedSeconds: soakSeconds, elapsedSeconds: Number(((Date.now() - (endAt - soakSeconds * 1000)) / 1000).toFixed(2)), renderCycles: cycle, queuedRenderJobs: cycle * soakSessions.length, sourceSessionIds: soakSessions.map(session => session.id) };
      for (const session of soakSessions) {
        const removed = await timed('soak-session-cleanup', () => fetchBounded(`${base}/editor/sessions/${session.id}`, { method: 'DELETE', headers: authHeaders }));
        assertCheck('soak session cleanup accepted', removed.status === 204, `status=${removed.status}`);
      }
    });
    const recovery = await createSession('aB_cD-12345', 'post-oversize-recovery');
    const recoveryReady = await waitForState(recovery.id, 'ready');
    assertCheck('worker accepts a normal job after oversized source rejection', recoveryReady.durationMs === 3000, `durationMs=${recoveryReady.durationMs}`);
    const recoveryDelete = await timed('recovery-session-cleanup', () => fetchBounded(`${base}/editor/sessions/${recovery.id}`, { method: 'DELETE', headers: authHeaders }));
    assertCheck('recovery session cleanup accepted', recoveryDelete.status === 204, `status=${recoveryDelete.status}`);
  }
} catch (error) {
  failure = error;
  report.failure = String(error?.stack ?? error);
} finally {
  report.finishedAt = new Date().toISOString();
  report.passed = !failure && report.checks.every(check => check.passed) && report.timings.every(timing => timing.ok);
  report.timingSummary = summarizeTimings();
  report.latencyFailures = report.timings.filter(row => !row.ok).length;
  report.checkFailures = report.checks.filter(check => !check.passed).length;
  const serialized = JSON.stringify(report, null, 2);
  try { await writeFile('/tmp/shared-container-report.json', serialized); } catch { /* stdout still carries the complete report */ }
  console.log(`REPORT_JSON=${JSON.stringify(report)}`);
  console.log(`Shared container integration ${report.passed ? 'passed' : 'failed'}; ${report.checks.length} assertions; ${report.timings.length} timed operations; ${report.latencyFailures} latency failures.`);
}

if (failure || !report.passed) process.exitCode = 1;
