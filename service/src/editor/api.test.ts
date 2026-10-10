import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  server.close();
  await once(server, 'close');
  return address.port;
}

async function startApi(directory: string, token?: string): Promise<{ child: ChildProcess; base: string }> {
  const port = await freePort();
  const child = spawn(process.execPath, ['dist/api/index.js'], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH, PORT: String(port), DB_PATH: path.join(directory, `${port}.db`), TEMP_DIR: path.join(directory, 'temp'), ...(token ? { EDITOR_TOKEN: token } : {}) },
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('API exited before becoming ready');
    try { if ((await fetch(`${base}/health`)).ok) return { child, base }; } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  child.kill('SIGKILL');
  throw new Error('API did not become ready');
}

async function stopApi(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await once(child, 'exit');
}

test('all editor routes require configured bearer auth and return the session contract', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'soundboard-api-'));
  const token = 'test-token-only';
  try {
    const missing = await startApi(directory);
    try {
      const response = await fetch(`${missing.base}/editor/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'Editor is not configured.' });
    } finally { await stopApi(missing.child); }

    const api = await startApi(directory, token);
    try {
      const unauthorized = await fetch(`${api.base}/editor/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
      assert.equal(unauthorized.status, 401);
      assert.deepEqual(await unauthorized.json(), { error: 'Unauthorized.' });
      for (const [url, canonicalUrl] of [
        ['http://www.youtube.com/watch?v=OjNpRbNdR7E&list=RDOjNpRbNdR7E', 'https://www.youtube.com/watch?v=OjNpRbNdR7E'],
        ['https://www.youtube.com/shorts/jlPQtJXy9t8', 'https://www.youtube.com/watch?v=jlPQtJXy9t8'],
      ]) {
        const queued = await fetch(`${api.base}/editor/sessions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        assert.equal(queued.status, 202);
        const session = await queued.json() as Record<string, unknown>;
        assert.equal(session.state, 'queued');
        assert.equal(session.sourceUrl, canonicalUrl);
        assert.deepEqual(Object.keys(session).sort(), ['clipPath','durationMs','error','expiresAt','id','peaks','previewPath','sourceUrl','state','title','trimEndMs','trimStartMs'].sort());
        const deleted = await fetch(`${api.base}/editor/sessions/${session.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        assert.equal(deleted.status, 204);
      }
      const malformed = await fetch(`${api.base}/editor/sessions`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{',
      });
      assert.equal(malformed.status, 400);
      assert.deepEqual(await malformed.json(), { error: 'Invalid request.' });
    } finally { await stopApi(api.child); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
