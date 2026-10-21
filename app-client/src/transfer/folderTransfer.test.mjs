import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const appRoot = join(process.cwd(), 'app-client');
const parentUri = 'content://picked/parent';

const fakeFsSource = `
export const FileMode = { ReadOnly: 'r', WriteOnly: 'w' };
const state = globalThis.__transfer;
function joinUri(base, name) { return base.replace(/\\/$/, '') + '/' + name; }
export class File {
  constructor(uri) { this.uri = typeof uri === 'string' ? uri : uri.uri; }
  get name() { return this.uri.split('/').at(-1); }
  get exists() { return state.files.has(this.uri); }
  get size() { const row = state.files.get(this.uri); return row ? (row.sizeOverride ?? row.bytes.length) : 0; }
  text() { return Promise.resolve(new TextDecoder().decode(state.files.get(this.uri)?.bytes ?? new Uint8Array())); }
  write(value) { const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value; state.files.set(this.uri, { bytes: Uint8Array.from(bytes) }); state.created.push(this.uri); }
  create() { if (this.exists) throw new Error('already exists'); state.files.set(this.uri, { bytes: new Uint8Array() }); state.created.push(this.uri); }
  delete() { state.files.delete(this.uri); }
  open(mode) {
    const row = state.files.get(this.uri);
    if (!row) throw new Error('file missing');
    let offset = 0;
    return {
      readBytes(length) {
        state.readRequests.push(length);
        if (state.abortOnRead) { state.abortOnRead(); state.abortOnRead = null; }
        const chunk = row.bytes.slice(offset, offset + length); offset += chunk.length; return chunk;
      },
      writeBytes(chunk) {
        let bytes = Uint8Array.from(chunk);
        if (state.truncateWrite && bytes.length) bytes = bytes.slice(0, Math.max(0, bytes.length - 1));
        const output = new Uint8Array(offset + bytes.length); output.set(row.bytes.slice(0, offset)); output.set(bytes, offset); row.bytes = output; offset += bytes.length;
      },
      close() {},
    };
  }
}
export class Directory {
  constructor(uri) { this.uri = uri; }
  static async pickDirectoryAsync() { if (state.pickerError) throw state.pickerError; return state.pickedDirectory; }
  get name() { return this.uri.split('/').at(-1); }
  get exists() { return state.directories.has(this.uri); }
  createDirectory(name) { const uri = joinUri(this.uri, name); if (state.directories.has(uri)) throw new Error('directory exists'); const dir = new Directory(uri); state.directories.add(uri); state.created.push(uri); return dir; }
  createFile(name, _mime) { const uri = joinUri(this.uri, name); if (state.files.has(uri)) throw new Error('file exists'); const file = new File(uri); state.files.set(uri, { bytes: new Uint8Array() }); state.created.push(uri); return file; }
  list() {
    const prefix = this.uri.replace(/\\/$/, '') + '/';
    const found = [];
    for (const uri of state.directories) if (uri.startsWith(prefix) && !uri.slice(prefix.length).includes('/')) found.push(new Directory(uri));
    for (const uri of state.files.keys()) if (uri.startsWith(prefix) && !uri.slice(prefix.length).includes('/')) found.push(new File(uri));
    return found;
  }
  delete() {
    state.directories.delete(this.uri);
    const prefix = this.uri.replace(/\\/$/, '') + '/';
    for (const uri of [...state.directories]) if (uri.startsWith(prefix)) state.directories.delete(uri);
    for (const uri of [...state.files.keys()]) if (uri.startsWith(prefix)) state.files.delete(uri);
  }
}
`;

async function harness(t) {
  const temp = await mkdtemp(join(tmpdir(), 'soundboard-folder-transfer-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const state = {
    files: new Map(), directories: new Set([parentUri]), created: [], readRequests: [],
    pickedDirectory: null, pickerError: null, abortOnRead: null, truncateWrite: false,
  };
  globalThis.__transfer = state;
  const fakePath = join(temp, 'fake-fs.mjs');
  const modulePath = join(temp, 'folderTransfer.ts');
  await writeFile(fakePath, fakeFsSource);
  const original = await readFile(join(appRoot, 'src/transfer/folderTransfer.ts'), 'utf8');
  const fsUrl = pathToFileURL(fakePath).href;
  const source = original
    .replace("from 'expo-file-system';", `from '${fsUrl}';`);
  await writeFile(modulePath, source);
  const fake = await import(fsUrl);
  return { state, fs: fake, async load() { return import(`${pathToFileURL(modulePath).href}?${Math.random()}`); } };
}

function audioBytes(size = 100) {
  const bytes = new Uint8Array(size);
  bytes.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);
  for (let i = 12; i < bytes.length; i++) bytes[i] = (i * 31) & 0xff;
  return bytes;
}

function savedClip(uri, changes = {}) {
  return {
    id: '810c3c00-067b-4c7c-9de7-d1da1d7367e9', title: 'Test sound', durationMs: 1200,
    createdAt: '2026-10-20T00:00:00.000Z', extension: 'm4a', uri, missing: false, ...changes,
  };
}

test('exports a folder with UUID audio and manifest committed last; source bytes remain unchanged', async (t) => {
  const { state, fs, load } = await harness(t);
  const sourceUri = 'file:///private/clips/810c3c00-067b-4c7c-9de7-d1da1d7367e9.m4a';
  const originalBytes = audioBytes(200_000);
  state.files.set(sourceUri, { bytes: originalBytes.slice() });
  state.pickedDirectory = new fs.Directory(parentUri);
  const api = await load();
  const result = await api.exportClipsToFolder([savedClip(sourceUri)]);
  assert.equal(result.count, 1);
  const folder = result.folderUri;
  assert.match(folder, /Soundboard-transfer-/);
  const audioUri = `${folder}/810c3c00-067b-4c7c-9de7-d1da1d7367e9.m4a`;
  const manifestUri = `${folder}/manifest.json`;
  assert.deepEqual(state.files.get(audioUri).bytes, originalBytes);
  assert.deepEqual(state.files.get(sourceUri).bytes, originalBytes);
  assert.ok(state.created.indexOf(manifestUri) > state.created.indexOf(audioUri));
  assert.ok(Math.max(...state.readRequests) <= api.TRANSFER_CHUNK_BYTES);
  assert.equal(JSON.parse(new TextDecoder().decode(state.files.get(manifestUri).bytes)).clips[0].sizeBytes, originalBytes.length);
});

test('export rejects empty, missing, oversized and duplicate-ID libraries before creating a folder', async (t) => {
  const { state, fs, load } = await harness(t);
  state.pickedDirectory = new fs.Directory(parentUri);
  const api = await load();
  await assert.rejects(api.exportClipsToFolder([]), /no saved clips/);
  await assert.rejects(api.exportClipsToFolder([savedClip('file:///missing.m4a')]), /missing/);
  const uri = 'file:///private/large.m4a';
  state.files.set(uri, { bytes: audioBytes(12), sizeOverride: api.MAX_TRANSFER_FILE_BYTES + 1 });
  await assert.rejects(api.exportClipsToFolder([savedClip(uri)]), /32 MiB/);
  const same = 'file:///private/a.m4a';
  state.files.set(same, { bytes: audioBytes(12) });
  await assert.rejects(api.exportClipsToFolder([savedClip(same), savedClip(same)]), /duplicate IDs/);
  assert.deepEqual([...state.directories], [parentUri]);
});

test('clips and total transfer limits are enforced; existing colliding folders are preserved', async (t) => {
  const { state, fs, load } = await harness(t);
  state.pickedDirectory = new fs.Directory(parentUri);
  const api = await load();
  const uri = 'file:///private/small.m4a';
  state.files.set(uri, { bytes: audioBytes(12) });
  await assert.rejects(api.exportClipsToFolder(Array.from({ length: api.MAX_TRANSFER_CLIPS + 1 }, () => savedClip(uri))), /up to 1000/);
  const large = Array.from({ length: 17 }, (_, index) => {
    const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const fileUri = `file:///private/${id}.m4a`;
    state.files.set(fileUri, { bytes: audioBytes(12), sizeOverride: api.MAX_TRANSFER_FILE_BYTES });
    return savedClip(fileUri, { id });
  });
  await assert.rejects(api.exportClipsToFolder(large), /larger than 512 MiB/);
  assert.deepEqual([...state.directories], [parentUri]);

  let time = 1000;
  t.mock.method(Date, 'now', () => time++);
  t.mock.method(Math, 'random', () => 0.5);
  const old = new fs.Directory(parentUri).createDirectory('Soundboard-transfer-3e8-8');
  old.createFile('keep.txt', 'text/plain').write('keep');
  const collision = state.files.get(`${old.uri}/keep.txt`).bytes.slice();
  const result = await api.exportClipsToFolder([savedClip(uri)]);
  assert.notEqual(result.folderUri, old.uri);
  assert.deepEqual(state.files.get(`${old.uri}/keep.txt`).bytes, collision);
});

test('picker cancellation returns null and picker failures propagate', async (t) => {
  const { state, fs, load } = await harness(t);
  const api = await load();
  state.pickerError = Object.assign(new Error('Native picker cancelled'), { code: 'ERR_PICKER_CANCELLED' });
  assert.equal(await api.pickTransferFolder(), null);
  state.pickerError = new Error('Call to function Directory.pickDirectoryAsync rejected. The file picker was cancelled by the user');
  assert.equal(await api.pickTransferFolder(), null);
  state.pickerError = Object.assign(new Error('Native picker cancelled'), { code: 'ERR_PICKING_CANCELLED' });
  assert.equal(await api.pickTransferFolder(), null);
  state.pickerError = new Error('The file picker could not open because permission was denied');
  await assert.rejects(api.pickTransferFolder(), /permission was denied/);
  state.pickerError = new Error('permission denied');
  await assert.rejects(api.pickTransferFolder(), /permission denied/);
  const sourceUri = 'file:///private/810c3c00-067b-4c7c-9de7-d1da1d7367e9.m4a';
  state.files.set(sourceUri, { bytes: audioBytes() });
  await assert.rejects(api.exportClipsToFolder([savedClip(sourceUri)]), /permission denied/);
  assert.deepEqual([...state.directories], [parentUri]);
});

test('picked transfer validates manifest and copies compatible media with CRC verification', async (t) => {
  const { state, fs, load } = await harness(t);
  const api = await load();
  const originalUri = 'file:///private/810c3c00-067b-4c7c-9de7-d1da1d7367e9.m4a';
  const bytes = audioBytes(4096);
  state.files.set(originalUri, { bytes: bytes.slice() });
  state.pickedDirectory = new fs.Directory(parentUri);
  const exported = await api.exportClipsToFolder([savedClip(originalUri)]);
  state.pickedDirectory = new fs.Directory(exported.folderUri);
  const picked = await api.pickTransferFolder();
  const entry = picked.manifest.clips[0];
  const destination = new fs.File('file:///private/new-copy.m4a');
  await api.copyTransferEntry(picked, entry, destination);
  assert.deepEqual(state.files.get(destination.uri).bytes, bytes);
  assert.deepEqual(state.files.get(originalUri).bytes, bytes);
  assert.equal(picked.manifest.format, 'soundboard-transfer');
});

test('corruption, truncation and cancellation remove only the owned destination and failed export folder', async (t) => {
  const { state, fs, load } = await harness(t);
  const api = await load();
  const sourceUri = 'file:///private/810c3c00-067b-4c7c-9de7-d1da1d7367e9.m4a';
  const original = audioBytes(100_000);
  state.files.set(sourceUri, { bytes: original.slice() });
  state.pickedDirectory = new fs.Directory(parentUri);
  const output = await api.exportClipsToFolder([savedClip(sourceUri)]);
  const corruptedUri = `${output.folderUri}/810c3c00-067b-4c7c-9de7-d1da1d7367e9.m4a`;
  state.files.get(corruptedUri).bytes[50] ^= 0xff;
  state.pickedDirectory = new fs.Directory(output.folderUri);
  const picked = await api.pickTransferFolder();
  const entry = picked.manifest.clips[0];
  const dest = new fs.File('file:///private/corrupt-copy.m4a');
  await assert.rejects(api.copyTransferEntry(picked, entry, dest), /checksum/);
  assert.equal(dest.exists, false);
  assert.equal(state.files.get(sourceUri).bytes[50], original[50]);

  state.pickedDirectory = new fs.Directory(parentUri);
  const cleanExport = await api.exportClipsToFolder([savedClip(sourceUri)]);
  state.pickedDirectory = new fs.Directory(cleanExport.folderUri);
  const cleanPick = await api.pickTransferFolder();
  const cleanEntry = cleanPick.manifest.clips[0];
  const truncated = new fs.File('file:///private/truncated-copy.m4a');
  state.truncateWrite = true;
  await assert.rejects(api.copyTransferEntry(cleanPick, cleanEntry, truncated));
  state.truncateWrite = false;
  assert.equal(truncated.exists, false);

  const importController = new AbortController();
  const cancelled = new fs.File('file:///private/cancelled-copy.m4a');
  state.abortOnRead = () => importController.abort();
  await assert.rejects(api.copyTransferEntry(cleanPick, cleanEntry, cancelled, importController.signal), { name: 'AbortError' });
  assert.equal(cancelled.exists, false);

  const controller = new AbortController();
  state.pickedDirectory = new fs.Directory(parentUri);
  state.abortOnRead = () => controller.abort();
  await assert.rejects(api.exportClipsToFolder([savedClip(sourceUri)], controller.signal), { name: 'AbortError' });
  assert.equal(state.directories.has(output.folderUri), true);
  assert.deepEqual(new Set([...state.directories].filter((uri) => uri.startsWith(`${parentUri}/Soundboard-transfer-`))), new Set([output.folderUri, cleanExport.folderUri]));
  assert.equal(state.files.get(sourceUri).bytes[50], original[50]);
});

test('invalid and partial manifests, duplicate IDs, unsafe entries and missing files are rejected', async (t) => {
  const { state, fs, load } = await harness(t);
  const api = await load();
  const folder = new fs.Directory(parentUri).createDirectory('manual-transfer');
  state.pickedDirectory = folder;
  const manifest = (clips) => ({ format: 'soundboard-transfer', version: 1, clips });
  const entry = {
    id: '810c3c00-067b-4c7c-9de7-d1da1d7367e9', title: 'Test sound', durationMs: 1200,
    createdAt: '2026-10-20T00:00:00.000Z', extension: 'm4a', sizeBytes: 100, crc32: 1,
  };
  folder.createFile('manifest.json', 'application/json').write('{"format":');
  await assert.rejects(api.pickTransferFolder(), /incomplete/);
  state.files.delete(`${folder.uri}/manifest.json`);
  folder.createFile('manifest.json', 'application/json').write(JSON.stringify(manifest([entry, { ...entry }])));
  await assert.rejects(api.pickTransferFolder(), /duplicate IDs/);
  state.files.get(`${folder.uri}/manifest.json`).bytes = new TextEncoder().encode(JSON.stringify(manifest([{ ...entry, id: '../escape' }])));
  await assert.rejects(api.pickTransferFolder(), /invalid ID/);
  state.files.get(`${folder.uri}/manifest.json`).bytes = new TextEncoder().encode(JSON.stringify(manifest([entry])));
  await assert.rejects(api.pickTransferFolder(), /missing or incomplete/);
  assert.equal(state.files.has(`${folder.uri}/../escape.m4a`), false);
});

test('rejects a header that conflicts with its extension and cleans its partial export', async (t) => {
  const { state, fs, load } = await harness(t);
  const api = await load();
  const uri = 'file:///private/wrong-header.m4a';
  const bytes = audioBytes(); bytes.set([0, 0, 0, 0], 4);
  state.files.set(uri, { bytes });
  state.pickedDirectory = new fs.Directory(parentUri);
  await assert.rejects(api.exportClipsToFolder([savedClip(uri)]), /header does not match/);
  assert.equal(state.files.has(uri), true);
  assert.deepEqual([...state.directories], [parentUri]);
});
