import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export const DB_PATH = process.env.DB_PATH ?? '/data/soundboard.db';

/**
 * WAL is required (DESIGN §5): the API and the worker are separate processes
 * on the same file, and better-sqlite3 is synchronous.
 */
export function openDb(path: string = DB_PATH): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS editor_sessions (
      id TEXT PRIMARY KEY,
      source_url TEXT NOT NULL,
      title TEXT,
      duration_ms INTEGER,
      state TEXT NOT NULL CHECK (state IN ('queued','fetching','ready','rendering','rendered','failed')),
      preview_path TEXT,
      clip_path TEXT,
      source_path TEXT,
      peaks_json TEXT NOT NULL DEFAULT '[]',
      expires_at TEXT NOT NULL,
      error TEXT,
      trim_start_ms INTEGER,
      trim_end_ms INTEGER,
      delete_requested INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS editor_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES editor_sessions(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('fetch','render')),
      state TEXT NOT NULL CHECK (state IN ('queued','running','done','failed')),
      payload_json TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_run_at INTEGER NOT NULL,
      lease_until INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS editor_jobs_ready ON editor_jobs(state, next_run_at, id);
    CREATE INDEX IF NOT EXISTS editor_sessions_expiry ON editor_sessions(expires_at);
  `);
  return db;
}
