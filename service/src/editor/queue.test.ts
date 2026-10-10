import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDb } from '../db/open.js';
import { claimEditorJob, recoverEditorLeases } from './worker.js';

test('claims jobs once and recovers expired worker leases with bounded attempts', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'soundboard-queue-'));
  const db = openDb(path.join(directory, 'test.db'));
  try {
    const id = randomUUID();
    const now = Date.now();
    db.prepare(`INSERT INTO editor_sessions (id,source_url,state,expires_at,created_at) VALUES (?,'https://www.youtube.com/watch?v=aB_cD-12345','queued',?,?)`)
      .run(id, new Date(now + 60_000).toISOString(), new Date(now).toISOString());
    db.prepare(`INSERT INTO editor_jobs (session_id,kind,state,next_run_at,created_at) VALUES (?,'fetch','queued',?,?)`).run(id, now, now);
    const claimed = claimEditorJob(db, now);
    assert.equal(claimed?.session_id, id);
    assert.equal(claimed?.attempts, 1);
    assert.equal(claimEditorJob(db, now), undefined);

    db.prepare(`UPDATE editor_jobs SET lease_until=? WHERE id=?`).run(now - 1, claimed!.id);
    recoverEditorLeases(db, now);
    const recovered = db.prepare('SELECT state, lease_until, next_run_at FROM editor_jobs WHERE id=?').get(claimed!.id) as any;
    assert.equal(recovered.state, 'queued');
    assert.equal(recovered.lease_until, null);
    assert.equal(recovered.next_run_at, now + 5_000);

    db.prepare(`UPDATE editor_sessions SET state='fetching' WHERE id=?`).run(id);
    db.prepare(`UPDATE editor_jobs SET state='running', attempts=2, lease_until=? WHERE id=?`).run(now - 1, claimed!.id);
    recoverEditorLeases(db, now);
    assert.equal((db.prepare('SELECT state FROM editor_jobs WHERE id=?').get(claimed!.id) as any).state, 'failed');
    assert.equal((db.prepare('SELECT state FROM editor_sessions WHERE id=?').get(id) as any).state, 'failed');
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
