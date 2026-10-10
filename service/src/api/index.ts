import express from 'express';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { openDb, DB_PATH } from '../db/open.js';
import { canonicalizeYouTubeUrl, MAX_QUEUED_SESSIONS, MAX_TOTAL_SESSIONS, publicSession, SESSION_TTL_MS, validateTrim } from '../editor/contracts.js';

const port = Number(process.env.PORT ?? 8080);
const db = openDb();
const app = express();
const TEMP_DIR = process.env.TEMP_DIR ?? '/var/tmp/soundboard';
const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const sessions = db.prepare('SELECT * FROM editor_sessions WHERE id=?');
const paramId = (req: express.Request) => String(req.params.id ?? '');
const token = process.env.EDITOR_TOKEN;

app.use('/editor', (req, res, next) => {
  if (!token) { res.status(503).json({ error: 'Editor is not configured.' }); return; }
  const authorization = req.get('authorization') ?? '';
  const supplied = createHash('sha256').update(authorization).digest();
  const expected = createHash('sha256').update(`Bearer ${token}`).digest();
  if (!timingSafeEqual(supplied, expected)) { res.status(401).json({ error: 'Unauthorized.' }); return; }
  next();
});
app.use(express.json({ limit: '8kb', strict: true }));

app.post('/editor/sessions', (req, res) => {
  let sourceUrl: string;
  try {
    sourceUrl = canonicalizeYouTubeUrl(req.body?.url);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Enter a valid YouTube URL.' });
    return;
  }
  try {
    const totalCount = Number(db.prepare('SELECT COUNT(*) FROM editor_sessions').pluck().get());
    if (totalCount >= MAX_TOTAL_SESSIONS) { res.status(429).json({ error: 'Too many saved editor sessions. Delete or wait for an older session to expire.' }); return; }
    const activeCount = Number(db.prepare(`SELECT COUNT(*) FROM editor_sessions WHERE state IN ('queued','fetching','ready','rendering')`).pluck().get());
    if (activeCount >= MAX_QUEUED_SESSIONS) { res.status(429).json({ error: 'The editor queue is full. Try again shortly.' }); return; }
    const id = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
    const tx = db.transaction(() => {
      db.prepare(`INSERT INTO editor_sessions (id,source_url,state,expires_at,created_at) VALUES (?,?,'queued',?,?)`).run(id, sourceUrl, expiresAt, now.toISOString());
      db.prepare(`INSERT INTO editor_jobs (session_id,kind,state,next_run_at,created_at) VALUES (?,'fetch','queued',?,?)`).run(id, Date.now(), Date.now());
    });
    tx();
    res.status(202).json(publicSession(sessions.get(id)));
  } catch (error) {
    console.error('[api] could not queue editor session');
    res.status(500).json({ error: 'The editor could not start this session.' });
  }
});

app.get('/editor/sessions/:id', (req, res) => {
  const id = paramId(req);
  if (!validId(id)) { res.status(404).json({ error: 'Session not found.' }); return; }
  const row = sessions.get(id) as any;
  if (!row || row.delete_requested || Date.parse(row.expires_at) <= Date.now()) { res.status(404).json({ error: 'Session not found.' }); return; }
  res.json(publicSession(row));
});

app.post('/editor/sessions/:id/render', (req, res) => {
  const id = paramId(req);
  if (!validId(id)) { res.status(404).json({ error: 'Session not found.' }); return; }
  const row = sessions.get(id) as any;
  if (!row || row.delete_requested || Date.parse(row.expires_at) <= Date.now()) { res.status(404).json({ error: 'Session not found.' }); return; }
  if (row.state !== 'ready' && row.state !== 'rendered') { res.status(409).json({ error: 'The source is not ready to render.' }); return; }
  try {
    const trim = validateTrim(req.body?.startMs, req.body?.endMs, row.duration_ms);
    const tx = db.transaction(() => {
      db.prepare(`UPDATE editor_sessions SET state='rendering', trim_start_ms=?, trim_end_ms=?, error=NULL WHERE id=?`).run(trim.startMs, trim.endMs, id);
      db.prepare(`INSERT INTO editor_jobs (session_id,kind,state,payload_json,next_run_at,created_at) VALUES (?,'render','queued',?,?,?)`)
        .run(id, JSON.stringify(trim), Date.now(), Date.now());
    });
    tx();
    res.status(202).json(publicSession(sessions.get(id)));
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('Trim points') || error.message.startsWith('Choose a range'))) {
      res.status(400).json({ error: error.message });
    } else {
      console.error('[api] could not queue editor render');
      res.status(500).json({ error: 'The editor could not start rendering.' });
    }
  }
});

function sendAudio(req: express.Request, res: express.Response, kind: 'preview' | 'clip'): void {
  const id = paramId(req);
  if (!validId(id)) { res.status(404).json({ error: 'Audio not found.' }); return; }
  const row = sessions.get(id) as any;
  const filePath = kind === 'preview' ? row?.preview_path : row?.clip_path;
  if (!row || row.delete_requested || Date.parse(row.expires_at) <= Date.now() || !filePath || (kind === 'preview' && !['ready','rendering','rendered'].includes(row.state)) || (kind === 'clip' && row.state !== 'rendered')) {
    res.status(404).json({ error: 'Audio is not available.' }); return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'audio/mp4');
  res.sendFile(path.resolve(filePath), error => { if (error && !res.headersSent) res.status(404).json({ error: 'Audio is not available.' }); });
}
app.get('/editor/sessions/:id/preview', (req, res) => sendAudio(req, res, 'preview'));
app.get('/editor/sessions/:id/clip', (req, res) => sendAudio(req, res, 'clip'));

app.delete('/editor/sessions/:id', (req, res) => {
  const id = paramId(req);
  if (!validId(id)) { res.status(204).end(); return; }
  const state = db.transaction(() => {
    db.prepare(`UPDATE editor_sessions SET delete_requested=1, expires_at=? WHERE id=?`).run(new Date(0).toISOString(), id);
    db.prepare(`UPDATE editor_jobs SET state='failed', lease_until=NULL WHERE session_id=? AND state='queued'`).run(id);
    const running = db.prepare(`SELECT 1 FROM editor_jobs WHERE session_id=? AND state='running'`).get(id);
    return Boolean(running);
  })();
  if (!state) void fs.rm(path.join(TEMP_DIR, 'editor', id), { recursive: true, force: true })
    .then(() => db.prepare('DELETE FROM editor_sessions WHERE id=?').run(id))
    .catch(() => console.error('[api] editor session cleanup deferred to worker'));
  res.status(204).end();
});

app.use('/editor', (_req, res) => res.status(404).json({ error: 'Editor route not found.' }));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 400;
  res.status(status).json({ error: status === 413 ? 'Request is too large.' : 'Invalid request.' });
});

app.get('/health', (_req, res) => {
  const journalMode = db.pragma('journal_mode', { simple: true });
  res.json({
    ok: true,
    service: 'soundboard-api',
    db: { path: DB_PATH, journalMode },
    uptimeSec: Math.round(process.uptime()),
  });
});

const server = app.listen(port, process.env.HOST ?? '127.0.0.1', () => {
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
