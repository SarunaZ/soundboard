import express from 'express';
import { openDb, DB_PATH } from '../db/open.js';

// Skeleton only. /ingest, /sessions, /manifest and /metrics arrive in M1
// (STEPS.md steps 9–13); this exists so the container has something to run.

const port = Number(process.env.PORT ?? 8080);
const db = openDb();
const app = express();

app.get('/health', (_req, res) => {
  const journalMode = db.pragma('journal_mode', { simple: true });
  res.json({
    ok: true,
    service: 'soundboard-api',
    db: { path: DB_PATH, journalMode },
    uptimeSec: Math.round(process.uptime()),
  });
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[api] listening on :${port}, db=${DB_PATH}`);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`[api] ${signal} — closing`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
