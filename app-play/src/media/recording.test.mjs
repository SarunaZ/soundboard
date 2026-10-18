import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const fakeAudio = `
const state = globalThis.__recording;
export const RecordingPresets = { HIGH_QUALITY: { extension: '.m4a', sampleRate: 44100, numberOfChannels: 2, bitRate: 128000, android: { outputFormat: 'mpeg4', audioEncoder: 'aac' }, ios: { audioQuality: 1 }, web: {} } };
export const modes = state.modes;
export async function getRecordingPermissionsAsync() { state.permissionChecks += 1; return state.currentPermission; }
export async function requestRecordingPermissionsAsync() { state.permissionCalls += 1; return state.permission; }
export async function setAudioModeAsync(mode) { state.modes.push(mode); }
class FakeRecorder {
  constructor(options) { state.recorderOptions.push(options); state.recorder = this; this.uri = null; this.isRecording = false; this.duration = 0; }
  async prepareToRecordAsync(options) {
    state.prepareOptions.push(options);
    if (state.prepareGate) await state.prepareGate;
    this.uri = state.outputUri;
    state.files.set(this.uri, state.recordingBytes);
  }
  record(options) { state.recordOptions.push(options); this.isRecording = true; this.duration = 250; }
  async stop() { state.stopCalls += 1; this.isRecording = false; }
  getStatus() { return { canRecord: true, isRecording: this.isRecording, durationMillis: this.duration, mediaServicesDidReset: false, url: this.uri }; }
  release() { state.releaseCalls += 1; }
}
export const AudioModule = { AudioRecorder: FakeRecorder };
`;

const fakeFileSystem = `
const state = globalThis.__recording;
export const Paths = { cache: { uri: 'file:///cache' } };
export class File {
  constructor(uri) { this.uri = uri; }
  get exists() { return state.files.has(this.uri); }
  get size() { return state.files.get(this.uri)?.byteLength ?? 0; }
  delete() { state.deleteCalls += 1; state.files.delete(this.uri); }
}
`;

const fakeReactNative = `export const Platform = { OS: 'android' };`;

const fakeLocalAudio = `
const state = globalThis.__recording;
export async function openLocalAudioFile(file, signal, title) {
  state.openCalls.push({ uri: file.uri, size: file.size, title });
  if (state.openGate) {
    await new Promise((resolve, reject) => {
      state.openGate.then(resolve, reject);
      signal?.addEventListener('abort', () => { const e = new Error('cancelled'); e.name = 'AbortError'; reject(e); }, { once: true });
    });
  }
  if (signal?.aborted) { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; }
  if (!file.exists || file.size === 0) throw new Error('empty recording');
  const source = { id: 'recording-source', uri: 'file:///cache/editor/source.m4a', title, durationMs: 250, peaks: [0.5] };
  state.source = source;
  return source;
}
export async function disposeLocalAudioSource(source) { state.disposed.push(source); }
export async function renderLocalAudioRange(source, startMs, endMs) {
  if (source !== state.source) throw new Error('Recording source was not accepted by trim pipeline.');
  state.trimCalls.push({ startMs, endMs });
  return { uri: 'file:///cache/editor/render.wav', startMs, endMs, durationMs: endMs - startMs };
}
export const MAX_LOCAL_AUDIO_SOURCE_BYTES = 32 * 1024 * 1024;
export const MAX_LOCAL_AUDIO_SOURCE_MS = 5 * 60_000;
`;

async function harness(t, overrides = {}) {
  const directory = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? '.', 'soundboard-recording-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let releasePrepare;
  let releaseOpen;
  const prepareGate = overrides.preparePending ? new Promise((resolve) => { releasePrepare = resolve; }) : null;
  const openGate = overrides.openPending ? new Promise((resolve) => { releaseOpen = resolve; }) : null;
  const state = {
    permission: { granted: true }, currentPermission: { granted: true }, permissionChecks: 0, permissionCalls: 0, modes: [], recorderOptions: [], prepareOptions: [], recordOptions: [],
    prepareGate, openGate, outputUri: 'file:///cache/recording.m4a', files: new Map(), stopCalls: 0, releaseCalls: 0,
    deleteCalls: 0, openCalls: [], disposed: [], trimCalls: [], recorder: null, recordingBytes: new Uint8Array([1, 2, 3, 4]),
    ...overrides,
  };
  globalThis.__recording = state;
  const files = {
    'fake-audio.mjs': fakeAudio,
    'fake-file-system.mjs': fakeFileSystem,
    'fake-react-native.mjs': fakeReactNative,
    'fake-local-audio.mjs': fakeLocalAudio,
  };
  const urls = {};
  for (const [name, content] of Object.entries(files)) {
    const path = join(directory, name);
    await writeFile(path, content);
    urls[name] = pathToFileURL(path).href;
  }
  const source = (await readFile(join(appRoot, 'src/media/recording.ts'), 'utf8'))
    .replace("from 'expo-audio';", `from '${urls['fake-audio.mjs']}';`)
    .replace("from 'expo-file-system';", `from '${urls['fake-file-system.mjs']}';`)
    .replace("from 'react-native';", `from '${urls['fake-react-native.mjs']}';`)
    .replace("from './localAudio';", `from '${urls['fake-local-audio.mjs']}';`);
  const modulePath = join(directory, 'recording.ts');
  await writeFile(modulePath, source);
  return {
    state,
    releasePrepare: () => releasePrepare?.(),
    releaseOpen: () => releaseOpen?.(),
    load: () => import(pathToFileURL(modulePath).href),
    loadLocalAudio: () => import(urls['fake-local-audio.mjs']),
  };
}

test('permission is requested only on start and denial explains how to proceed', async (t) => {
  const { state, load } = await harness(t, { permission: { granted: false }, currentPermission: { granted: false } });
  const { createLocalAudioRecorder } = await load();
  const controller = createLocalAudioRecorder();
  assert.equal(state.permissionCalls, 0);
  await assert.rejects(controller.start(), /Allow microphone access in your device settings/);
  assert.equal(state.permissionChecks, 1);
  assert.equal(state.permissionCalls, 1);
  assert.equal(state.recorder, null);
  assert.equal(state.files.size, 0);
});

test('stopping transfers a source that remains usable by trim after recorder disposal', async (t) => {
  const { state, load, loadLocalAudio } = await harness(t);
  const { createLocalAudioRecorder } = await load();
  const controller = createLocalAudioRecorder();
  await controller.start();
  assert.equal(state.permissionChecks, 1);
  assert.equal(state.permissionCalls, 0);
  assert.equal(controller.getStatus().isRecording, true);
  assert.equal(state.recorderOptions[0].directory, 'cache');
  assert.equal(state.recorderOptions[0].maxFileSize, 32 * 1024 * 1024);
  assert.equal(state.recorderOptions[0].outputFormat, 'mpeg4');
  assert.equal('android' in state.recorderOptions[0], false);
  assert.equal(state.recordOptions[0].forDuration, 300);
  const source = await controller.stop();
  assert.equal(source.title, 'Microphone recording');
  assert.equal(state.openCalls.length, 1);
  assert.equal(state.openCalls[0].uri, state.outputUri);
  assert.equal(state.openCalls[0].title, 'Microphone recording');
  assert.equal(state.files.has(state.outputUri), false);
  await controller.dispose();
  await controller.cancel();
  assert.equal(state.disposed.length, 0);
  // The fake trim adapter verifies the returned source works with the trim API contract.
  const localAudio = await loadLocalAudio();
  const render = await localAudio.renderLocalAudioRange(source, 0, 250);
  assert.equal(render.durationMs, 250);
  assert.deepEqual(state.trimCalls, [{ startMs: 0, endMs: 250 }]);
  assert.equal(controller.getStatus().isRecording, false);
  assert.equal(state.modes[0].allowsRecording, true);
  assert.equal(state.modes.at(-1).allowsRecording, false);
});

test('cancelling during preparation stops the pending session and removes its private cache output', async (t) => {
  const h = await harness(t, { preparePending: true });
  const { createLocalAudioRecorder } = await h.load();
  const controller = createLocalAudioRecorder();
  const starting = controller.start();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const cancelling = controller.cancel();
  h.releasePrepare();
  await assert.rejects(starting, { name: 'AbortError' });
  await cancelling;
  assert.equal(h.state.files.has(h.state.outputUri), false);
  assert.equal(h.state.releaseCalls, 1);
  assert.equal(h.state.modes.at(-1).allowsRecording, false);
});

test('empty recordings are rejected and their cache file is removed', async (t) => {
  const { state, load } = await harness(t, { recordingBytes: new Uint8Array() });
  const { createLocalAudioRecorder } = await load();
  const controller = createLocalAudioRecorder();
  await controller.start();
  await assert.rejects(controller.stop(), /recording is empty/i);
  assert.equal(state.openCalls.length, 0);
  assert.equal(state.files.has(state.outputUri), false);
  assert.equal(state.modes.at(-1).allowsRecording, false);
});

test('foreground interruption cleanup is idempotent and never touches files outside its cache URI', async (t) => {
  const h = await harness(t, { outputUri: 'content://user-picked/file.m4a' });
  const { createLocalAudioRecorder } = await h.load();
  const controller = createLocalAudioRecorder();
  await controller.start();
  h.state.files.set(h.state.outputUri, new Uint8Array([9, 9]));
  await Promise.all([controller.cancel(), controller.cancel()]);
  await controller.dispose();
  assert.equal(h.state.files.has(h.state.outputUri), true);
  assert.equal(h.state.deleteCalls, 0);
  assert.equal(h.state.stopCalls, 1);
});

test('cancel during file import aborts the stop and cleans up without duplicate output', async (t) => {
  const h = await harness(t, { openPending: true });
  const { createLocalAudioRecorder } = await h.load();
  const controller = createLocalAudioRecorder();
  await controller.start();
  const stopping = controller.stop();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const cancelling = controller.cancel();
  await assert.rejects(stopping, { name: 'AbortError' });
  await cancelling;
  assert.equal(h.state.openCalls.length, 1);
  assert.equal(h.state.files.has(h.state.outputUri), false);
  assert.equal(h.state.disposed.length, 0);
  assert.equal(h.state.releaseCalls, 1);
});

test('repeated stop returns the same source and repeated cancel does not repeat native stop', async (t) => {
  const h = await harness(t);
  const { createLocalAudioRecorder } = await h.load();
  const controller = createLocalAudioRecorder();
  await controller.start();
  const first = controller.stop();
  const second = controller.stop();
  const [sourceA, sourceB] = await Promise.all([first, second]);
  assert.equal(sourceA, sourceB);
  assert.equal(h.state.openCalls.length, 1);
  await Promise.all([controller.cancel(), controller.cancel()]);
  assert.equal(h.state.stopCalls, 1);
  assert.deepEqual(h.state.disposed, [sourceA]);
});
