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
  return db;
}
