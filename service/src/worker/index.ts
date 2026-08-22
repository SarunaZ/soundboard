import { spawnSync } from 'node:child_process';
import { openDb, DB_PATH } from '../db/open.js';

// Skeleton only. The jobs table and its four semantics — atomic claim, lease
// recovery, backoff → dead-letter, idempotency — are M1 (STEPS.md step 9).
//
// This runs as a SEPARATE PROCESS from the API on purpose (DESIGN §7):
// better-sqlite3 is synchronous and would block the API's event loop, and an
// ffmpeg crash should take the worker, not the API.

const TEMP_DIR = process.env.TEMP_DIR ?? '/var/tmp/soundboard';

function toolVersion(bin: string, args: string[]): string {
  const r = spawnSync(bin, args, { encoding: 'utf8' });
  if (r.error || r.status !== 0) return 'MISSING';
  return (r.stdout || r.stderr).split('\n')[0]!.trim();
}

const db = openDb();

console.log(`[worker] db=${DB_PATH} temp=${TEMP_DIR}`);
console.log(`[worker] ffmpeg: ${toolVersion('ffmpeg', ['-version'])}`);
console.log(`[worker] yt-dlp: ${toolVersion('yt-dlp', ['--version'])}`);

// Concurrency 1, forever (DESIGN §7 — two ffmpeg processes will not fit).
const tick = setInterval(() => {
  // claimNextJob() goes here in M1.
}, 1000);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`[worker] ${signal} — stopping`);
    clearInterval(tick);
    db.close();
    process.exit(0);
  });
}
