import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { MAX_CLIP_DURATION_MS, MAX_SOURCE_BYTES, MAX_SOURCE_DURATION_MS, SESSION_TTL_MS } from './contracts.js';
import { boundedFileSize, makePeaks, PipelineError, runTool } from './media.js';

const LEASE_MS = 6 * 60 * 1000;
const MAX_ATTEMPTS = 2;
const TEMP_DIR = process.env.TEMP_DIR ?? '/var/tmp/soundboard';
const YTDLP_BIN = process.env.YTDLP_BIN ?? 'yt-dlp';

type Job = { id: number; session_id: string; kind: 'fetch' | 'render'; payload_json: string | null; attempts: number };

export function recoverEditorLeases(db: Database.Database, now = Date.now()): void {
  db.prepare(`UPDATE editor_jobs SET state='queued', lease_until=NULL, next_run_at=?
    WHERE state='running' AND lease_until < ? AND attempts < ?`).run(now + 5_000, now, MAX_ATTEMPTS);
  db.prepare(`UPDATE editor_jobs SET state='failed', lease_until=NULL
    WHERE state='running' AND lease_until < ? AND attempts >= ?`).run(now, MAX_ATTEMPTS);
  db.prepare(`UPDATE editor_sessions SET state='failed', error='Processing failed. Try a new session.'
    WHERE id IN (SELECT session_id FROM editor_jobs WHERE state='failed') AND state IN ('fetching','rendering')`).run();
}

export function claimEditorJob(db: Database.Database, now = Date.now()): Job | undefined {
  recoverEditorLeases(db, now);
  return db.prepare(`UPDATE editor_jobs SET state='running', attempts=attempts+1, lease_until=?
    WHERE id=(SELECT id FROM editor_jobs WHERE state='queued' AND next_run_at<=? ORDER BY id LIMIT 1)
    RETURNING id, session_id, kind, payload_json, attempts`).get(now + LEASE_MS, now) as Job | undefined;
}

function jobFailed(db: Database.Database, job: Job, error: unknown): void {
  const retry = job.attempts < MAX_ATTEMPTS;
  db.prepare(`UPDATE editor_jobs SET state=?, lease_until=NULL, next_run_at=? WHERE id=?`)
    .run(retry ? 'queued' : 'failed', Date.now() + (retry ? 5_000 * job.attempts : 0), job.id);
  if (!retry) {
    const message = error instanceof PipelineError ? error.message : 'That URL could not be processed. Try another video.';
    db.prepare(`UPDATE editor_sessions SET state='failed', error=? WHERE id=?`).run(message, job.session_id);
  }
}

function isDeleted(db: Database.Database, id: string): boolean {
  return Boolean((db.prepare('SELECT delete_requested FROM editor_sessions WHERE id=?').get(id) as any)?.delete_requested ?? true);
}

async function fetchSession(db: Database.Database, id: string, signal: AbortSignal): Promise<void> {
  const row = db.prepare('SELECT * FROM editor_sessions WHERE id=?').get(id) as any;
  if (!row) return;
  const dir = path.join(TEMP_DIR, 'editor', id);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  try {
    for (const name of await fs.readdir(dir)) {
      if (name.startsWith('source.') || name === 'preview.m4a') await fs.rm(path.join(dir, name), { force: true });
    }
    const infoText = await runTool(YTDLP_BIN, ['--no-config', '--no-warnings', '--no-playlist', '--js-runtimes', 'node', '--dump-single-json', '--', row.source_url], { cwd: dir, timeoutMs: 45_000, maxOutputBytes: 1024 * 1024, signal });
    const info = JSON.parse(infoText) as { duration?: number; title?: string; is_live?: boolean };
    const durationMs = Math.round((info.duration ?? 0) * 1000);
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_SOURCE_DURATION_MS || info.is_live) {
      throw new PipelineError('The video must be no longer than 20 minutes.');
    }
    const title = typeof info.title === 'string' ? info.title.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) : null;
    db.prepare('UPDATE editor_sessions SET title=?, duration_ms=? WHERE id=?').run(title, durationMs, id);
    await runTool(YTDLP_BIN, [
      '--no-config', '--no-warnings', '--no-progress', '--no-playlist', '--js-runtimes', 'node',
      '-f', 'bestaudio', '--max-filesize', '32M', '-o', path.join(dir, 'source.%(ext)s'), '--', row.source_url,
    ], { cwd: dir, timeoutMs: 240_000, signal, watchFiles: { directory: dir, prefix: 'source.', maxBytes: MAX_SOURCE_BYTES } });
    if (signal.aborted) throw new PipelineError();
    const files = await fs.readdir(dir);
    const sources = files.filter(name => name.startsWith('source.') && !name.endsWith('.part') && !name.endsWith('.json')).map(name => path.join(dir, name));
    if (sources.length !== 1) throw new PipelineError();
    const sourcePath = sources[0]!;
    await boundedFileSize(sourcePath, MAX_SOURCE_BYTES);
    const probeText = await runTool('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'format=duration', '-of', 'json', sourcePath], { cwd: dir, timeoutMs: 20_000, maxOutputBytes: 4096, signal });
    const probedSeconds = Number((JSON.parse(probeText) as { format?: { duration?: string } }).format?.duration);
    const actualDurationMs = Math.round(probedSeconds * 1000);
    if (!Number.isFinite(actualDurationMs) || actualDurationMs < 100 || actualDurationMs > MAX_SOURCE_DURATION_MS) {
      throw new PipelineError('The video must be no longer than 20 minutes.');
    }
    const previewPath = path.join(dir, 'preview.m4a');
    await runTool('ffmpeg', ['-nostdin', '-v', 'error', '-i', sourcePath, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '22050', '-c:a', 'aac', '-b:a', '32k', '-movflags', '+faststart', previewPath], { cwd: dir, timeoutMs: 120_000, signal });
    const peaks = await makePeaks(sourcePath, dir, actualDurationMs, signal);
    if (signal.aborted || isDeleted(db, id)) throw new PipelineError();
    db.prepare(`UPDATE editor_sessions SET state='ready', duration_ms=?, source_path=?, preview_path=?, peaks_json=?, expires_at=? WHERE id=?`)
      .run(actualDurationMs, sourcePath, previewPath, JSON.stringify(peaks), new Date(Date.now() + SESSION_TTL_MS).toISOString(), id);
  } finally {
    if (isDeleted(db, id)) {
      await fs.rm(dir, { recursive: true, force: true });
      db.prepare('DELETE FROM editor_sessions WHERE id=?').run(id);
    }
  }
}

async function renderSession(db: Database.Database, id: string, payloadText: string, signal: AbortSignal): Promise<void> {
  const row = db.prepare('SELECT * FROM editor_sessions WHERE id=?').get(id) as any;
  if (!row) return;
  const { startMs, endMs } = JSON.parse(payloadText) as { startMs: number; endMs: number };
  if (!row.source_path || !Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || startMs < 0 || endMs > row.duration_ms || endMs - startMs < 100 || endMs - startMs > MAX_CLIP_DURATION_MS) {
    throw new PipelineError('Choose a valid range up to 60 seconds.');
  }
  const sessionDir = path.join(TEMP_DIR, 'editor', id);
  for (const name of await fs.readdir(sessionDir)) {
    if (/^clip-[0-9a-f-]+\.m4a$/i.test(name)) await fs.rm(path.join(sessionDir, name), { force: true });
  }
  const clipPath = path.join(sessionDir, `clip-${randomUUID()}.m4a`);
  const oldClipPath = row.clip_path as string | null;
  const seconds = (endMs - startMs) / 1000;
  await runTool('ffmpeg', ['-nostdin', '-v', 'error', '-i', row.source_path, '-map', '0:a:0', '-vn', '-ss', (startMs / 1000).toFixed(3), '-t', seconds.toFixed(3), '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', clipPath], { cwd: path.dirname(clipPath), timeoutMs: 90_000, signal });
  const stat = await fs.stat(clipPath);
  if (signal.aborted || isDeleted(db, id) || stat.size === 0 || stat.size > 2 * 1024 * 1024) {
    await fs.rm(clipPath, { force: true });
    throw new PipelineError();
  }
  db.prepare(`UPDATE editor_sessions SET state='rendered', clip_path=?, trim_start_ms=?, trim_end_ms=?, error=NULL, expires_at=? WHERE id=?`)
    .run(clipPath, startMs, endMs, new Date(Date.now() + SESSION_TTL_MS).toISOString(), id);
  if (oldClipPath && path.dirname(oldClipPath) === path.dirname(clipPath) && oldClipPath !== clipPath) await fs.rm(oldClipPath, { force: true });
}

export async function processEditorJob(db: Database.Database, job: Job): Promise<void> {
  const controller = new AbortController();
  const poll = setInterval(() => { if (isDeleted(db, job.session_id)) controller.abort(); }, 300);
  const heartbeat = setInterval(() => { db.prepare(`UPDATE editor_jobs SET lease_until=? WHERE id=? AND state='running'`).run(Date.now() + LEASE_MS, job.id); }, 30_000);
  try {
    const session = db.prepare('SELECT id FROM editor_sessions WHERE id=?').get(job.session_id);
    if (!session) {
      db.prepare(`UPDATE editor_jobs SET state='done', lease_until=NULL WHERE id=?`).run(job.id);
      return;
    }
    if (isDeleted(db, job.session_id)) {
      await fs.rm(path.join(TEMP_DIR, 'editor', job.session_id), { recursive: true, force: true });
      db.prepare('DELETE FROM editor_sessions WHERE id=?').run(job.session_id);
      db.prepare(`UPDATE editor_jobs SET state='done', lease_until=NULL WHERE id=?`).run(job.id);
      return;
    }
    if (job.kind === 'fetch') {
      db.prepare(`UPDATE editor_sessions SET state='fetching', error=NULL WHERE id=?`).run(job.session_id);
      await fetchSession(db, job.session_id, controller.signal);
    } else {
      db.prepare(`UPDATE editor_sessions SET state='rendering', error=NULL WHERE id=?`).run(job.session_id);
      if (!job.payload_json) throw new PipelineError();
      await renderSession(db, job.session_id, job.payload_json, controller.signal);
    }
    db.prepare(`UPDATE editor_jobs SET state='done', lease_until=NULL WHERE id=?`).run(job.id);
  } catch (error) {
    if (isDeleted(db, job.session_id)) {
      await fs.rm(path.join(TEMP_DIR, 'editor', job.session_id), { recursive: true, force: true });
      db.prepare('DELETE FROM editor_sessions WHERE id=?').run(job.session_id);
      db.prepare(`UPDATE editor_jobs SET state='done', lease_until=NULL WHERE id=?`).run(job.id);
    } else jobFailed(db, job, error);
  } finally { clearInterval(poll); clearInterval(heartbeat); }
}

export async function cleanupExpiredSessions(db: Database.Database, now = new Date()): Promise<void> {
  const expired = db.prepare(`SELECT id FROM editor_sessions WHERE delete_requested=1 OR expires_at < ?`).all(now.toISOString()) as { id: string }[];
  for (const row of expired) {
    const active = db.prepare(`SELECT 1 FROM editor_jobs WHERE session_id=? AND state='running'`).get(row.id);
    if (active) db.prepare(`UPDATE editor_sessions SET delete_requested=1 WHERE id=?`).run(row.id);
    else {
      await fs.rm(path.join(TEMP_DIR, 'editor', row.id), { recursive: true, force: true });
      db.prepare('DELETE FROM editor_sessions WHERE id=?').run(row.id);
    }
  }
}
