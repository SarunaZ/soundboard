import { readFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startGateway } from './gateway.mjs';
import { createReadinessMonitor } from './health.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = '/app';
const NODE = process.execPath;
const MAX_RESTARTS_PER_MINUTE = 8;
const RESTART_BASE_MS = 250;
const RESTART_MAX_MS = 10_000;

function cleanEnvironment(env) {
  const cleaned = {};
  for (const [name, value] of Object.entries(env)) {
    if (/^(NODE_OPTIONS|NODE_PATH|YARN_|npm_config_|COREPACK_)/i.test(name)) continue;
    if (value !== undefined) cleaned[name] = value;
  }
  return cleaned;
}

function soundboardEnvironment(source, role) {
  const common = {
    PATH: source.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    NODE_ENV: source.NODE_ENV ?? 'production',
    DB_PATH: source.DB_PATH ?? '/data/soundboard.db',
    TEMP_DIR: source.TEMP_DIR ?? '/var/tmp/soundboard',
  };
  if (role === 'api') {
    return cleanEnvironment({ ...common, PORT: '8080', HOST: '127.0.0.1', EDITOR_TOKEN: source.EDITOR_TOKEN });
  }
  return cleanEnvironment({ ...common, YTDLP_BIN: source.YTDLP_BIN });
}

export function defaultRoleSpecs(sourceEnv = process.env) {
  const { EDITOR_TOKEN, DB_PATH, TEMP_DIR, YTDLP_BIN, ...imliConfig } = sourceEnv;
  const imliEnv = cleanEnvironment({ ...imliConfig, PORT: '4001' });
  return [
    { name: 'imli', command: NODE, args: ['/imli/build/index.js'], cwd: '/imli', env: imliEnv },
    { name: 'api', command: NODE, args: ['service/dist/api/index.js'], cwd: ROOT, env: soundboardEnvironment(sourceEnv, 'api') },
    { name: 'worker', command: NODE, args: ['service/dist/worker/index.js'], cwd: ROOT, env: soundboardEnvironment(sourceEnv, 'worker'), healthIpc: true },
  ];
}

async function linuxProcessSnapshot() {
  const snapshot = new Map();
  let entries;
  try { entries = await readdir('/proc'); } catch { return snapshot; }
  await Promise.all(entries.filter(name => /^\d+$/.test(name)).map(async name => {
    try {
      const stat = await readFile(`/proc/${name}/stat`, 'utf8');
      const close = stat.lastIndexOf(')');
      const fields = stat.slice(close + 1).trim().split(/\s+/);
      snapshot.set(Number(name), {
        ppid: Number(fields[1]),
        pgid: Number(fields[2]),
        start: fields[19],
      });
    } catch { /* process exited during the snapshot */ }
  }));
  return snapshot;
}

export function descendantPids(rootPid, snapshot) {
  const result = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, processInfo] of snapshot) {
      if (!result.has(pid) && result.has(processInfo.ppid)) {
        result.add(pid);
        changed = true;
      }
    }
  }
  return result;
}

function signalGroup(groupId, signal) {
  if (!Number.isInteger(groupId) || groupId <= 1) return;
  try { process.kill(-groupId, signal); } catch (error) {
    if (error?.code !== 'ESRCH') console.error(`[supervisor] could not signal process group ${groupId}`);
  }
}

async function rememberDescendants(manager) {
  if (!manager.child?.pid || process.platform !== 'linux') return;
  const snapshot = await linuxProcessSnapshot();
  const descendants = descendantPids(manager.child.pid, snapshot);
  for (const pid of descendants) {
    const info = snapshot.get(pid);
    if (info?.pgid) {
      let members = manager.groups.get(info.pgid);
      if (!members) manager.groups.set(info.pgid, members = new Map());
      members.set(pid, info.start);
    }
  }
}

async function killTracked(manager) {
  await rememberDescendants(manager);
  if (process.platform !== 'linux') return;
  const snapshot = await linuxProcessSnapshot();
  for (const [groupId, members] of manager.groups) {
    const stillSameGroup = [...members].some(([pid, start]) => {
      const current = snapshot.get(pid);
      return current?.pgid === groupId && current.start === start;
    });
    if (stillSameGroup) signalGroup(groupId, 'SIGKILL');
  }
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export function createSupervisor({
  roleSpecs = defaultRoleSpecs(),
  listenPort = Number(process.env.PORT ?? 4000),
  gatewayOptions = {},
  shutdownTimeoutMs = 8_000,
  startGatewayFn = startGateway,
  log = console.log,
} = {}) {
  const managers = roleSpecs.map(spec => ({ spec, child: null, healthAt: null, healthValue: false, groups: new Map(), restarts: [], restartCount: 0, stopped: false, restartTimer: null, monitorTimer: null }));
  let gateway;
  let stopping = false;
  let stopPromise;
  const worker = managers.find(manager => manager.spec.name === 'worker');
  const api = managers.find(manager => manager.spec.name === 'api');
  const readiness = createReadinessMonitor({
    imliPort: gatewayOptions.imliPort ?? 4001,
    apiPort: gatewayOptions.editorPort ?? 8080,
    workerHealthy: () => Boolean(worker && worker.healthValue && worker.healthAt !== null && Date.now() - worker.healthAt <= 5_000),
    editorTokenConfigured: typeof api?.spec.env?.EDITOR_TOKEN === 'string' && api.spec.env.EDITOR_TOKEN.length > 0,
    isStopping: () => stopping,
    log,
  });

  const spawnRole = manager => {
    if (stopping || manager.stopped) return;
    const { spec } = manager;
    manager.groups = new Map();
    manager.healthAt = null;
    manager.healthValue = false;
    const child = spawn(spec.command, spec.args ?? [], {
      cwd: spec.cwd,
      env: cleanEnvironment(spec.env ?? {}),
      detached: process.platform !== 'win32',
      stdio: spec.healthIpc ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit',
    });
    manager.child = child;
    let resolveClosed;
    manager.closePromise = new Promise(resolve => { resolveClosed = resolve; });
    const startedAt = Date.now();
    manager.monitorTimer = setInterval(() => { void rememberDescendants(manager); }, 100);
    manager.monitorTimer.unref?.();
    if (spec.healthIpc) {
      child.on('message', message => {
        if (manager.child !== child || !message || typeof message !== 'object' || Array.isArray(message)) return;
        const keys = Object.keys(message).sort();
        if (keys.length !== 2 || keys[0] !== 'healthy' || keys[1] !== 'type' || message.type !== 'soundboard-worker-health' || typeof message.healthy !== 'boolean') return;
        manager.healthValue = message.healthy;
        manager.healthAt = Date.now();
      });
      child.once('disconnect', () => {
        if (manager.child === child) { manager.healthAt = null; manager.healthValue = false; }
      });
    }
    child.once('error', error => {
      manager.healthAt = null;
      manager.healthValue = false;
      log(`[supervisor] ${spec.name} could not start: ${error.code ?? 'spawn error'}`);
    });
    child.once('close', (code, signal) => {
      resolveClosed();
      clearInterval(manager.monitorTimer);
      manager.healthAt = null;
      manager.healthValue = false;
      void (async () => {
        await killTracked(manager);
        manager.healthAt = null;
        manager.healthValue = false;
        manager.child = null;
        if (stopping || manager.stopped) return;
        if (spec.restart === false) {
          manager.stopped = true;
          return;
        }
        const livedMs = Date.now() - startedAt;
        if (livedMs > 30_000) manager.restarts = [];
        const now = Date.now();
        manager.restarts = manager.restarts.filter(time => now - time < 60_000);
        if (manager.restarts.length >= MAX_RESTARTS_PER_MINUTE) {
          manager.stopped = true;
          log(`[supervisor] ${spec.name} stopped after repeated failures`);
          return;
        }
        manager.restarts.push(now);
        const backoff = Math.min(RESTART_MAX_MS, RESTART_BASE_MS * (2 ** Math.min(manager.restartCount++, 6)));
        log(`[supervisor] ${spec.name} exited (${signal ?? code ?? 'unknown'}); restarting in ${backoff}ms`);
        manager.restartTimer = setTimeout(() => spawnRole(manager), backoff);
        manager.restartTimer.unref?.();
      })();
    });
  };

  const start = () => {
    if (gateway) throw new Error('Supervisor already started');
    gateway = startGatewayFn({
      port: listenPort,
      ...gatewayOptions,
      health: {
        isAlive: () => !stopping,
        getReadiness: () => readiness.getReadiness(),
      },
    });
    gateway.on('error', error => {
      log(`[supervisor] gateway failed: ${error.code ?? 'listen error'}`);
      void stop();
    });
    for (const manager of managers) spawnRole(manager);
    return gateway;
  };

  const stop = () => {
    if (stopPromise) return stopPromise;
    stopping = true;
    for (const manager of managers) { manager.healthAt = null; manager.healthValue = false; }
    stopPromise = (async () => {
      let gatewayClosed = Promise.resolve();
      let gatewayCloseDone = !gateway?.listening;
      if (gateway?.listening) gatewayClosed = new Promise(resolve => gateway.close(() => { gatewayCloseDone = true; resolve(); }));
      const childrenAtStop = managers.map(manager => ({ manager, child: manager.child, closePromise: manager.closePromise }));
      for (const manager of managers) {
        clearTimeout(manager.restartTimer);
        clearInterval(manager.monitorTimer);
        if (manager.child) signalGroup(manager.child.pid, 'SIGTERM');
      }
      const deadline = Date.now() + shutdownTimeoutMs;
      while (Date.now() < deadline && (managers.some(manager => manager.child) || !gatewayCloseDone)) await delay(50);
      if (!gatewayCloseDone) gateway?.closeAllConnections?.();
      await Promise.all(childrenAtStop.map(async ({ manager, child, closePromise }) => {
        if (!child) return;
        await killTracked(manager);
        child.kill('SIGKILL');
        await closePromise;
      }));
      await gatewayClosed;
      log('[supervisor] stopped');
    })();
    return stopPromise;
  };

  return { start, stop, managers };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(HERE, 'supervisor.mjs')) {
  const supervisor = createSupervisor();
  supervisor.start();
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => { void supervisor.stop().then(() => process.exit(0)); });
  }
}
