import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sourceUri = 'content://com.android.providers.downloads.documents/document/100003';

const fakeFileSystemSource = `
const joinUri = (base, child) => String(base).replace(/\\/+$/, '') + '/' + String(child).replace(/^\\/+/, '');
export const Paths = { document: 'file:///documents', cache: 'file:///cache' };
export class Directory {
  constructor(...parts) { this.uri = parts.map((part) => part?.uri ?? part).reduce((base, part) => base === undefined ? String(part) : joinUri(base, part), undefined); }
  get exists() { return globalThis.__deviceImport.files.has(this.uri) || globalThis.__deviceImport.directories.has(this.uri); }
  create({ idempotent = false } = {}) {
    if (this.exists && !idempotent) throw new Error('Directory already exists.');
    globalThis.__deviceImport.directories.add(this.uri);
  }
  list() {
    const prefix = this.uri.replace(/\\/+$/, '') + '/';
    return [...globalThis.__deviceImport.files.keys()].filter((uri) => uri.startsWith(prefix) && !uri.slice(prefix.length).includes('/')).map((uri) => new File(uri));
  }
  delete() {
    globalThis.__deviceImport.directories.delete(this.uri);
    const prefix = this.uri.replace(/\\/+$/, '') + '/';
    for (const uri of [...globalThis.__deviceImport.files.keys()]) if (uri.startsWith(prefix)) globalThis.__deviceImport.files.delete(uri);
  }
}
export class File {
  constructor(...parts) { this.uri = parts.map((part) => part?.uri ?? part).reduce((base, part) => base === undefined ? String(part) : joinUri(base, part), undefined); }
  static async pickFileAsync(options) { globalThis.__deviceImport.options = options; return globalThis.__deviceImport.pickerResult; }
  get name() { return this.uri.startsWith('content://') ? this.uri.split('/').at(-1) : (globalThis.__deviceImport.files.get(this.uri)?.displayName ?? this.uri.split('/').at(-1)); }
  get type() { return globalThis.__deviceImport.files.get(this.uri)?.type ?? null; }
  get size() { const file = globalThis.__deviceImport.files.get(this.uri); return file?.sizeOverride !== undefined || (file && 'sizeOverride' in file && file.sizeOverride === null) ? file.sizeOverride : file?.content?.length ?? null; }
  get exists() { return globalThis.__deviceImport.files.has(this.uri); }
  create() {
    if (this.exists) throw new Error('File already exists.');
    globalThis.__deviceImport.files.set(this.uri, { content: '', displayName: this.uri.split('/').at(-1), type: null });
  }
  async copy(destination, { overwrite = false } = {}) {
    const source = globalThis.__deviceImport.files.get(this.uri);
    if (!source) throw new Error('Source not found.');
    const targetUri = destination instanceof Directory ? joinUri(destination.uri, source.displayName) : destination.uri;
    const existing = globalThis.__deviceImport.files.get(targetUri);
    if (existing && !overwrite) throw new Error('Destination exists.');
    globalThis.__deviceImport.copyCount += 1;
    globalThis.__deviceImport.files.set(targetUri, { content: source.content, displayName: targetUri.split('/').at(-1), type: source.type });
    if (globalThis.__deviceImport.failCopyAt === globalThis.__deviceImport.copyCount) throw new Error('Simulated copy failure.');
  }
  delete() { globalThis.__deviceImport.files.delete(this.uri); }
}
`;

const fakeAudioSource = `
export function createAudioPlayer(uri) {
  const state = globalThis.__deviceImport;
  state.playerUris.push(uri);
  const player = {
    currentStatus: { error: null, duration: 0, isLoaded: false },
    addListener(_event, listener) {
      state.playerListenerCount += 1;
      if (!state.neverLoad) setTimeout(() => {
        player.currentStatus = { error: state.decodeError ? 'decode failed' : null, duration: state.playerDuration, isLoaded: !state.decodeError };
        listener(player.currentStatus);
      }, state.loadDelay ?? 0);
      return { remove() { state.playerListenerCount -= 1; } };
    },
    remove() { state.playerRemoveCount += 1; },
  };
  return player;
}
`;

const fakeAudioContextSource = `
export default class AudioContext {
  decodeAudioData() {
    const state = globalThis.__deviceImport;
    state.boardDecodeCount += 1;
    if (state.boardDecodeError) return Promise.reject(new Error('unsupported codec'));
    return Promise.resolve({ duration: state.boardDuration, numberOfChannels: 2, length: 100 });
  }
  async close() { globalThis.__deviceImport.contextCloseCount += 1; }
}
`;

async function harness(t) {
  const directory = await mkdtemp(join(tmpdir(), 'soundboard-device-import-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const state = {
    files: new Map(), directories: new Set(['file:///cache', 'file:///documents']),
    copyCount: 0, failCopyAt: null, pickerResult: null, playerDuration: 3.25,
    boardDuration: 3.25, playerUris: [], playerListenerCount: 0, playerRemoveCount: 0,
    boardDecodeCount: 0, contextCloseCount: 0, decodeError: false, boardDecodeError: false,
    neverLoad: false, options: null, capacityChecks: 0, capacityFull: false,
  };
  globalThis.__deviceImport = state;
  const paths = {};
  for (const [name, source] of Object.entries({
    'fake-fs.mjs': fakeFileSystemSource,
    'fake-audio.mjs': fakeAudioSource,
    'fake-context.mjs': fakeAudioContextSource,
    'fake-library.mjs': `export function assertLibraryCapacity() { globalThis.__deviceImport.capacityChecks += 1; if (globalThis.__deviceImport.capacityFull) throw new Error('The library is full. It can hold up to 1000 soundbites.'); }\nexport function commitImportedClip(entry) { globalThis.__deviceImport.committed.push(entry); return { ...entry, uri: 'file:///documents/local-clips/' + entry.id + '.' + entry.extension, missing: false }; }\n`,
  })) {
    paths[name] = join(directory, name);
    await writeFile(paths[name], source);
  }
  state.committed = [];
  const fakeFsUrl = pathToFileURL(paths['fake-fs.mjs']).href;
  const fakeAudioUrl = pathToFileURL(paths['fake-audio.mjs']).href;
  const fakeContextUrl = pathToFileURL(paths['fake-context.mjs']).href;
  const fakeLibraryUrl = pathToFileURL(paths['fake-library.mjs']).href;
  const validationUrl = pathToFileURL(join(appRoot, 'src/editor/importValidation.ts')).href;
  const catalogUrl = pathToFileURL(join(appRoot, 'src/editor/catalog.ts')).href;
  const protocolUrl = pathToFileURL(join(appRoot, 'src/editor/protocol.ts')).href;
  const source = (await readFile(join(appRoot, 'src/editor/deviceImport.ts'), 'utf8'))
    .replace("from 'expo-audio';", `from '${fakeAudioUrl}';`)
    .replace("from 'expo-file-system';", `from '${fakeFsUrl}';`)
    .replace("from './library';", `from '${fakeLibraryUrl}';`)
    .replace("from './importValidation';", `from '${validationUrl}';`)
    .replace("from './catalog';", `from '${catalogUrl}';`)
    .replace("from './protocol';", `from '${protocolUrl}';`)
    .replace("from 'react-native-audio-api/lib/module/core/AudioContext';", `from '${fakeContextUrl}';`);
  const modulePath = join(directory, 'deviceImport.ts');
  await writeFile(modulePath, source);
  const fs = await import(fakeFsUrl);
  return { state, fs, async load() { return import(pathToFileURL(modulePath).href); } };
}

function addSource(state, { displayName = 'Downloaded song.mp3', type = 'audio/mpeg', sizeOverride, content = 'valid mp3 bytes' } = {}) {
  state.files.set(sourceUri, { displayName, type, sizeOverride, content });
}

test('cancellation returns null without copying or committing anything', async (t) => {
  const { state, load } = await harness(t);
  state.pickerResult = { canceled: true, result: null };
  const result = await (await load()).importDeviceAudio(new AbortController().signal);
  assert.equal(result, null);
  assert.equal(state.copyCount, 0);
  assert.deepEqual(state.committed, []);
});

test('library capacity is checked before opening the device picker', async (t) => {
  const { state, load } = await harness(t);
  state.capacityFull = true;
  await assert.rejects((await load()).importDeviceAudio(new AbortController().signal), /library is full.*1000/);
  assert.equal(state.capacityChecks, 1);
  assert.equal(state.options, null);
  assert.equal(state.copyCount, 0);
  assert.deepEqual(state.committed, []);
});

test('imports sequential mixed formats with actual names and durations while preserving picker sources', async (t) => {
  const { state, fs, load } = await harness(t);
  const importer = await load();
  addSource(state, { displayName: 'Band practice.mp3', type: 'audio/mpeg' });
  state.pickerResult = { canceled: false, result: new fs.File(sourceUri) };
  const mp3 = await importer.importDeviceAudio(new AbortController().signal);
  assert.equal(mp3.title, 'Band practice');
  assert.equal(mp3.extension, 'mp3');
  assert.equal(mp3.durationMs, 3250);
  assert.equal(state.files.has(sourceUri), true);
  assert.match(mp3.uri, /[0-9a-f-]{36}\.mp3$/);

  state.playerDuration = 1.5;
  state.boardDuration = 1.5;
  addSource(state, { displayName: 'Room tone.wav', type: 'audio/wav', content: 'wav bytes' });
  state.pickerResult = { canceled: false, result: new fs.File(sourceUri) };
  const wav = await importer.importDeviceAudio(new AbortController().signal);
  assert.equal(wav.title, 'Room tone');
  assert.equal(wav.extension, 'wav');
  assert.equal(wav.durationMs, 1500);
  assert.match(wav.uri, /[0-9a-f-]{36}\.wav$/);
  assert.equal(state.files.has(sourceUri), true);
  assert.equal(state.committed.length, 2);
  assert.ok(state.boardDecodeCount === 2 && state.contextCloseCount === 2);
  assert.equal(state.playerRemoveCount, 2);
  assert.equal(state.playerListenerCount, 0);
  assert.deepEqual(state.options, { mimeTypes: ['audio/*'], multipleFiles: false });
  assert.equal([...state.directories].some((uri) => uri.includes('soundboard-import-')), false);
});

test('opaque picker URIs use the provider MIME type and generic title fallback', async (t) => {
  const { state, fs, load } = await harness(t);
  addSource(state, { displayName: '100003', type: 'audio/mp4' });
  state.pickerResult = { canceled: false, result: new fs.File(sourceUri) };
  const clip = await (await load()).importDeviceAudio(new AbortController().signal);
  assert.equal(clip.title, 'Imported sound');
  assert.equal(clip.extension, 'm4a');
});

test('rejects unsupported, unknown-size, empty, and oversized files before copying', async (t) => {
  const { state, fs, load } = await harness(t);
  const importer = await load();
  for (const source of [
    { displayName: 'audio.flac', type: 'audio/flac' },
    { displayName: 'song.mp3', type: 'audio/mpeg', sizeOverride: null },
    { displayName: 'song.mp3', type: 'audio/mpeg', content: '' },
    { displayName: 'song.mp3', type: 'audio/mpeg', sizeOverride: 10 * 1024 * 1024 + 1 },
  ]) {
    addSource(state, source);
    state.pickerResult = { canceled: false, result: new fs.File(sourceUri) };
    await assert.rejects(importer.importDeviceAudio(new AbortController().signal));
    assert.equal(state.copyCount, 0);
    assert.deepEqual(state.committed, []);
  }
});

test('decode and duration failures remove only owned local copies and release probe resources', async (t) => {
  const { state, fs, load } = await harness(t);
  const importer = await load();
  addSource(state);
  state.pickerResult = { canceled: false, result: new fs.File(sourceUri) };
  state.boardDecodeError = true;
  await assert.rejects(importer.importDeviceAudio(new AbortController().signal), /soundboard could not decode/);
  assert.equal(state.files.has(sourceUri), true);
  assert.equal([...state.files.keys()].some((uri) => uri.includes('/local-clips/')), false);
  assert.deepEqual(state.committed, []);
  assert.equal(state.contextCloseCount, 1);
  assert.equal(state.playerRemoveCount, 1);

  state.boardDecodeError = false;
  state.playerDuration = 61;
  state.boardDuration = 61;
  state.pickerResult = { canceled: false, result: new fs.File(sourceUri) };
  await assert.rejects(importer.importDeviceAudio(new AbortController().signal), /60 seconds/);
  assert.equal([...state.files.keys()].some((uri) => uri.includes('/local-clips/')), false);
  assert.deepEqual(state.committed, []);
});

test('aborting during decoder readiness removes owned files and releases the player', async (t) => {
  const { state, fs, load } = await harness(t);
  addSource(state);
  state.pickerResult = { canceled: false, result: new fs.File(sourceUri) };
  state.neverLoad = true;
  const controller = new AbortController();
  const pending = (await load()).importDeviceAudio(controller.signal);
  await new Promise((resolve) => setTimeout(resolve, 10));
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(state.files.has(sourceUri), true);
  assert.equal([...state.files.keys()].some((uri) => uri.includes('/local-clips/')), false);
  assert.deepEqual(state.committed, []);
  assert.equal(state.playerRemoveCount, 1);
  assert.equal(state.playerListenerCount, 0);
});

test('partial copy failure cleans its owned stage and destination but keeps the picked source', async (t) => {
  const { state, fs, load } = await harness(t);
  addSource(state);
  state.pickerResult = { canceled: false, result: new fs.File(sourceUri) };
  state.failCopyAt = 2;
  await assert.rejects((await load()).importDeviceAudio(new AbortController().signal), /Simulated copy failure/);
  assert.equal(state.files.has(sourceUri), true);
  assert.equal([...state.files.keys()].some((uri) => uri.includes('/local-clips/')), false);
  assert.equal([...state.files.keys()].some((uri) => uri.includes('soundboard-import-')), false);
  assert.deepEqual(state.committed, []);
});

test('staging directory collision does not delete or overwrite an existing directory', async (t) => {
  const { state, fs, load } = await harness(t);
  t.mock.method(Math, 'random', () => 0.5);
  addSource(state);
  state.pickerResult = { canceled: false, result: new fs.File(sourceUri) };
  const stagingUri = 'file:///cache/soundboard-import-88888888-8888-4888-8888-888888888888';
  state.directories.add(stagingUri);
  state.files.set(`${stagingUri}/keep.txt`, { content: 'keep', displayName: 'keep.txt', type: 'text/plain' });
  await assert.rejects((await load()).importDeviceAudio(new AbortController().signal), /Directory already exists/);
  assert.equal(state.directories.has(stagingUri), true);
  assert.equal(state.files.get(`${stagingUri}/keep.txt`)?.content, 'keep');
  assert.equal(state.files.has(sourceUri), true);
  assert.equal(state.copyCount, 0);
});
