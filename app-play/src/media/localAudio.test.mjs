import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { encodePcm16WavSlice, LOCAL_AUDIO_SAMPLE_RATE, waveformPeaks } from '../../../app-client/src/editor/localAudioPcm.ts';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const appClientRoot = resolve(appRoot, '../app-client');
const contentUri = 'content://com.android.providers.downloads.documents/document/100003';

const fakeFileSystemSource = `
const joinUri = (base, child) => String(base).replace(/\\/+$/, '') + '/' + String(child).replace(/^\\/+/, '');
export const Paths = { document: 'file:///documents', cache: { uri: 'file:///cache' } };
export class Directory {
  constructor(...parts) { this.uri = parts.map((part) => part?.uri ?? part).reduce((base, part) => base === undefined ? String(part) : joinUri(base, part), undefined); }
  get name() { return this.uri.split('/').at(-1); }
  get exists() { return globalThis.__localAudio.directories.has(this.uri); }
  create({ idempotent = false } = {}) { const s = globalThis.__localAudio; if (s.failLibraryDirectoryCreate && this.uri.endsWith('/play-library')) throw new Error('Simulated library directory failure.'); if (this.exists && !idempotent) throw new Error('Directory already exists.'); s.directories.add(this.uri); }
  list() { const s = globalThis.__localAudio; const prefix = this.uri.replace(/\\/+$/, '') + '/'; const files = [...s.files.keys()].filter((uri) => uri.startsWith(prefix) && !uri.slice(prefix.length).includes('/')).map((uri) => new File(uri)); const directories = [...s.directories].filter((uri) => uri.startsWith(prefix) && !uri.slice(prefix.length).includes('/')).map((uri) => new Directory(uri)); return [...directories, ...files]; }
  delete() { globalThis.__localAudio.directories.delete(this.uri); const prefix = this.uri.replace(/\\/+$/, '') + '/'; for (const uri of [...globalThis.__localAudio.files.keys()]) if (uri.startsWith(prefix)) globalThis.__localAudio.files.delete(uri); }
}
export class File {
  constructor(...parts) { this.uri = parts.map((part) => part?.uri ?? part).reduce((base, part) => base === undefined ? String(part) : joinUri(base, part), undefined); }
  get name() { return this.uri.split('/').at(-1); }
  get type() { return globalThis.__localAudio.files.get(this.uri)?.type ?? null; }
  get size() { return globalThis.__localAudio.files.get(this.uri)?.bytes.length ?? null; }
  get exists() { return globalThis.__localAudio.files.has(this.uri); }
  create() { if (this.exists) throw new Error('File already exists.'); globalThis.__localAudio.files.set(this.uri, { displayName: this.uri.split('/').at(-1), type: null, bytes: new Uint8Array() }); }
  async copy(destination, { overwrite = false } = {}) {
    const state = globalThis.__localAudio; const source = state.files.get(this.uri); if (!source) throw new Error('Source not found.');
    if (destination instanceof Directory && this.uri.startsWith('content://')) throw new Error('Cannot resolve java.io.File name for content URI.');
    const uri = destination instanceof Directory ? joinUri(destination.uri, source.displayName) : destination.uri;
    if (state.files.has(uri) && !overwrite) throw new Error('Destination exists.');
    state.files.set(uri, { displayName: uri.split('/').at(-1), type: source.type, bytes: new Uint8Array(source.bytes) });
    state.copyCount += 1; if (state.failCopyAt === state.copyCount) throw new Error('Simulated copy failure.');
  }
  write(bytes) { const file = globalThis.__localAudio.files.get(this.uri); if (!file) throw new Error('File not found.'); file.bytes = new Uint8Array(bytes); }
  delete() { if (globalThis.__localAudio.failDeleteUri === this.uri) throw new Error('Simulated file delete failure.'); globalThis.__localAudio.files.delete(this.uri); }
}
export const PLAY_LIBRARY_DIRECTORY = new Directory(Paths.document, 'play-library');
`;

const fakeAudioSource = `
export function createAudioPlayer(uri) {
  const state = globalThis.__localAudio; state.playerUris.push(uri);
  const player = { currentStatus: { error: null, duration: state.metadataDuration, isLoaded: !state.neverLoad }, addListener(_event, listener) {
    state.playerListeners += 1;
    if (!state.neverLoad) setTimeout(() => listener(player.currentStatus), 0);
    return { remove() { state.playerListeners -= 1; } };
  }, remove() { state.playerRemoves += 1; } };
  return player;
}
`;

const fakeDocumentPickerSource = `
export async function getDocumentAsync(options) {
  const state = globalThis.__localAudio; state.pickerOptions = options;
  if (state.pickerError) throw state.pickerError;
  const result = state.pickerPromise ? await state.pickerPromise : state.pickerResult;
  const asset = !result.canceled ? result.assets?.[0] : null;
  if (asset && !state.files.has(asset.uri)) {
    const source = state.files.get(state.providerUri);
    state.files.set(asset.uri, { displayName: asset.name, type: asset.mimeType, bytes: new Uint8Array(source?.bytes ?? []) });
  }
  return result;
}
`;

const fakeContextSource = `
export default class AudioContext {
  constructor(options) { globalThis.__localAudio.contextOptions.push(options); }
  decodeAudioData(uri) {
    const state = globalThis.__localAudio; state.decodeUris.push(uri);
    if (state.decodeError) return Promise.reject(new Error('bad audio'));
    if (state.decodeNeverSettles) return new Promise(() => {});
    const buffer = { duration: state.bufferDuration, numberOfChannels: state.channels.length, length: state.channels[0].length, sampleRate: state.sampleRate,
      getChannelData(index) { return state.channels[index]; } };
    return state.decodeGate ? state.decodeGate.then(() => buffer) : Promise.resolve(buffer);
  }
  async close() { globalThis.__localAudio.contextCloses += 1; }
}
`;

async function harness(t, { seconds = 4, channels = 2, sparse = false, fastWaveform = false } = {}) {
  const directory = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? '.', 'soundboard-local-audio-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const length = seconds * LOCAL_AUDIO_SAMPLE_RATE;
  const channelData = Array.from({ length: channels }, (_, channel) => {
    if (sparse) return new Proxy({ length }, { get(target, key) { if (key === 'length') return target.length; if (typeof key === 'string' && /^\d+$/.test(key)) return 0; return undefined; } });
    const samples = new Float32Array(length);
    for (let index = 0; index < length; index += 1) samples[index] = channel === 0 ? -1.25 : 0.5;
    return samples;
  });
  const state = {
    files: new Map(), directories: new Set(['file:///cache', 'file:///documents']), pickerResult: null, pickerError: null, pickerPromise: null,
    metadataDuration: seconds, bufferDuration: seconds, sampleRate: LOCAL_AUDIO_SAMPLE_RATE, channels: channelData,
    contextOptions: [], contextCloses: 0, decodeUris: [], decodeError: false, decodeNeverSettles: false, decodeGate: null,
    playerUris: [], playerListeners: 0, playerRemoves: 0, pickerOptions: null, copyCount: 0, failCopyAt: null,
    capacityChecks: 0, capacityFull: false, committed: [], failLibraryDirectoryCreate: false, failDeleteUri: null,
  };
  globalThis.__localAudio = state;
  const fakePaths = {};
  for (const [name, source] of Object.entries({
    'fake-fs.mjs': fakeFileSystemSource,
    'fake-audio.mjs': fakeAudioSource,
    'fake-document-picker.mjs': fakeDocumentPickerSource,
    'fake-context.mjs': fakeContextSource,
    'fake-pcm.mjs': `export const LOCAL_AUDIO_SAMPLE_RATE = 44100; export const LOCAL_AUDIO_MAX_CHANNELS = 2; export const LOCAL_AUDIO_MAX_RENDER_MS = 60000; export const LOCAL_AUDIO_MIN_RENDER_MS = 100; export async function waveformPeaks(_channels, _frames, bins = 256) { return Array(bins).fill(0); } export async function encodePcm16WavSlice() { return new Uint8Array(44); }`,
  'fake-library.mjs': `export function assertLibraryCapacity() { const s = globalThis.__localAudio; s.capacityChecks += 1; if (s.capacityFull) throw new Error('Library is full.'); }\nexport function commitImportedClip(entry) { const s = globalThis.__localAudio; const uri = 'file:///documents/play-library/' + entry.id + '.wav'; if (!s.files.has(uri)) throw new Error('Missing final file.'); s.committed.push(entry); return { ...entry, uri, missing: false }; }\n`,
  })) {
    fakePaths[name] = join(directory, name);
    await writeFile(fakePaths[name], source);
  }
  const urls = Object.fromEntries(Object.entries(fakePaths).map(([name, path]) => [name, pathToFileURL(path).href]));
  const source = (await readFile(join(appRoot, 'src/media/localAudio.ts'), 'utf8'))
    .replace("from 'expo-audio';", `from '${urls['fake-audio.mjs']}';`)
    .replace("from 'expo-document-picker';", `from '${urls['fake-document-picker.mjs']}';`)
    .replace("from 'expo-file-system';", `from '${urls['fake-fs.mjs']}';`)
    .replace("from 'react-native-audio-api/lib/module/core/AudioContext';", `from '${urls['fake-context.mjs']}';`)
    .replace("from '../data/library';", `from '${urls['fake-library.mjs']}';`)
    .replace("from '../data/snapshot';", `from '${urls['fake-fs.mjs']}';`)
    .replace("from '../data/importValidation';", `from '${pathToFileURL(join(appRoot, 'src/data/importValidation.ts')).href}';`)
    .replace("from '../data/catalog';", `from '${pathToFileURL(join(appClientRoot, 'src/editor/catalog.ts')).href}';`)
    .replace("from '../data/protocol';", `from '${pathToFileURL(join(appRoot, 'src/data/protocol.ts')).href}';`)
    .replace("from '../../../app-client/src/editor/localAudioPcm.ts';", fastWaveform ? `from '${urls['fake-pcm.mjs']}';` : `from '${pathToFileURL(join(appClientRoot, 'src/editor/localAudioPcm.ts')).href}';`);
  const modulePath = join(directory, 'localAudio.ts');
  await writeFile(modulePath, source);
  state.files.set(contentUri, { displayName: 'Downloaded song.mp3', type: 'audio/mpeg', bytes: new Uint8Array([1, 2, 3, 4]) });
  state.providerUri = contentUri;
  const pickerCacheUri = 'file:///cache/DocumentPicker/abc123.mp3';
  state.pickerCacheUri = pickerCacheUri;
  state.pickerResult = { canceled: false, assets: [{ uri: pickerCacheUri, name: 'Downloaded song.mp3', mimeType: 'audio/mpeg', size: 4 }] };
  return { state, async load() { return import(pathToFileURL(modulePath).href); } };
}

test('PCM WAV encoding writes a real slice with a valid header, interleaving, and clipped samples', async () => {
  const left = Float32Array.from([-1.5, -0.5, 0, 0.5, 1.5]);
  const right = Float32Array.from([0.5, -0.5, 1, -1, 0]);
  const bytes = await encodePcm16WavSlice([left, right], 1, 4, 48_000);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...bytes.slice(8, 12)), 'WAVE');
  assert.equal(view.getUint32(24, true), 48_000);
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(40, true), 12);
  assert.deepEqual(Array.from({ length: 6 }, (_, index) => view.getInt16(44 + index * 2, true)), [-16384, -16384, 0, 32767, 16384, -32768]);
  assert.equal(bytes.byteLength, 56);
});

test('PCM encoder rejects invalid ranges, excessive channels, and selections above 60 seconds', async () => {
  const data = new Float32Array(61 * LOCAL_AUDIO_SAMPLE_RATE);
  await assert.rejects(encodePcm16WavSlice([data], -1, 20), /valid audio range/);
  await assert.rejects(encodePcm16WavSlice([data], 0, 61 * LOCAL_AUDIO_SAMPLE_RATE), /60 seconds/);
  await assert.rejects(encodePcm16WavSlice([data, data, data], 0, 10), /channel count/);
  await assert.rejects(encodePcm16WavSlice([new Float32Array(100)], 0, 101), /past the audio source/);
});

test('waveform peaks use per-bin absolute maxima and bound invalid input', async () => {
  const peaks = await waveformPeaks([Float32Array.from([0, -0.5, 0.25, 1, 0])], 5, 3);
  assert.deepEqual(peaks, [0, 0.5, 1]);
  await assert.rejects(waveformPeaks([], 5), /decoded audio data is invalid/);
});

test('stages a DocumentPicker cache copy, preserves asset metadata, and leaves the provider source untouched', async (t) => {
  const { state, load } = await harness(t, { seconds: 75 });
  state.metadataDuration = 75;
  const editor = await load();
  const source = await editor.pickLocalAudioSource();
  assert.equal(source.durationMs, 75_000);
  assert.equal(source.title, 'Downloaded song');
  assert.equal(source.peaks.length, 256);
  assert.equal(state.files.has(contentUri), true);
  assert.equal(state.files.get(contentUri).bytes.length, 4);
  assert.match(source.uri, /soundboard-editor-[0-9a-f-]{36}\/source\.mp3$/);
  assert.deepEqual(state.contextOptions, [{ sampleRate: 44_100 }]);
  assert.deepEqual(state.pickerOptions, { type: ['audio/*', 'video/mp4', 'video/quicktime'], multiple: false, copyToCacheDirectory: true });
  assert.equal(state.files.has(state.pickerCacheUri), false);
  assert.equal(state.playerRemoves, 1);
  await editor.disposeLocalAudioSource(source);
  assert.equal(state.files.has(source.uri), false);
});

test('opens a caller-provided MP3 through the same owned staging path and safely normalizes title override', async (t) => {
  const { state, load } = await harness(t);
  const editor = await load();
  // The caller can provide any Expo File instance; the mock below models its public surface.
  const selected = { uri: contentUri, name: '100003', type: 'audio/mpeg', size: 4, exists: true,
    async copy(destination) {
      const target = destination.uri;
      state.files.set(target, { displayName: 'Downloaded song.mp3', type: 'audio/mpeg', bytes: new Uint8Array(state.files.get(contentUri).bytes) });
      state.copyCount += 1;
    } };
  const source = await editor.openLocalAudioFile(selected, undefined, `  ${'A'.repeat(120)}\u0000  `);
  assert.equal(source.title, 'A'.repeat(100));
  assert.match(source.uri, /soundboard-editor-[0-9a-f-]{36}\/source\.mp3$/);
  assert.equal(state.files.has(contentUri), true);
  assert.equal(state.copyCount, 1);
  await editor.disposeLocalAudioSource(source);
});

test('picker cancellation retains the current draft while a replacement is opened nondestructively', async (t) => {
  const { state, load } = await harness(t);
  const editor = await load();
  const selected = { uri: contentUri, name: 'Downloaded song.mp3', type: 'audio/mpeg', size: 4, exists: true,
    async copy(destination) { state.files.set(destination.uri, { displayName: 'Downloaded song.mp3', type: 'audio/mpeg', bytes: new Uint8Array([1, 2, 3, 4]) }); } };
  const current = await editor.openLocalAudioFile(selected);
  state.pickerResult = { canceled: true, assets: [] };
  assert.equal(await editor.pickLocalAudioSource(), null);
  assert.equal(state.files.has(current.uri), true);
  const replacement = await editor.openLocalAudioFile(selected);
  assert.equal(state.files.has(current.uri), true, 'the current source remains until replacement is accepted');
  assert.equal(state.files.has(replacement.uri), true);
  await editor.renderLocalAudioRange(current, 0, 1_000);
  await editor.disposeLocalAudioSource(current);
  await editor.disposeLocalAudioSource(replacement);
});

test('aggregate PCM preflight rejects an oversized replacement and preserves the current draft', async (t) => {
  const { state, load } = await harness(t, { seconds: 280, sparse: true, fastWaveform: true });
  const editor = await load();
  const makeSelected = () => ({ uri: contentUri, name: 'Downloaded song.mp3', type: 'audio/mpeg', size: 4, exists: true,
    async copy(destination) { state.files.set(destination.uri, { displayName: 'Downloaded song.mp3', type: 'audio/mpeg', bytes: new Uint8Array([1, 2, 3, 4]) }); } });
  const current = await editor.openLocalAudioFile(makeSelected());
  const decodeCount = state.decodeUris.length;
  state.metadataDuration = 101;
  state.bufferDuration = 101;
  state.channels = Array.from({ length: 2 }, () => new Proxy({ length: 101 * LOCAL_AUDIO_SAMPLE_RATE }, { get(target, key) { if (key === 'length') return target.length; if (typeof key === 'string' && /^\d+$/.test(key)) return 0; return undefined; } }));
  await assert.rejects(editor.openLocalAudioFile(makeSelected()), /Save or discard the current draft.*unchanged/);
  assert.equal(state.decodeUris.length, decodeCount, 'the replacement is rejected before decoding');
  assert.equal(state.files.has(current.uri), true, 'the rejected replacement leaves the current audio source intact');
  await editor.disposeLocalAudioSource(current);
});

test('preflights oversized and overlong sources before copy or decode', async (t) => {
  const { state, load } = await harness(t);
  const editor = await load();
  state.pickerResult.assets[0].size = 32 * 1024 * 1024 + 1;
  await assert.rejects(editor.pickLocalAudioSource(), /32 MB/);
  assert.equal(state.copyCount, 0);
  assert.equal(state.files.has(state.pickerCacheUri), false);
  assert.equal(state.decodeUris.length, 0);

  state.pickerResult.assets[0].size = 4;
  state.metadataDuration = 301;
  await assert.rejects(editor.pickLocalAudioSource(), /5 minutes/);
  assert.equal(state.decodeUris.length, 0);
  assert.equal(state.files.has(state.pickerCacheUri), false);
  assert.equal([...state.directories].some((uri) => uri.includes('soundboard-editor-')), false);
});

test('rejects unsupported channel counts and removes the staged source copy', async (t) => {
  const { state, load } = await harness(t, { channels: 3 });
  const editor = await load();
  await assert.rejects(editor.pickLocalAudioSource(), /channel count is not supported/);
  assert.equal(state.files.has(contentUri), true);
  assert.equal([...state.files.keys()].some((uri) => uri.includes('soundboard-editor-')), false);
  assert.equal(state.contextCloses, 1);
});

test('renders and saves the actual selected PCM16 WAV slice with confirmed duration', async (t) => {
  const { state, load } = await harness(t);
  const editor = await load();
  const source = await editor.pickLocalAudioSource();
  const render = await editor.renderLocalAudioRange(source, 1_000, 2_500);
  assert.equal(render.startMs, 1_000);
  assert.equal(render.endMs, 2_500);
  assert.equal(render.durationMs, 1_500);
  const renderedFile = state.files.get(render.uri);
  const wav = renderedFile.bytes;
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF');
  assert.equal(view.getUint32(24, true), LOCAL_AUDIO_SAMPLE_RATE);
  assert.equal(view.getUint32(40, true), 1_500 * 44.1 * 4);
  assert.equal(wav.byteLength, 44 + 1_500 * 44.1 * 4);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(46, true), 16384);
  const saved = await editor.saveLocalAudioRender(source, render, '  My trimmed clip  ');
  assert.equal(saved.title, 'My trimmed clip');
  assert.equal(saved.extension, 'wav');
  assert.equal(saved.durationMs, 1_500);
  assert.deepEqual(state.files.get(saved.uri).bytes, wav);
  assert.equal(state.capacityChecks, 1);
  assert.equal(state.committed.length, 1);
  assert.equal(state.files.has(contentUri), true);
  await editor.disposeLocalAudioSource(source);
  assert.equal(state.files.has(render.uri), false);
  assert.equal(state.files.has(saved.uri), true);
});

test('rerender invalidates stale handles, enforces min/max duration, and save accepts only the current render', async (t) => {
  const { state, load } = await harness(t);
  const editor = await load();
  const source = await editor.pickLocalAudioSource();
  await assert.rejects(editor.renderLocalAudioRange(source, 0, 50), /at least 100 ms/);
  await assert.rejects(editor.renderLocalAudioRange(source, 0, 60_001), /valid audio range/);
  const oldRender = await editor.renderLocalAudioRange(source, 0, 1_000);
  const currentRender = await editor.renderLocalAudioRange(source, 2_000, 3_000);
  assert.equal(state.files.has(oldRender.uri), false);
  await assert.rejects(editor.saveLocalAudioRender(source, oldRender, 'Old'), /Render the selected range again/);
  await assert.rejects(editor.saveLocalAudioRender(source, currentRender, '  '), /name/);
  assert.equal(state.committed.length, 0);
  await editor.disposeLocalAudioSource(source);
});

test('fractional-frame range boundaries keep an exact 60 second slice within the duration cap', async (t) => {
  const { load } = await harness(t, { seconds: 61 });
  const editor = await load();
  const source = await editor.pickLocalAudioSource();
  const render = await editor.renderLocalAudioRange(source, 1, 60_001);
  assert.equal(render.durationMs, 60_000);
  assert.equal(render.endMs - render.startMs, 60_000);
  await editor.disposeLocalAudioSource(source);
});

test('a source shorter than 100 ms can render fully when its displayed duration rounds down', async (t) => {
  const { load } = await harness(t, { seconds: 0.0993 });
  const editor = await load();
  const source = await editor.pickLocalAudioSource();
  assert.equal(source.durationMs, 99);
  const render = await editor.renderLocalAudioRange(source, 0, source.durationMs);
  assert.equal(render.durationMs, 99.297052);
  assert.equal(render.startMs, 0);
  assert.equal(render.endMs, render.durationMs);
  await editor.disposeLocalAudioSource(source);
});

test('sample-aligned 100 ms range survives rounded bounds and can be rendered again unchanged', async (t) => {
  const { load } = await harness(t, { seconds: 2 });
  const editor = await load();
  const source = await editor.pickLocalAudioSource();
  const startMs = Number((1_234 * 1000 / LOCAL_AUDIO_SAMPLE_RATE).toFixed(6));
  const endMs = Number((5_644 * 1000 / LOCAL_AUDIO_SAMPLE_RATE).toFixed(6));
  const first = await editor.renderLocalAudioRange(source, startMs, endMs);
  assert.equal(first.durationMs, 100);
  const second = await editor.renderLocalAudioRange(source, first.startMs, first.endMs);
  assert.equal(second.startMs, first.startMs);
  assert.equal(second.endMs, first.endMs);
  assert.equal(second.durationMs, first.durationMs);
  await editor.disposeLocalAudioSource(source);
});

test('render cleanup and save setup failures release operation locks for retry', async (t) => {
  const { state, load } = await harness(t);
  const editor = await load();
  const source = await editor.pickLocalAudioSource();
  const firstRender = await editor.renderLocalAudioRange(source, 0, 1_000);
  state.failDeleteUri = firstRender.uri;
  await assert.rejects(editor.renderLocalAudioRange(source, 1_000, 2_000), /Simulated file delete failure/);
  state.failDeleteUri = null;
  const render = await editor.renderLocalAudioRange(source, 1_000, 2_000);
  state.failLibraryDirectoryCreate = true;
  await assert.rejects(editor.saveLocalAudioRender(source, render, 'Retry'), /Simulated library directory failure/);
  state.failLibraryDirectoryCreate = false;
  assert.equal((await editor.saveLocalAudioRender(source, render, 'Retry')).title, 'Retry');
  await editor.disposeLocalAudioSource(source);
});

test('cancellation during decode releases the context and owned cache copy', async (t) => {
  const { state, load } = await harness(t);
  state.decodeNeverSettles = true;
  const editor = await load();
  const controller = new AbortController();
  const pending = editor.pickLocalAudioSource(controller.signal);
  for (let attempts = 0; attempts < 500 && state.decodeUris.length === 0; attempts += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(state.decodeUris.length, 1, 'abort only after the native decoder has started');
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(state.files.has(contentUri), true);
  assert.equal([...state.files.keys()].some((uri) => uri.includes('soundboard-editor-')), false);
  assert.equal(state.contextCloses, 2);
});

test('aborted native decode retains its slot until the native promise settles', async (t) => {
  const { state, load } = await harness(t);
  let settleNativeDecode;
  state.decodeGate = new Promise((resolve) => { settleNativeDecode = resolve; });
  const editor = await load();
  const selected = { uri: contentUri, name: 'Downloaded song.mp3', type: 'audio/mpeg', size: 4, exists: true,
    async copy(destination) { state.files.set(destination.uri, { displayName: 'Downloaded song.mp3', type: 'audio/mpeg', bytes: new Uint8Array([1, 2, 3, 4]) }); } };
  const controller = new AbortController();
  const abortedOpen = editor.openLocalAudioFile(selected, controller.signal);
  while (state.decodeUris.length === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  await assert.rejects(abortedOpen, { name: 'AbortError' });
  await assert.rejects(editor.openLocalAudioFile(selected), /still finishing from a cancelled import/);
  assert.equal(state.decodeUris.length, 1, 'a second native decode does not start while the first is active');
  settleNativeDecode();
  await new Promise((resolve) => setImmediate(resolve));
  const retry = await editor.openLocalAudioFile(selected);
  assert.equal(state.decodeUris.length, 2, 'a settled native decode releases the slot for retry');
  await editor.disposeLocalAudioSource(retry);
});

test('disposing during a render aborts work, waits for it to settle, and removes all owned cache files', async (t) => {
  const { state, load } = await harness(t, { seconds: 30 });
  const editor = await load();
  const source = await editor.pickLocalAudioSource();
  const rendering = editor.renderLocalAudioRange(source, 0, 30_000);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await editor.disposeLocalAudioSource(source);
  await assert.rejects(rendering, { name: 'AbortError' });
  assert.equal([...state.files.keys()].some((uri) => uri.includes('soundboard-editor-')), false);
  await assert.rejects(editor.renderLocalAudioRange(source, 0, 1_000), /no longer available/);
});

test('capacity and failed final copy leave the catalog and user source unchanged', async (t) => {
  const { state, load } = await harness(t);
  const editor = await load();
  const source = await editor.pickLocalAudioSource();
  const render = await editor.renderLocalAudioRange(source, 0, 1_000);
  state.capacityFull = true;
  await assert.rejects(editor.saveLocalAudioRender(source, render, 'Full'), /Library is full/);
  state.capacityFull = false;
  state.failCopyAt = state.copyCount + 1;
  await assert.rejects(editor.saveLocalAudioRender(source, render, 'Copy failure'), /Simulated copy failure/);
  assert.equal(state.committed.length, 0);
  assert.equal(state.files.has(contentUri), true);
  assert.equal([...state.files.keys()].some((uri) => uri.startsWith('file:///documents/local-clips/')), false);
  await editor.disposeLocalAudioSource(source);
});

test('picker cancellation has no staging or catalog effects', async (t) => {
  const { state, load } = await harness(t);
  state.pickerResult = { canceled: true, assets: null };
  const source = await (await load()).pickLocalAudioSource();
  assert.equal(source, null);
  assert.equal(state.copyCount, 0);
  assert.equal(state.decodeUris.length, 0);
  assert.deepEqual(state.committed, []);
  assert.equal(state.files.has(state.pickerCacheUri), false);
});

test('picker launch failures surface to the caller instead of appearing as cancellation', async (t) => {
  const { state, load } = await harness(t);
  state.pickerError = new Error('Simulated picker launch failure.');
  await assert.rejects((await load()).pickLocalAudioSource(), /picker launch failure/);
});

test('aborting while the picker is open deletes only the returned cache copy', async (t) => {
  const { state, load } = await harness(t);
  let resolvePicker;
  state.pickerPromise = new Promise((resolve) => { resolvePicker = resolve; });
  const editor = await load();
  const controller = new AbortController();
  const pending = editor.pickLocalAudioSource(controller.signal);
  controller.abort();
  resolvePicker(state.pickerResult);
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(state.files.has(state.pickerCacheUri), false);
  assert.equal(state.files.has(contentUri), true);
});

test('only a returned DocumentPicker cache file is cleaned up', async (t) => {
  const { state, load } = await harness(t);
  const sharedCacheUri = 'file:///cache/artwork/image.mp3';
  state.files.set(sharedCacheUri, { displayName: 'image.mp3', type: 'audio/mpeg', bytes: new Uint8Array([1, 2, 3, 4]) });
  state.pickerResult = { canceled: false, assets: [{ uri: sharedCacheUri, name: 'Background audio.mp3', mimeType: 'audio/mpeg', size: 4 }] };
  const editor = await load();
  const source = await editor.pickLocalAudioSource();
  assert.equal(state.files.has(sharedCacheUri), true);
  assert.equal(source.title, 'Background audio');
  await editor.disposeLocalAudioSource(source);
});
