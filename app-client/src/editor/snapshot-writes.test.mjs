import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { applyBoardAssignments } from '../board/assignments.ts';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const boardPath = 'file:///documents/local-clips/board.json';
const backupBoardPath = 'file:///documents/local-clips/board.backup.json';
const catalogPath = 'file:///documents/local-clips/catalog.json';
const backupCatalogPath = 'file:///documents/local-clips/catalog.backup.json';
const audioPath = (id, extension = 'm4a') => `file:///documents/local-clips/${id}.${extension}`;
const clipA = '123e4567-e89b-42d3-a456-426614174000';
const clipB = '123e4567-e89b-42d3-b456-426614174001';

const fakeFileSystemSource = `
const joinUri = (base, child) => String(base).replace(/\\/+$/, '') + '/' + String(child).replace(/^\\/+/, '');
export const Paths = { document: 'file:///documents', cache: 'file:///cache' };
export class Directory {
  constructor(...parts) { this.uri = parts.map((part) => part?.uri ?? part).reduce((base, part) => base === undefined ? String(part) : joinUri(base, part), undefined); }
  create() {}
}
export class File {
  constructor(...parts) { this.uri = parts.map((part) => part?.uri ?? part).reduce((base, part) => base === undefined ? String(part) : joinUri(base, part), undefined); }
  get exists() { return globalThis.__fakeExpoFs.files.has(this.uri); }
  get size() { return new TextEncoder().encode(globalThis.__fakeExpoFs.files.get(this.uri) ?? '').length; }
  create({ overwrite = false } = {}) {
    if (this.exists && !overwrite) throw new Error('File already exists.');
    if (overwrite || !this.exists) globalThis.__fakeExpoFs.files.set(this.uri, '');
  }
  write(value) { globalThis.__fakeExpoFs.files.set(this.uri, String(value)); }
  textSync() {
    if (!this.exists) throw new Error('File not found.');
    return globalThis.__fakeExpoFs.files.get(this.uri);
  }
  copySync(destination, { overwrite = false } = {}) {
    if (!this.exists) throw new Error('Source file not found.');
    if (globalThis.__fakeExpoFs.failCopyTo === destination.uri) throw new Error('Simulated copy failure.');
    if (destination.exists && !overwrite) throw new Error('Destination exists.');
    globalThis.__fakeExpoFs.files.set(destination.uri, this.textSync());
  }
  moveSync(destination, { overwrite = false } = {}) {
    globalThis.__fakeExpoFs.moves.push({ source: this.uri, destination: destination.uri });
    if (this.uri === destination.uri) throw new Error('Cannot move a file onto itself.');
    const attempts = globalThis.__fakeExpoFs.moveAttempts;
    const attempt = (attempts.get(destination.uri) ?? 0) + 1;
    attempts.set(destination.uri, attempt);
    if (globalThis.__fakeExpoFs.failMoveTo === destination.uri || globalThis.__fakeExpoFs.failMoveTo?.has?.(destination.uri) ||
        globalThis.__fakeExpoFs.failMoveToOnAttempt?.get(destination.uri) === attempt) throw new Error('Simulated move failure.');
    if (!this.exists) throw new Error('Source file not found.');
    if (destination.exists && !overwrite) throw new Error('Destination exists.');
    const contents = this.textSync();
    globalThis.__fakeExpoFs.files.delete(this.uri);
    globalThis.__fakeExpoFs.files.set(destination.uri, contents);
    this.uri = destination.uri;
  }
  delete() { globalThis.__fakeExpoFs.files.delete(this.uri); }
  bytesSync() { return new TextEncoder().encode(this.textSync()); }
}
`;

async function createHarness(t, { legacyStagingHandle = false, legacyCatalogHandle = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'soundboard-snapshot-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const state = { files: new Map(), failCopyTo: null, failMoveTo: null, failMoveToOnAttempt: null, moveAttempts: new Map(), moves: [] };
  globalThis.__fakeExpoFs = state;
  const fakeFileSystemPath = join(directory, 'fake-expo-file-system.mjs');
  await writeFile(fakeFileSystemPath, fakeFileSystemSource);

  const assignmentsUrl = pathToFileURL(join(appRoot, 'src/board/assignments.ts')).href;
  const catalogUrl = pathToFileURL(join(appRoot, 'src/editor/catalog.ts')).href;
  const protocolUrl = pathToFileURL(join(appRoot, 'src/editor/protocol.ts')).href;
  const networkUrl = pathToFileURL(join(appRoot, 'src/editor/network.ts')).href;
  const fakeFileSystemUrl = pathToFileURL(fakeFileSystemPath).href;
  let storageSource = (await readFile(join(appRoot, 'src/board/storage.ts'), 'utf8'))
    .replace("from 'expo-file-system';", `from '${fakeFileSystemUrl}';`)
    .replace("from './assignments';", `from '${assignmentsUrl}';`);
  let librarySource = (await readFile(join(appRoot, 'src/editor/library.ts'), 'utf8'))
    .replace("from 'expo-file-system';", `from '${fakeFileSystemUrl}';`)
    .replaceAll("from './catalog';", `from '${catalogUrl}';`)
    .replace("from '../limits';", `from '${pathToFileURL(join(appRoot, 'src/limits.ts')).href}';`)
    .replace("from './protocol';", `from '${protocolUrl}';`)
    .replace("from './network';", `from '${networkUrl}';`)
    .replace("from '../board/storage';", `from '${pathToFileURL(join(directory, 'storage.ts')).href}';`);
  if (legacyStagingHandle) {
    storageSource = storageSource
      .replace("const BACKUP_FILE = new File(LIBRARY_DIRECTORY, 'board.backup.json');", "$&\nconst NEXT_FILE = new File(LIBRARY_DIRECTORY, 'board.next.json');")
      .replace("  const nextFile = new File(LIBRARY_DIRECTORY, 'board.next.json');\n", '')
      .replaceAll('nextFile.', 'NEXT_FILE.');
  }
  if (legacyStagingHandle || legacyCatalogHandle) {
    librarySource = librarySource
      .replace("const BACKUP_FILE = new File(LIBRARY_DIRECTORY, 'catalog.backup.json');", "$&\nconst NEXT_FILE = new File(LIBRARY_DIRECTORY, 'catalog.next.json');")
      .replace("  const nextFile = new File(LIBRARY_DIRECTORY, 'catalog.next.json');\n", '')
      .replaceAll('nextFile.', 'NEXT_FILE.');
  }
  const storagePath = join(directory, 'storage.ts');
  await writeFile(storagePath, storageSource);
  const libraryPath = join(directory, 'library.ts');
  await writeFile(libraryPath, librarySource);

  return {
    state,
    async storage(reload = false) {
      if (!reload) return import(pathToFileURL(storagePath).href);
      const restartedPath = join(directory, 'storage-restarted.ts');
      await writeFile(restartedPath, storageSource);
      return import(pathToFileURL(restartedPath).href);
    },
    async library() { return import(pathToFileURL(libraryPath).href); },
  };
}

function seedClip(id, title = id) {
  return { id, title, durationMs: 1500, createdAt: '2026-10-10T10:00:00.000Z' };
}

function seedSnapshots(state, { assignments, clips }) {
  state.files.set(boardPath, JSON.stringify(assignments));
  state.files.set(catalogPath, JSON.stringify({ version: 1, clips }));
  for (const clip of clips) state.files.set(audioPath(clip.id, clip.extension ?? 'm4a'), 'audio bytes');
}

test('repeated board writes keep the primary and a restarted reader recovers a valid backup', async (t) => {
  const { state, storage } = await createHarness(t);
  const store = await storage();

  store.assignLocalClipToBoard(14, clipA);
  store.assignLocalClipToBoard(15, clipA);
  store.assignLocalClipToBoard(3, clipB);
  const ordered = store.moveBoardPad(14, 3);
  assert.equal(ordered.slots[14], clipA);
  assert.deepEqual(ordered.order.slice(0, 4), [0, 1, 2, 14]);
  store.removeLocalClipFromBoard(3);

  assert.equal(state.files.has(boardPath), true);
  assert.equal(state.files.has(backupBoardPath), true);
  assert.deepEqual(store.loadBoardAssignments().slots.slice(14), [clipA, clipA]);
  assert.deepEqual(store.loadBoardAssignments().order, ordered.order);
  assert.ok(state.moves.every(({ source }) => source.endsWith('/board.next.json')));

  state.files.delete(boardPath);
  const restarted = await storage(true);
  const recovered = restarted.loadBoardAssignments();
  assert.equal(recovered.version, 1);
  assert.equal(recovered.slots[14], clipA);
  assert.equal(recovered.slots[15], clipA);
  assert.equal(recovered.slots[3], clipB);
  assert.deepEqual(recovered.order, ordered.order);
});

test('board move writes preserve order on failure and the previous snapshot reloads', async (t) => {
  const { state, storage } = await createHarness(t);
  const store = await storage();
  store.assignLocalClipToBoard(16, clipA);
  store.assignLocalClipToBoard(17, clipB);
  const before = store.loadBoardAssignments();
  state.failMoveTo = boardPath;

  assert.throws(() => store.moveBoardPad(16, 17), /Simulated move failure/);
  assert.deepEqual(store.loadBoardAssignments(), before);
  const restarted = await storage(true);
  assert.deepEqual(restarted.loadBoardAssignments(), before);
});

test('a board backup-copy failure prevents the reorder and reloads the unchanged primary', async (t) => {
  const { state, storage } = await createHarness(t);
  const store = await storage();
  store.assignLocalClipToBoard(16, clipA);
  store.assignLocalClipToBoard(17, clipB);
  const before = store.loadBoardAssignments();
  const primaryBefore = state.files.get(boardPath);
  state.failCopyTo = backupBoardPath;

  assert.throws(() => store.moveBoardPad(17, 0), /Simulated copy failure/);
  assert.equal(state.files.get(boardPath), primaryBefore);
  assert.deepEqual(store.loadBoardAssignments(), before);
  const restarted = await storage(true);
  assert.deepEqual(restarted.loadBoardAssignments(), before);
});

test('a successful board move reloads with the same visual pad order after restart', async (t) => {
  const { storage } = await createHarness(t);
  const store = await storage();
  store.assignLocalClipToBoard(16, clipA);
  store.assignLocalClipToBoard(17, clipB);
  const saved = store.moveBoardPad(17, 0);
  const restarted = await storage(true);
  const reloaded = restarted.loadBoardAssignments();
  const basePads = Array.from({ length: 16 }, (_, index) => ({ id: `pad-${index}`, name: `Pad ${index}`, color: 'gray' }));
  const clips = [
    { id: clipA, title: 'A', uri: audioPath(clipA), missing: false },
    { id: clipB, title: 'B', uri: audioPath(clipB), missing: false },
  ];

  assert.deepEqual(reloaded, saved);
  assert.deepEqual(applyBoardAssignments(basePads, reloaded, clips).slice(0, 3).map(({ slotIndex }) => slotIndex), [17, 0, 1]);
  assert.equal(reloaded.slots[16], clipA);
  assert.equal(reloaded.slots[17], clipB);
});

test('automatic board assignment starts at 16, reuses appended holes, and refuses a full board', async (t) => {
  const { state, storage } = await createHarness(t);
  const store = await storage();
  store.assignLocalClipToBoard(999, clipA);
  assert.equal(store.addLocalClipToBoard(clipB).slots[16], clipB);
  assert.equal(store.addLocalClipToBoard(clipA).slots[17], clipA);
  store.removeLocalClipFromBoard(16);
  const reused = store.addLocalClipToBoard(clipB);
  assert.equal(reused.slots[16], clipB);
  assert.equal(reused.slots[17], clipA);

  state.files.set(boardPath, JSON.stringify({ version: 1, slots: Array(1000).fill(clipA) }));
  assert.throws(() => store.addLocalClipToBoard(clipB), /board is full.*1000/);
  assert.equal(JSON.parse(state.files.get(boardPath)).slots.length, 1000);
});

test('deleting clips clears duplicate board slots, preserves other clips, and keeps catalog primary across writes', async (t) => {
  const { state, storage, library } = await createHarness(t);
  const assignments = Array(16).fill(null);
  assignments[1] = clipA;
  assignments[6] = clipA;
  assignments[3] = clipB;
  const clips = [seedClip(clipA, 'first'), seedClip(clipB, 'second')];
  seedSnapshots(state, { assignments: { version: 1, slots: assignments, order: [6, 3, 1] }, clips });
  const store = await storage();
  const localLibrary = await library();

  localLibrary.deleteLocalClip(clipA);
  assert.equal(state.files.has(boardPath), true);
  assert.equal(state.files.has(catalogPath), true);
  assert.deepEqual(store.loadBoardAssignments().slots.slice(1, 7), [null, null, clipB, null, null, null]);
  assert.deepEqual(store.loadBoardAssignments().order, [6, 3, 1]);
  assert.deepEqual(JSON.parse(state.files.get(catalogPath)).clips.map((clip) => clip.id), [clipB]);
  assert.equal(state.files.has(audioPath(clipA)), false);

  localLibrary.deleteLocalClip(clipB);
  assert.equal(state.files.has(boardPath), true);
  assert.equal(state.files.has(catalogPath), true);
  assert.deepEqual(JSON.parse(state.files.get(boardPath)).slots, Array(16).fill(null));
  assert.deepEqual(JSON.parse(state.files.get(boardPath)).order, [6, 3, 1]);
  assert.deepEqual(JSON.parse(state.files.get(catalogPath)).clips, []);
  assert.equal(state.files.has(backupCatalogPath), true);
  assert.equal(state.files.has(audioPath(clipB)), false);
  assert.ok(state.moves.some(({ source }) => source.endsWith('/catalog.next.json')));
  assert.ok(state.moves.every(({ source, destination }) => source.endsWith('/board.next.json') || source.endsWith('/catalog.next.json') || source === destination));
});

test('a board snapshot write failure stops clip deletion before catalog or audio changes', async (t) => {
  const { state, library } = await createHarness(t);
  const assignments = Array(16).fill(null);
  assignments[0] = clipA;
  assignments[9] = clipA;
  const clip = seedClip(clipA, 'keep me');
  seedSnapshots(state, { assignments: { version: 1, slots: assignments }, clips: [clip] });
  state.failMoveTo = boardPath;
  const localLibrary = await library();

  assert.throws(() => localLibrary.deleteLocalClip(clipA), /Simulated move failure/);
  assert.deepEqual(JSON.parse(state.files.get(boardPath)).slots[0], clipA);
  assert.deepEqual(JSON.parse(state.files.get(catalogPath)).clips.map((entry) => entry.id), [clipA]);
  assert.equal(state.files.has(audioPath(clipA)), true);
});

test('a catalog snapshot write failure restores duplicate assignments and preserves the clip and audio', async (t) => {
  const { state, storage, library } = await createHarness(t);
  const assignments = Array(16).fill(null);
  assignments[0] = clipA;
  assignments[8] = clipA;
  assignments[12] = clipB;
  const clips = [seedClip(clipA, 'keep me'), seedClip(clipB, 'other clip')];
  seedSnapshots(state, { assignments: { version: 1, slots: assignments }, clips });
  const originalCatalog = state.files.get(catalogPath);
  const originalAudio = state.files.get(audioPath(clipA));
  state.failMoveTo = catalogPath;
  const store = await storage();
  const localLibrary = await library();

  assert.throws(() => localLibrary.deleteLocalClip(clipA), /Simulated move failure/);
  assert.deepEqual(store.loadBoardAssignments().slots, assignments);
  assert.equal(state.files.get(catalogPath), originalCatalog);
  assert.equal(state.files.get(audioPath(clipA)), originalAudio);
  assert.deepEqual(JSON.parse(state.files.get(catalogPath)).clips.map(({ id }) => id), [clipA, clipB]);
});

test('a failed assignment rollback reports both failures and leaves audio untouched', async (t) => {
  const { state, storage, library } = await createHarness(t);
  const assignments = Array(16).fill(null);
  assignments[2] = clipA;
  const clips = [seedClip(clipA, 'keep me')];
  seedSnapshots(state, { assignments: { version: 1, slots: assignments }, clips });
  state.failMoveTo = catalogPath;
  state.failMoveToOnAttempt = new Map([[boardPath, 2]]);
  const store = await storage();
  const localLibrary = await library();

  assert.throws(() => localLibrary.deleteLocalClip(clipA), /catalog.*Simulated move failure.*rollback.*Simulated move failure/i);
  assert.equal(store.loadBoardAssignments().slots[2], null);
  assert.deepEqual(JSON.parse(state.files.get(catalogPath)).clips.map(({ id }) => id), [clipA]);
  assert.equal(state.files.has(audioPath(clipA)), true);
});

test('mixed audio extensions survive catalog save and reload and delete only their own files', async (t) => {
  const { state, storage, library } = await createHarness(t);
  const store = await storage();
  const localLibrary = await library();
  const clips = [
    { ...seedClip(clipA, 'an MP3 import'), extension: 'mp3' },
    { ...seedClip(clipB, 'a WAV import'), extension: 'wav' },
  ];

  for (const clip of clips) {
    // Fake Expo files are represented by URI-keyed strings in this harness.
    state.files.set(audioPath(clip.id, clip.extension), 'audio bytes');
    localLibrary.commitImportedClip(clip);
  }

  store.assignLocalClipToBoard(16, clipA);
  const beforeRenameBoard = store.loadBoardAssignments();
  localLibrary.renameLocalClip(clipA, '  Renamed import  ');
  assert.equal(localLibrary.loadLocalClips().find((entry) => entry.id === clipA)?.title, 'Renamed import');
  assert.equal(localLibrary.localClipUri(clipA), audioPath(clipA, 'mp3'));
  assert.deepEqual(store.loadBoardAssignments(), beforeRenameBoard);

  const loaded = localLibrary.loadLocalClips();
  assert.deepEqual(loaded.map(({ extension, uri }) => [extension, uri.split('.').at(-1)]), [['wav', 'wav'], ['mp3', 'mp3']]);
  assert.equal(localLibrary.localClipUri(clipA), audioPath(clipA, 'mp3'));
  assert.equal(localLibrary.localClipUri(clipB), audioPath(clipB, 'wav'));
  localLibrary.deleteLocalClip(clipA);
  assert.equal(state.files.has(audioPath(clipA, 'mp3')), false);
  assert.equal(state.files.has(audioPath(clipB, 'wav')), true);
  localLibrary.deleteLocalClip(clipB);
  assert.equal(state.files.has(audioPath(clipB, 'wav')), false);
});

test('full catalog blocks imported clip commit without changing the persisted snapshot', async (t) => {
  const { state, library } = await createHarness(t);
  const localLibrary = await library();
  const clips = Array.from({ length: 1000 }, (_, index) => ({
    ...seedClip(`00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`),
  }));
  state.files.set(catalogPath, JSON.stringify({ version: 1, clips }));
  state.files.set(audioPath(clipA), 'audio bytes');
  const before = state.files.get(catalogPath);
  assert.throws(() => localLibrary.commitImportedClip(seedClip(clipA)), /library is full.*1000/);
  await assert.rejects(localLibrary.saveRenderedClip('https://example.invalid/render.m4a', 'token', 'rendered', 1500, new AbortController().signal), /library is full.*1000/);
  assert.equal(state.files.get(catalogPath), before);
  assert.equal(state.files.get(audioPath(clipA)), 'audio bytes');
});

test('the regression harness rejects the prior module-level staging handle', async (t) => {
  const { storage } = await createHarness(t, { legacyStagingHandle: true });
  const store = await storage();
  store.assignLocalClipToBoard(14, clipA);
  assert.throws(() => store.assignLocalClipToBoard(15, clipA), /onto itself/);
});

test('the regression harness rejects a reused module-level catalog staging handle', async (t) => {
  const { state, library } = await createHarness(t, { legacyCatalogHandle: true });
  const clips = [seedClip(clipA), seedClip(clipB)];
  seedSnapshots(state, { assignments: { version: 1, slots: Array(16).fill(null) }, clips });
  const localLibrary = await library();
  localLibrary.deleteLocalClip(clipA);
  assert.throws(() => localLibrary.deleteLocalClip(clipB), /onto itself/);
});
