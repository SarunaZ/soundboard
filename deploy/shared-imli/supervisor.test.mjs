import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSupervisor, defaultRoleSpecs, descendantPids } from './supervisor.mjs';

function healthRequest(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/__shared/ready`, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.once('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    }).once('error', reject);
  });
}

async function waitFor(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for health transition');
}

test('descendant scanner follows parent links across nested processes', () => {
  const snapshot = new Map([
    [10, { ppid: 1, pgid: 10, start: 'a' }],
    [11, { ppid: 10, pgid: 11, start: 'b' }],
    [12, { ppid: 11, pgid: 12, start: 'c' }],
    [20, { ppid: 1, pgid: 20, start: 'd' }],
  ]);
  assert.deepEqual([...descendantPids(10, snapshot)].sort(), [10, 11, 12]);
});

test('role environments isolate the editor token and Soundboard worker settings', () => {
  const sourceEnv = {
    EDITOR_TOKEN: 'synthetic-editor-secret',
    DB_PATH: '/data/soundboard.db',
    TEMP_DIR: '/var/tmp/soundboard',
    YTDLP_BIN: '/usr/local/bin/yt-dlp',
    NODE_DATABASE_URL: 'mongodb://synthetic-mongo/app',
    NODE_LOGIN_SECRET: 'synthetic-login-secret',
    NODE_APP_SETTING: 'retained-upstream-setting',
    NODE_OPTIONS: '--require synthetic-hook',
    YARN_CACHE_FOLDER: '/tmp/yarn-cache',
  };
  const originalEnv = { ...sourceEnv };
  const roles = Object.fromEntries(defaultRoleSpecs(sourceEnv).map(role => [role.name, role]));

  assert.equal(roles.api.env.EDITOR_TOKEN, 'synthetic-editor-secret');
  assert.equal(roles.worker.env.EDITOR_TOKEN, undefined);
  assert.equal(roles.imli.env.EDITOR_TOKEN, undefined);
  for (const name of ['DB_PATH', 'TEMP_DIR', 'YTDLP_BIN']) {
    assert.equal(roles.imli.env[name], undefined, `Imli must not receive ${name}`);
  }
  assert.equal(roles.imli.env.NODE_DATABASE_URL, 'mongodb://synthetic-mongo/app');
  assert.equal(roles.imli.env.NODE_LOGIN_SECRET, 'synthetic-login-secret');
  assert.equal(roles.imli.env.NODE_APP_SETTING, 'retained-upstream-setting');
  assert.equal(roles.imli.env.PORT, '4001');
  assert.equal(roles.worker.env.DB_PATH, '/data/soundboard.db');
  assert.equal(roles.worker.env.TEMP_DIR, '/var/tmp/soundboard');
  assert.equal(roles.worker.env.YTDLP_BIN, '/usr/local/bin/yt-dlp');
  for (const role of Object.values(roles)) {
    assert.equal(role.env.NODE_OPTIONS, undefined);
    assert.equal(role.env.YARN_CACHE_FOLDER, undefined);
  }
  assert.deepEqual(sourceEnv, originalEnv);
});

test('shutdown kills detached active tool groups even after their worker crashes', { skip: process.platform !== 'linux' }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'shared-imli-supervisor-'));
  const pidPath = path.join(directory, 'tool.pid');
  const inline = [
    'const {spawn}=require("node:child_process");',
    'const fs=require("node:fs");',
    'const tool=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{detached:true,stdio:"ignore"});',
    `fs.writeFileSync(${JSON.stringify(pidPath)},String(tool.pid));`,
    'setTimeout(()=>process.exit(19),900);',
  ].join('');
  let supervisor;
  try {
    supervisor = createSupervisor({
      listenPort: 0,
      shutdownTimeoutMs: 1_500,
      log: () => undefined,
      roleSpecs: [{ name: 'fixture-worker', command: process.execPath, args: ['-e', inline], cwd: directory, env: { PATH: process.env.PATH }, restart: false }],
    });
    supervisor.start();
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      try { await readFile(pidPath, 'utf8'); break; } catch { await new Promise(resolve => setTimeout(resolve, 25)); }
    }
    const toolPid = Number(await readFile(pidPath, 'utf8'));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('fixture worker did not crash')), 4_000);
      supervisor.managers[0].child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    const deadlineAfterCrash = Date.now() + 2_000;
    let alive = true;
    while (Date.now() < deadlineAfterCrash) {
      try {
        const stat = await readFile(`/proc/${toolPid}/stat`, 'utf8');
        const state = stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/)[0];
        if (state === 'Z') { alive = false; break; }
        process.kill(toolPid, 0);
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      catch (error) { if (error.code === 'ESRCH' || error.code === 'ENOENT') { alive = false; break; } throw error; }
    }
    assert.equal(alive, false, `detached media child ${toolPid} was left running`);
  } finally {
    await supervisor?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('stop sends graceful termination and waits for child exit', async () => {
  const childPid = path.join(tmpdir(), `shared-imli-stop-${process.pid}-${Date.now()}.txt`);
  const inline = `require('fs').writeFileSync(${JSON.stringify(childPid)},String(process.pid));process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000);`;
  const supervisor = createSupervisor({
    listenPort: 0,
    shutdownTimeoutMs: 1_000,
    log: () => undefined,
    roleSpecs: [{ name: 'fixture-child', command: process.execPath, args: ['-e', inline], cwd: process.cwd(), env: { PATH: process.env.PATH }, restart: false }],
  });
  supervisor.start();
  try {
    const child = supervisor.managers[0].child;
    await new Promise(resolve => child.once('spawn', resolve));
    await supervisor.stop();
    assert.equal(supervisor.managers[0].child, null);
  } finally {
    await rm(childPid, { force: true });
  }
});

test('stop force-closes a hung gateway response and a child that ignores SIGTERM', async () => {
  const backend = http.createServer(() => {});
  backend.listen(0, '127.0.0.1');
  await once(backend, 'listening');
  const childCode = `process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`;
  const supervisor = createSupervisor({
    listenPort: 0,
    gatewayOptions: { imliPort: backend.address().port },
    shutdownTimeoutMs: 250,
    log: () => undefined,
    roleSpecs: [{ name: 'stubborn-child', command: process.execPath, args: ['-e', childCode], cwd: process.cwd(), env: { PATH: process.env.PATH }, restart: false }],
  });
  const gateway = supervisor.start();
  try {
    await once(gateway, 'listening');
    const pendingResponse = new Promise(resolve => {
      const request = http.get(`http://127.0.0.1:${gateway.address().port}/hung`);
      request.once('error', resolve);
      request.once('response', response => {
        response.once('error', resolve);
        response.once('aborted', resolve);
      });
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    const startedAt = Date.now();
    await supervisor.stop();
    assert.ok(Date.now() - startedAt < 2_000, 'shutdown exceeded its bounded deadline');
    await pendingResponse;
  } finally {
    backend.closeAllConnections();
    await new Promise(resolve => backend.close(resolve));
  }
});

test('worker IPC is shape-checked, expires, and resets across child restart', async () => {
  const imli = http.createServer((_request, response) => response.end(JSON.stringify({ healthy: true })));
  const api = http.createServer((_request, response) => response.end(JSON.stringify({ ok: true, db: { journalMode: 'wal' } })));
  imli.listen(0, '127.0.0.1');
  api.listen(0, '127.0.0.1');
  await Promise.all([once(imli, 'listening'), once(api, 'listening')]);
  const imliPort = imli.address().port;
  const apiPort = api.address().port;
  const code = `process.send({type:'soundboard-worker-health',healthy:'yes'});process.on('message',m=>{if(m==='valid')process.send({type:'soundboard-worker-health',healthy:true});if(m==='unhealthy')process.send({type:'soundboard-worker-health',healthy:false})});setInterval(()=>{},1000);`;
  const supervisor = createSupervisor({
    listenPort: 0,
    gatewayOptions: { imliPort, editorPort: apiPort },
    log: () => undefined,
    roleSpecs: [{ name: 'worker', command: process.execPath, args: ['-e', code], cwd: process.cwd(), env: { PATH: process.env.PATH }, healthIpc: true }],
  });
  const gateway = supervisor.start();
  try {
    await once(gateway, 'listening');
    const port = gateway.address().port;
    assert.equal((await healthRequest(port)).body.checks.worker, false, 'malformed initial heartbeat must not mark the worker ready');
    supervisor.managers[0].child.send('valid');
    await waitFor(async () => (await healthRequest(port)).body.checks.worker);
    supervisor.managers[0].child.send('unhealthy');
    await waitFor(async () => !(await healthRequest(port)).body.checks.worker);
    supervisor.managers[0].child.send('valid');
    await waitFor(async () => (await healthRequest(port)).body.checks.worker);
    const oldChild = supervisor.managers[0].child;
    oldChild.kill('SIGKILL');
    await once(oldChild, 'close');
    await waitFor(() => supervisor.managers[0].child && supervisor.managers[0].child !== oldChild && supervisor.managers[0].child.pid);
    assert.equal((await healthRequest(port)).body.checks.worker, false, 'restarted child must report a fresh heartbeat');
    supervisor.managers[0].child.send('valid');
    await waitFor(async () => (await healthRequest(port)).body.checks.worker);
    await new Promise(resolve => setTimeout(resolve, 5_100));
    assert.equal((await healthRequest(port)).body.checks.worker, false, 'heartbeat older than five seconds must expire');
  } finally {
    await supervisor.stop();
    imli.closeAllConnections?.();
    api.closeAllConnections?.();
    await Promise.all([new Promise(resolve => imli.close(resolve)), new Promise(resolve => api.close(resolve))]);
  }
});
