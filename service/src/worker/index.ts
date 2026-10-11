import { spawnSync } from 'node:child_process';
import { openDb, DB_PATH } from '../db/open.js';
import { cleanupExpiredSessions, claimEditorJob, processEditorJob } from '../editor/worker.js';
import { createWorkerHealthHeartbeat } from './health.js';

// This runs as a SEPARATE PROCESS from the API on purpose (DESIGN §7):
// better-sqlite3 is synchronous and would block the API's event loop, and an
// ffmpeg crash should take the worker, not the API.

const TEMP_DIR = process.env.TEMP_DIR ?? '/var/tmp/soundboard';

function toolVersion(bin: string, args: string[]): string {
  const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 5_000, maxBuffer: 64 * 1024 });
  if (r.error || r.status !== 0) return 'MISSING';
  const version = (r.stdout || r.stderr).split('\n')[0]!.trim();
  return version ? version : 'MISSING';
}

const db = openDb();
let busy = false;

console.log(`[worker] db=${DB_PATH} temp=${TEMP_DIR}`);
const ytdlpBin = process.env.YTDLP_BIN ?? 'yt-dlp';
const ffmpegVersion = toolVersion('ffmpeg', ['-version']);
const ffprobeVersion = toolVersion('ffprobe', ['-version']);
const ytdlpVersion = toolVersion(ytdlpBin, ['--version']);
console.log(`[worker] ffmpeg: ${ffmpegVersion}`);
console.log(`[worker] ffprobe: ${ffprobeVersion}`);
console.log(`[worker] yt-dlp: ${ytdlpVersion}`);

const heartbeat = createWorkerHealthHeartbeat({
  send: typeof process.send === 'function'
    ? (message, callback) => process.send!(message, error => callback?.(error ?? null))
    : undefined,
  checkDatabase: () => db.prepare('SELECT 1').get() !== undefined,
  toolsAvailable: ffmpegVersion !== 'MISSING' && ffprobeVersion !== 'MISSING' && ytdlpVersion !== 'MISSING',
});

// Concurrency 1, forever (DESIGN §7 — two ffmpeg processes will not fit).
function runCycle() {
  if (busy) return;
  busy = true;
  void (async () => {
    try {
      await cleanupExpiredSessions(db);
      const job = claimEditorJob(db);
      // Successful cleanup and queue access establish worker health; a long
      // media job does not make it unhealthy by itself.
      heartbeat.markCycleHealthy(true);
      if (job) await processEditorJob(db, job);
    } catch (error) {
      heartbeat.markCycleHealthy(false);
      console.error('[worker] editor cycle failed', error instanceof Error ? error.message : 'unknown error');
    } finally { busy = false; }
  })();
}

const tick = setInterval(() => { void runCycle(); }, 1000);
void runCycle();
heartbeat.start();

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`[worker] ${signal} — stopping`);
    clearInterval(tick);
    heartbeat.stop();
    const stopWhenIdle = setInterval(() => {
      if (!busy) { clearInterval(stopWhenIdle); db.close(); process.exit(0); }
    }, 100);
  });
}
