import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fakeExpo = `export function requireOptionalNativeModule(name) { return globalThis.__deviceAudio.module; }`;
const fakeFileSystem = `const state = globalThis.__deviceAudio; export class File { constructor(uri) { this.uri = uri; this.exists = true; this.size = 4096; } }`;
const fakeReactNative = `export const Platform = globalThis.__deviceAudio.platform;`;
const fakeLocalAudio = `
const state = globalThis.__deviceAudio;
export async function openLocalAudioFile(file, signal, title, metadata) {
  state.openCalls.push({ uri: file.uri, title, metadata });
  if (state.openGate) await new Promise((resolve, reject) => {
    state.openGate.then(resolve);
    signal?.addEventListener('abort', () => { const error = new Error('cancelled'); error.name = 'AbortError'; reject(error); }, { once: true });
  });
  if (signal?.aborted) { const error = new Error('cancelled'); error.name = 'AbortError'; throw error; }
  const source = { id: 'staged-source', uri: 'file:///cache/staged.wav', title, durationMs: 400, peaks: [0.6] };
  state.sources.push(source);
  return source;
}
export async function disposeLocalAudioSource(source) { state.disposed.push(source); }
`;

async function harness(t, overrides = {}) {
  const directory = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? '.', 'soundboard-device-audio-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let releaseOpen;
  let enterRelease;
  const openGate = overrides.openPending ? new Promise((resolve) => { releaseOpen = resolve; }) : null;
  const releaseEntered = new Promise((resolve) => { enterRelease = resolve; });
  const ready = { sessionId: 'session-1', state: 'ready', elapsedMs: 400, error: null, result: { uri: 'file:///cache/native.wav', durationMs: 400, sampleRate: 44100, channels: 1, frames: 17640, peak: 0.5, rms: 0.2, quiet: false } };
  const state = {
    platform: { OS: 'android', Version: 36 }, openGate,
    statuses: [], startCalls: [], stopCalls: [], cancelCalls: [], releaseCalls: [], openCalls: [], sources: [], disposed: [], events: [],
    module: {
      async start(sessionId) { state.sessionId = sessionId; state.startCalls.push(sessionId); return { sessionId, state: 'recording', elapsedMs: 0, error: null }; },
      async getStatus() { const status = { ...(state.statuses.shift() ?? ready), sessionId: state.sessionId }; state.events.push(`status:${status.state}`); return status; },
      async stop(sessionId) { state.stopCalls.push(sessionId); return { ...(state.stopStatus ?? ready), sessionId }; },
      async cancel(sessionId) { state.cancelCalls.push(sessionId); state.events.push('cancel'); },
      async release(sessionId) { state.releaseCalls.push(sessionId); state.events.push(`release:${state.events.filter((item) => item.startsWith('status:')).at(-1) ?? 'none'}`); enterRelease(); if (state.releaseGate) await state.releaseGate; },
    }, ...overrides,
  };
  globalThis.__deviceAudio = state;
  const replacements = { "from 'expo';": `from '${await writeModule(directory, 'expo.mjs', fakeExpo)}';`, "from 'expo-file-system';": `from '${await writeModule(directory, 'file-system.mjs', fakeFileSystem)}';`, "from 'react-native';": `from '${await writeModule(directory, 'react-native.mjs', fakeReactNative)}';`, "from './localAudio';": `from '${await writeModule(directory, 'localAudio.mjs', fakeLocalAudio)}';` };
  let source = await readFile(join(appRoot, 'src/media/deviceAudioCapture.ts'), 'utf8');
  for (const [from, to] of Object.entries(replacements)) source = source.replace(from, to);
  const modulePath = join(directory, 'deviceAudioCapture.ts');
  await writeFile(modulePath, source);
  return { state, releaseOpen: () => releaseOpen?.(), releaseEntered, load: () => import(pathToFileURL(modulePath).href) };
}

async function writeModule(directory, name, content) {
  const path = join(directory, name);
  await writeFile(path, content);
  return pathToFileURL(path).href;
}

test('capability is limited to Android 10+ with the Expo module present', async (t) => {
  const h = await harness(t);
  const { isDeviceAudioCaptureSupported } = await h.load();
  assert.equal(isDeviceAudioCaptureSupported(), true);
  h.state.platform.OS = 'ios';
  assert.equal(isDeviceAudioCaptureSupported(), false);
  h.state.platform.OS = 'android'; h.state.platform.Version = 28;
  assert.equal(isDeviceAudioCaptureSupported(), false);
});

test('notification completion is consumed once and native WAV is released after staging', async (t) => {
  const h = await harness(t);
  const { createDeviceAudioCaptureController } = await h.load();
  const controller = createDeviceAudioCaptureController();
  const started = await controller.start();
  assert.equal(started.state, 'recording');
  const status = await controller.refresh();
  assert.equal(status.state, 'ready');
  const [first, second] = await Promise.all([controller.consumeReady(), controller.consumeReady()]);
  assert.equal(first.source, second.source);
  assert.equal(first.quiet, false);
  assert.equal(h.state.openCalls.length, 1);
  const { isDeviceAudioSourceAlreadyOwned } = await h.load();
  assert.equal(isDeviceAudioSourceAlreadyOwned(first.source, first.source, null), true);
  assert.equal(isDeviceAudioSourceAlreadyOwned(first.source, null, first.source), true);
  assert.equal(isDeviceAudioSourceAlreadyOwned(first.source, null, null), false);
  assert.deepEqual(h.state.openCalls[0], { uri: 'file:///cache/native.wav', title: 'Device audio recording', metadata: { name: 'device-recording.wav', mimeType: 'audio/wav' } });
  assert.deepEqual(h.state.releaseCalls, [started.sessionId]);
  const again = await controller.consumeReady();
  assert.equal(again.source, first.source);
  assert.equal(h.state.openCalls.length, 1);
});

test('Stop polls a finalizing native result before staging it', async (t) => {
  const h = await harness(t);
  const ready = { state: 'ready', elapsedMs: 450, error: null, result: { uri: 'file:///cache/native.wav', durationMs: 450, sampleRate: 44100, channels: 1, frames: 19845, peak: 0.4, rms: 0.1, quiet: false } };
  h.state.stopStatus = { sessionId: 'session-1', state: 'recording', elapsedMs: 450, error: null };
  h.state.statuses = [{ state: 'recording', elapsedMs: 450, error: null }, ready];
  const { createDeviceAudioCaptureController } = await h.load();
  const controller = createDeviceAudioCaptureController();
  await controller.start();
  const adopted = await controller.stop();
  assert.equal(adopted.source.id, 'staged-source');
  assert.equal(h.state.stopCalls.length, 1);
  assert.equal(h.state.releaseCalls.length, 1);
});

test('an older status response cannot replace a newer ready result', async (t) => {
  const h = await harness(t);
  const { createDeviceAudioCaptureController } = await h.load();
  const controller = createDeviceAudioCaptureController();
  await controller.start();
  let resolveOlder;
  let call = 0;
  h.state.module.getStatus = () => {
    call += 1;
    if (call === 1) return new Promise((resolve) => { resolveOlder = () => resolve({ sessionId: h.state.sessionId, state: 'recording', elapsedMs: 100, error: null }); });
    return Promise.resolve({ sessionId: h.state.sessionId, state: 'ready', elapsedMs: 400, error: null, result: { uri: 'file:///cache/native.wav', durationMs: 400, sampleRate: 44100, channels: 1, frames: 17640, peak: 0.5, rms: 0.2, quiet: false } });
  };
  const olderRefresh = controller.refresh();
  const newerRefresh = await controller.refresh();
  assert.equal(newerRefresh.state, 'ready');
  resolveOlder();
  await olderRefresh;
  assert.equal(controller.getStatus().state, 'ready');
  assert.equal(controller.getStatus().result.durationMs, 400);
});

test('cancelling while a result is being staged aborts adoption and releases the native original once', async (t) => {
  const h = await harness(t, { openPending: true });
  const { createDeviceAudioCaptureController } = await h.load();
  const controller = createDeviceAudioCaptureController();
  await controller.start();
  await controller.refresh();
  const transfer = controller.consumeReady();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await controller.cancel();
  await assert.rejects(transfer, { name: 'AbortError' });
  assert.deepEqual(h.state.releaseCalls, [h.state.startCalls[0]]);
  assert.deepEqual(h.state.disposed, []);
});

test('cancellation during native release disposes the staged source and rejects adoption', async (t) => {
  let finishRelease;
  const releaseGate = new Promise((resolve) => { finishRelease = resolve; });
  const h = await harness(t, { releaseGate });
  const { createDeviceAudioCaptureController } = await h.load();
  const controller = createDeviceAudioCaptureController();
  await controller.start();
  await controller.refresh();
  const transfer = controller.consumeReady();
  await h.releaseEntered;
  const cancelling = controller.cancel();
  finishRelease();
  await assert.rejects(transfer, { name: 'AbortError' });
  await cancelling;
  assert.equal(h.state.disposed.length, 1);
  assert.equal(h.state.releaseCalls.length, 1);
});

test('cancel waits for native cancellation to reach a terminal state before release', async (t) => {
  const h = await harness(t);
  h.state.statuses = [{ state: 'stopping', elapsedMs: 0, error: null }, { state: 'cancelled', elapsedMs: 0, error: null }];
  const { createDeviceAudioCaptureController } = await h.load();
  const controller = createDeviceAudioCaptureController();
  await controller.start();
  await Promise.all([controller.cancel(), controller.cancel()]);
  assert.deepEqual(h.state.cancelCalls, [h.state.startCalls[0]]);
  assert.deepEqual(h.state.releaseCalls, [h.state.startCalls[0]]);
  assert.ok(h.state.events.indexOf('release:status:cancelled') > h.state.events.indexOf('status:cancelled'));
  assert.equal(controller.getStatus().state, 'cancelled');
});
