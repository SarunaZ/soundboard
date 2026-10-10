import test from 'node:test';
import assert from 'node:assert/strict';
import { access, chmod, copyFile, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
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

async function waitForSession(base: string, token: string, id: string, state: string): Promise<any> {
  const deadline = Date.now() + 45_000;
  let latest: any;
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/editor/sessions/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) {
      latest = await response.json();
      if (latest.state === state) return latest;
      if (latest.state === 'failed') throw new Error(`Fixture pipeline failed: ${latest.error}`);
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${state}; last session ${JSON.stringify(latest)}`);
}

test('fake yt-dlp fixture drives real ffmpeg preview, peaks, trim, and cleanup', { skip: process.platform === 'win32' || spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'soundboard-pipeline-'));
  const binDir = path.join(directory, 'bin');
  await mkdir(binDir);
  const fake = path.resolve('test-fixtures/fake-yt-dlp.sh');
  const fakeExecutable = path.join(binDir, 'yt-dlp');
  await copyFile(fake, fakeExecutable);
  await chmod(fakeExecutable, 0o755);
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const token = 'pipeline-test-token';
  const env = {
    ...process.env,
    PORT: String(port),
    DB_PATH: path.join(directory, 'pipeline.db'),
    TEMP_DIR: path.join(directory, 'temp'),
    EDITOR_TOKEN: token,
    YTDLP_BIN: fakeExecutable,
  };
  const api = spawn(process.execPath, ['dist/api/index.js'], { cwd: process.cwd(), env, stdio: 'ignore' });
  let worker: ChildProcess | undefined;
  const stop = async (child: ChildProcess | undefined) => {
    if (!child || child.exitCode !== null) return;
    child.kill('SIGTERM');
    await once(child, 'exit');
  };
  try {
    const healthDeadline = Date.now() + 5_000;
    while (Date.now() < healthDeadline) {
      try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    worker = spawn(process.execPath, ['dist/worker/index.js'], { cwd: process.cwd(), env, stdio: 'ignore' });
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const created = await fetch(`${base}/editor/sessions`, { method: 'POST', headers, body: JSON.stringify({ url: 'https://youtu.be/aB_cD-12345' }) });
    assert.equal(created.status, 202);
    const queued = await created.json() as { id: string };
    const ready = await waitForSession(base, token, queued.id, 'ready');
    assert.equal(ready.title, 'Test sine fixture');
    assert.equal(ready.durationMs, 3_000);
    assert.ok(Array.isArray(ready.peaks) && ready.peaks.some((peak: number) => peak > 0.05));
    const preview = await fetch(`${base}${ready.previewPath}`, { headers: { Authorization: `Bearer ${token}`, Range: 'bytes=0-31' } });
    assert.equal(preview.status, 206);
    assert.equal((await preview.arrayBuffer()).byteLength, 32);

    const renderedResponse = await fetch(`${base}/editor/sessions/${queued.id}/render`, { method: 'POST', headers, body: JSON.stringify({ startMs: 500, endMs: 2_000 }) });
    assert.equal(renderedResponse.status, 202);
    const rendered = await waitForSession(base, token, queued.id, 'rendered');
    assert.deepEqual([rendered.trimStartMs, rendered.trimEndMs], [500, 2_000]);
    const clip = await fetch(`${base}${rendered.clipPath}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(clip.status, 200);
    assert.match(clip.headers.get('content-type') ?? '', /audio\/mp4/);
    const clipPath = path.join(directory, 'rendered.m4a');
    const clipBytes = Buffer.from(await clip.arrayBuffer());
    assert.ok(clipBytes.byteLength > 1_000);
    await writeFile(clipPath, clipBytes);
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration', '-of', 'json', clipPath], { encoding: 'utf8' });
    assert.equal(probe.status, 0, probe.stderr);
    const media = JSON.parse(probe.stdout) as { streams: Array<{ codec_name: string; sample_rate: string; channels: number }>; format: { duration: string } };
    assert.deepEqual(media.streams[0], { codec_name: 'aac', sample_rate: '44100', channels: 1 });
    assert.ok(Math.abs(Number(media.format.duration) - 1.5) < 0.06);

    const retryResponse = await fetch(`${base}/editor/sessions`, { method: 'POST', headers, body: JSON.stringify({ url: 'https://youtu.be/retry_12345' }) });
    assert.equal(retryResponse.status, 202);
    const retrySession = await retryResponse.json() as { id: string };
    const retried = await waitForSession(base, token, retrySession.id, 'ready');
    assert.equal(retried.title, 'Test sine fixture');

    const cancelResponse = await fetch(`${base}/editor/sessions`, { method: 'POST', headers, body: JSON.stringify({ url: 'https://youtu.be/cancel12345' }) });
    assert.equal(cancelResponse.status, 202);
    const cancelSession = await cancelResponse.json() as { id: string };
    const fetchDeadline = Date.now() + 10_000;
    while (Date.now() < fetchDeadline) {
      const status = await fetch(`${base}/editor/sessions/${cancelSession.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (status.ok && (await status.json() as { state: string }).state === 'fetching') break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const cancelled = await fetch(`${base}/editor/sessions/${cancelSession.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    assert.equal(cancelled.status, 204);
    const cancelledDir = path.join(directory, 'temp', 'editor', cancelSession.id);
    const cleanupDeadline = Date.now() + 5_000;
    while (Date.now() < cleanupDeadline) {
      try { await access(cancelledDir); } catch { break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await assert.rejects(access(cancelledDir));

    const deleteRendered = await fetch(`${base}/editor/sessions/${queued.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    assert.equal(deleteRendered.status, 204);
    const renderedDir = path.join(directory, 'temp', 'editor', queued.id);
    const deleteDeadline = Date.now() + 5_000;
    while (Date.now() < deleteDeadline) {
      try { await access(renderedDir); } catch { break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await assert.rejects(access(renderedDir));
  } finally {
    await stop(worker);
    await stop(api);
    await rm(directory, { recursive: true, force: true });
  }
});
