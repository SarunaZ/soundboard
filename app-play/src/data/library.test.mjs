import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const appPlayRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const appClientRoot = resolve(appPlayRoot, '../app-client');
const fsStub = `
const join=(a,b)=>String(a).replace(/\\/+$/,'')+'/'+String(b).replace(/^\\//,'');
const state=globalThis.__playStore;
export const Paths={document:'file:///documents',cache:'file:///cache'};
export class Directory { constructor(...p){this.uri=p.map(x=>x?.uri??x).reduce((a,b)=>a===undefined?String(b):join(a,b),undefined)} get exists(){return state.dirs.has(this.uri)} create({idempotent=false}={}){if(this.exists&&!idempotent)throw Error('exists');state.dirs.add(this.uri)} list(){const p=this.uri+'/';return [...state.files.keys()].filter(k=>k.startsWith(p)&&!k.slice(p.length).includes('/')).map(k=>new File(k))} }
export class File { constructor(...p){this.uri=p.map(x=>x?.uri??x).reduce((a,b)=>a===undefined?String(b):join(a,b),undefined)} get name(){return this.uri.split('/').pop()} get exists(){return state.files.has(this.uri)} get size(){return state.files.get(this.uri)?.length??null} textSync(){state.textReads=(state.textReads??0)+1;if(!this.exists)throw Error('missing');return state.files.get(this.uri)} create({overwrite=false}={}){if(this.exists&&!overwrite)throw Error('exists');state.files.set(this.uri,'')} write(v){if(!this.exists)throw Error('missing');state.files.set(this.uri,String(v))} copySync(dest,{overwrite=false}={}){const uri=dest.uri;if(this.exists){if(state.files.has(uri)&&!overwrite)throw Error('exists');state.files.set(uri,state.files.get(this.uri))}} moveSync(dest,{overwrite=false}={}){if(this.uri===dest.uri)throw Error('NoSuchFileException: '+this.uri);if(state.failMoveTo===dest.uri)throw Error('Simulated move failure');if(state.failMoveAfter?.uri===dest.uri&&state.failMoveAfter.count--===0)throw Error('Simulated delayed move failure');if(!this.exists)throw Error('missing');if(state.files.has(dest.uri)&&!overwrite)throw Error('exists');state.files.set(dest.uri,state.files.get(this.uri));state.files.delete(this.uri);this.uri=dest.uri} delete(){state.files.delete(this.uri)} }
`;

async function harness(t) {
  const temp = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? '.', 'play-library-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  globalThis.__playStore = { files: new Map(), dirs: new Set(['file:///documents', 'file:///cache']), failMoveTo: null };
  const fsPath = join(temp, 'fake-fs.mjs');
  await writeFile(fsPath, fsStub);
  const fsUrl = pathToFileURL(fsPath).href;
  const fakeArtworkPath = join(temp, 'fake-artwork.mjs');
  await writeFile(fakeArtworkPath, `import{File,Directory,Paths}from'${fsUrl}';export function resolveArtworkUri(art){if(!art)return undefined;const f=new File(new Directory(Paths.document,'play-library'),'artwork',art.fileName);return f.exists&&f.size>0?f.uri:undefined}export function deleteOwnedArtwork(art,referenced){const f=new File(new Directory(Paths.document,'play-library'),'artwork',art.fileName);if(f.exists&&!referenced(art.fileName))f.delete()}export function pruneOwnedArtwork(referenced){const d=new Directory(new Directory(Paths.document,'play-library'),'artwork');for(const f of d.list()){if(f instanceof File&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.jpg$/i.test(f.name)&&!referenced(f.name))f.delete()}}`);
  const files = ['snapshot.ts', 'protocol.ts', 'boardModel.ts', 'boards.ts', 'presentation.ts', 'preferences.ts', 'clipPlayback.ts', 'padColors.ts', 'library.ts'];
  const sources = {};
  for (const name of files) sources[name] = await readFile(join(appPlayRoot, 'src/data', name), 'utf8');
  const devCatalog = pathToFileURL(join(appClientRoot, 'src/editor/catalog.ts')).href;
  const devLimits = pathToFileURL(join(appClientRoot, 'src/limits.ts')).href;
  const replacements = {
    'snapshot.ts': [["from 'expo-file-system'", `from '${fsUrl}'`]],
    'protocol.ts': [],
    'boardModel.ts': [["from '../../../app-client/src/limits.ts'", `from '${devLimits}'`], ["from './catalog.ts'", `from '${devCatalog}'`], ["from './protocol.ts'", `from '${pathToFileURL(join(temp, 'protocol.ts')).href}'`]],
    'boards.ts': [["from 'expo-file-system'", `from '${fsUrl}'`], ["from './snapshot.ts'", `from '${pathToFileURL(join(temp, 'snapshot.ts')).href}'`], ["from './boardModel.ts'", `from '${pathToFileURL(join(temp, 'boardModel.ts')).href}'`]],
    'presentation.ts': [["from 'expo-file-system'", `from '${fsUrl}'`], ["from './snapshot.ts'", `from '${pathToFileURL(join(temp, 'snapshot.ts')).href}'`], ["from './protocol.ts'", `from '${pathToFileURL(join(temp, 'protocol.ts')).href}'`]],
    'preferences.ts': [["from 'expo-file-system'", `from '${fsUrl}'`], ["from './snapshot.ts'", `from '${pathToFileURL(join(temp, 'snapshot.ts')).href}'`]],
    'clipPlayback.ts': [["from 'expo-file-system'", `from '${fsUrl}'`], ["from './snapshot.ts'", `from '${pathToFileURL(join(temp, 'snapshot.ts')).href}'`], ["from './protocol.ts'", `from '${pathToFileURL(join(temp, 'protocol.ts')).href}'`]],
    'padColors.ts': [],
    'library.ts': [["from 'expo-file-system'", `from '${fsUrl}'`], ["from '../../../app-client/src/limits.ts'", `from '${devLimits}'`], ["from './catalog'", `from '${devCatalog}'`], ["from './protocol'", `from '${pathToFileURL(join(temp, 'protocol.ts')).href}'`], ["from './snapshot.ts'", `from '${pathToFileURL(join(temp, 'snapshot.ts')).href}'`], ["from './boards.ts'", `from '${pathToFileURL(join(temp, 'boards.ts')).href}'`], ["from './presentation.ts'", `from '${pathToFileURL(join(temp, 'presentation.ts')).href}'`], ["from './clipPlayback.ts'", `from '${pathToFileURL(join(temp, 'clipPlayback.ts')).href}'`], ["from './preferences.ts'", `from '${pathToFileURL(join(temp, 'preferences.ts')).href}'`], ["from './padColors.ts'", `from '${pathToFileURL(join(temp, 'padColors.ts')).href}'`], ["from '../media/artwork.ts'", `from '${pathToFileURL(fakeArtworkPath).href}'`]],
  };
  for (const name of files) {
    let source = sources[name];
    for (const [before, after] of replacements[name]) source = source.replace(before, after);
    await writeFile(join(temp, name), source);
  }
  return {
    state: globalThis.__playStore,
    async load() {
      const [library, boards, preferences, clipPlayback] = await Promise.all([
        import(pathToFileURL(join(temp, 'library.ts')).href),
        import(pathToFileURL(join(temp, 'boards.ts')).href),
        import(pathToFileURL(join(temp, 'preferences.ts')).href),
        import(pathToFileURL(join(temp, 'clipPlayback.ts')).href),
      ]);
      const presentation = await import(pathToFileURL(join(temp, 'presentation.ts')).href);
      return { library, boards, preferences, presentation, clipPlayback };
    },
  };
}

const clip = (id, title = 'Test sound') => ({ id, title, durationMs: 1200, createdAt: '2026-10-17T00:00:00.000Z', extension: 'wav' });
const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('first-write process death recovers a complete staged board snapshot without replacing a valid backup', async (t) => {
  const h = await harness(t);
  const { boards } = await h.load();
  const initial = boards.loadBoards();
  const staged = structuredClone(initial);
  staged.boards[0].name = 'Recovered first save';
  h.state.files.set('file:///documents/play-library/boards.next.json', JSON.stringify(staged));
  assert.equal(boards.loadBoards().boards[0].name, 'Recovered first save');

  const backup = structuredClone(initial);
  backup.boards[0].name = 'Committed backup';
  h.state.files.set('file:///documents/play-library/boards.backup.json', JSON.stringify(backup));
  h.state.files.set('file:///documents/play-library/boards.json', '{malformed');
  assert.equal(boards.loadBoards().boards[0].name, 'Committed backup');
});

test('malformed board snapshots never silently initialize an empty collection', async (t) => {
  const h = await harness(t);
  const { boards } = await h.load();
  h.state.files.set('file:///documents/play-library/boards.json', '{malformed');
  assert.throws(() => boards.loadBoards(), /JSON|Unexpected|position/i);
  assert.equal(h.state.files.get('file:///documents/play-library/boards.json'), '{malformed');
});

test('malformed transaction journals preserve existing metadata and owned media', async (t) => {
  const h = await harness(t);
  const { boards } = await h.load();
  const committed = boards.loadBoards();
  const primaryUri = 'file:///documents/play-library/boards.json';
  const primary = h.state.files.get(primaryUri);
  const audioUri = `file:///documents/play-library/${id}.wav`;
  h.state.files.set(audioUri, 'owned audio');
  const payload = JSON.stringify({ ...committed, boards: committed.boards.map((board) => ({ ...board, name: 'tampered' })) });
  h.state.files.set('file:///documents/play-library/snapshot-transaction.json', JSON.stringify({
    version: 1,
    entries: [{ name: 'boards.json', payload, checksum: '00000000' }],
    deleteAfterCommit: [`${id}.wav`],
  }));
  assert.throws(() => boards.loadBoards(), /pending Play data update is damaged/);
  assert.equal(h.state.files.get(primaryUri), primary);
  assert.equal(h.state.files.has(audioUri), true);
  assert.equal(h.state.files.has('file:///documents/play-library/snapshot-transaction.json'), true);
});

test('orphan audio cleanup preserves files referenced by either valid catalog snapshot and fails closed on corruption', async (t) => {
  const h = await harness(t);
  const { library } = await h.load();
  const primary = 'file:///documents/play-library/catalog.json';
  const backup = 'file:///documents/play-library/catalog.backup.json';
  h.state.files.set(primary, JSON.stringify({ version: 1, clips: [] }));
  const backupCatalog = { version: 1, clips: [clip(id)] };
  h.state.files.set(backup, JSON.stringify(backupCatalog));
  const audio = `file:///documents/play-library/${id}.wav`;
  h.state.files.set(audio, 'audio');
  assert.deepEqual(library.loadLocalClips(), []);
  assert.equal(h.state.files.has(audio), true, 'valid backup metadata can still be used for recovery');

  const clean = await harness(t);
  const { library: cleanLibrary } = await clean.load();
  clean.state.files.set(primary, JSON.stringify({ version: 1, clips: [] }));
  clean.state.files.set(backup, JSON.stringify({ version: 1, clips: [] }));
  clean.state.files.set(audio, 'audio');
  assert.deepEqual(cleanLibrary.loadLocalClips(), []);
  assert.equal(clean.state.files.has(audio), false, 'media unreferenced by both snapshots is cleaned at startup');

  const damaged = await harness(t);
  const { library: damagedLibrary } = await damaged.load();
  const otherId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const otherAudio = `file:///documents/play-library/${otherId}.wav`;
  damaged.state.files.set(primary, JSON.stringify({ version: 1, clips: [] }));
  damaged.state.files.set(backup, '{damaged');
  damaged.state.files.set(otherAudio, 'audio');
  assert.deepEqual(damagedLibrary.loadLocalClips(), []);
  assert.equal(damaged.state.files.has(otherAudio), true, 'corrupt snapshot state is retained conservatively');
  assert.equal(damaged.state.files.has(primary), true);
});

test('orphan cleanup runs once at startup and cannot remove media staged by a later save', async (t) => {
  const h = await harness(t);
  const { library } = await h.load();
  library.initializeLocalLibrary();
  const stagedAudio = 'file:///documents/play-library/cccccccc-cccc-4ccc-8ccc-cccccccccccc.wav';
  h.state.files.set(stagedAudio, 'in-flight audio');
  library.loadLocalClips();
  assert.equal(h.state.files.get(stagedAudio), 'in-flight audio');
});

test('startup artwork cleanup preserves a thumbnail referenced only by the first-write presentation snapshot', async (t) => {
  const h = await harness(t);
  const { library } = await h.load();
  const artworkName = `${id}.jpg`;
  h.state.files.set('file:///documents/play-library/catalog.json', JSON.stringify({ version: 1, clips: [] }));
  h.state.files.set('file:///documents/play-library/presentation.next.json', JSON.stringify({
    version: 1,
    clips: { [id]: { artwork: { fileName: artworkName, source: 'gallery', title: 'Pending image' } } },
  }));
  const artworkUri = `file:///documents/play-library/artwork/${artworkName}`;
  h.state.files.set(artworkUri, 'thumbnail');
  library.initializeLocalLibrary();
  assert.equal(h.state.files.has(artworkUri), true);
});

test('catalog commits and renames are durable and use the Play-only directory', async (t) => {
  const h = await harness(t);
  const { library } = await h.load();
  const fileUri = `file:///documents/play-library/${id}.wav`;
  h.state.files.set(fileUri, 'RIFF fixture');
  assert.deepEqual(library.loadLocalClips(), []);
  library.commitImportedClip(clip(id));
  assert.equal(library.loadLocalClips()[0].uri, fileUri);
  library.renameLocalClip(id, 'Renamed');
  assert.equal(library.loadLocalClips()[0].title, 'Renamed');
  library.setLocalClipPresentation(id, { icon: 'bolt', color: '#12abef' });
  assert.deepEqual({ icon: library.loadLocalClips()[0].icon, color: library.loadLocalClips()[0].color }, { icon: 'bolt', color: '#12abef' });
  assert.equal(h.state.files.has('file:///documents/local-clips/catalog.json'), false);
});

test('deleting a clip also removes its playback preferences', async (t) => {
  const h = await harness(t);
  const { library, clipPlayback } = await h.load();
  h.state.files.set(`file:///documents/play-library/${id}.wav`, 'RIFF fixture');
  library.commitImportedClip(clip(id));
  clipPlayback.setClipPlaybackPreference(id, { gain: 1.5, repeat: 'loop' });
  assert.deepEqual(clipPlayback.getClipPlaybackPreference(id), { gain: 1.5, repeat: 'loop' });
  library.deleteLocalClip(id);
  assert.deepEqual(clipPlayback.loadClipPlaybackPreferences(), {});
  assert.deepEqual(clipPlayback.getClipPlaybackPreference(id), { gain: 1, repeat: 'once' });
});

test('sequential metadata transactions use a fresh staging handle after moveSync mutates its URI', async (t) => {
  const h = await harness(t);
  const { library } = await h.load();
  const secondId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const firstAudio = `file:///documents/play-library/${id}.wav`;
  const secondAudio = `file:///documents/play-library/${secondId}.wav`;
  h.state.files.set(firstAudio, 'first audio');
  h.state.files.set(secondAudio, 'second audio');
  library.commitImportedClip(clip(id, 'First'));
  library.commitImportedClip(clip(secondId, 'Second'));

  library.deleteLocalClip(id);
  assert.deepEqual(library.loadLocalClips().map(({ id: clipId }) => clipId), [secondId]);
  assert.equal(h.state.files.has(firstAudio), false);
  assert.equal(h.state.files.has('file:///documents/play-library/snapshot-transaction.json'), false);

  library.deleteLocalClip(secondId);
  assert.deepEqual(library.loadLocalClips(), []);
  assert.equal(h.state.files.has(secondAudio), false);
  assert.equal(h.state.files.has('file:///documents/play-library/snapshot-transaction.json'), false);
});

test('folder batch appends in manifest order, skips UUID duplicates, and preserves existing clips', async (t) => {
  const h = await harness(t);
  const { library } = await h.load();
  const first = clip(id, 'Existing');
  h.state.files.set(`file:///documents/play-library/${id}.wav`, 'existing audio');
  library.commitImportedClip(first);
  const secondId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const thirdId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const additions = [clip(id, 'Duplicate'), clip(secondId, 'Second'), clip(thirdId, 'Third')];
  const prepared = library.prepareImportedClips(additions);
  assert.equal(prepared.skipped, 1);
  assert.deepEqual(prepared.entries.map((entry) => entry.id), [secondId, thirdId]);
  h.state.files.set(`file:///documents/play-library/${secondId}.wav`, 'second audio');
  h.state.files.set(`file:///documents/play-library/${thirdId}.wav`, 'third audio');
  const committed = library.commitImportedClips(prepared);
  assert.deepEqual(committed.imported.map((entry) => entry.id), [secondId, thirdId]);
  assert.equal(committed.skipped, 1);
  assert.deepEqual(library.loadLocalClips().map((entry) => entry.title), ['Existing', 'Second', 'Third']);
});

test('folder batch checks total capacity before writing and protects orphan destination files', async (t) => {
  const h = await harness(t);
  const { library } = await h.load();
  const ids = Array.from({ length: 1000 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
  const catalog = { version: 1, clips: ids.map((clipId) => clip(clipId, `Sound ${clipId}`)) };
  h.state.files.set('file:///documents/play-library/catalog.json', JSON.stringify(catalog));
  assert.throws(() => library.prepareImportedClips([clip('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Extra')]), /up to 1000/);
  const orphanId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  h.state.files.set(`file:///documents/play-library/${orphanId}.wav`, 'orphan bytes');
  h.state.files.set('file:///documents/play-library/catalog.json', JSON.stringify({ version: 1, clips: [] }));
  assert.throws(() => library.prepareImportedClips([clip(orphanId, 'Orphan collision')]), /already exists/);
  assert.equal(h.state.files.get(`file:///documents/play-library/${orphanId}.wav`), 'orphan bytes');
});

test('failed mid-batch gradient write rolls back metadata and leaves the catalog untouched', async (t) => {
  const h = await harness(t);
  const { library, presentation } = await h.load();
  const nextId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const lastId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const prepared = library.prepareImportedClips([clip(nextId), clip(lastId, 'Last')]);
  for (const clipId of [nextId, lastId]) h.state.files.set(`file:///documents/play-library/${clipId}.wav`, 'audio');
  h.state.failMoveAfter = { uri: 'file:///documents/play-library/presentation.json', count: 1 };
  assert.throws(() => library.commitImportedClips(prepared), /delayed move failure/);
  assert.equal(library.loadLocalClips().length, 0);
  assert.deepEqual(presentation.loadClipPresentations(), {});
  assert.equal(h.state.files.has(`file:///documents/play-library/${nextId}.wav`), true);
  assert.equal(h.state.files.has(`file:///documents/play-library/${lastId}.wav`), true);
});

test('failed folder catalog commit keeps the old catalog and startup cleanup removes its copied orphan', async (t) => {
  const h = await harness(t);
  const { library } = await h.load();
  h.state.files.set(`file:///documents/play-library/${id}.wav`, 'original');
  library.commitImportedClip(clip(id, 'Original'));
  const newId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const prepared = library.prepareImportedClips([clip(newId, 'New')]);
  h.state.files.set(`file:///documents/play-library/${newId}.wav`, 'copied');
  const before = h.state.files.get('file:///documents/play-library/catalog.json');
  h.state.failMoveTo = 'file:///documents/play-library/catalog.json';
  assert.throws(() => library.commitImportedClips(prepared), /Simulated move failure/);
  h.state.failMoveTo = null;
  assert.equal(h.state.files.get('file:///documents/play-library/catalog.json'), before);
  assert.equal(library.loadLocalClips().length, 1);
  assert.equal(h.state.files.has(`file:///documents/play-library/${newId}.wav`), false);
});

test('v1 artwork metadata is path-safe, resolves locally, and missing previews fall back cleanly', async (t) => {
  const h = await harness(t);
  const { library, presentation } = await h.load();
  const art = { fileName: `${id}.jpg`, source: 'imgflip', sourceId: '12345', sourceUrl: 'https://imgflip.com/memetemplate/12345', title: 'Fixture template' };
  const fileUri = `file:///documents/play-library/${id}.wav`;
  const imageUri = `file:///documents/play-library/artwork/${id}.jpg`;
  h.state.files.set(fileUri, 'audio');
  h.state.files.set(imageUri, 'jpeg');
  library.commitImportedClip(clip(id));
  // Existing v1 icon/color entries remain valid when artwork is added.
  h.state.files.set('file:///documents/play-library/presentation.json', JSON.stringify({ version: 1, clips: { [id]: { icon: 'bolt', color: '#12abef' } } }));
  presentation.setClipArtwork(id, art);
  const loaded = library.loadLocalClips()[0];
  assert.equal(loaded.artworkUri, imageUri);
  assert.deepEqual({ icon: loaded.icon, color: loaded.color }, { icon: 'bolt', color: '#12abef' });
  assert.throws(() => presentation.parsePresentations({ version: 1, clips: { [id]: { artwork: { ...art, fileName: '../outside.jpg' } } } }), /invalid artwork metadata/);
  assert.throws(() => presentation.parsePresentations({ version: 1, clips: { [id]: { artwork: { ...art, sourceUrl: 'https://example.com/12345.jpg' } } } }), /invalid artwork URL/);
  h.state.files.delete(imageUri);
  assert.equal(library.loadLocalClips()[0].artworkUri, undefined);
  assert.equal(library.loadLocalClips()[0].artwork.sourceUrl, art.sourceUrl);
  presentation.setClipArtwork(id, { fileName: `${id}.jpg`, source: 'gallery', title: 'Weekend photo' });
  assert.equal(library.loadLocalClips()[0].artwork.source, 'gallery');
});

test('restoring Default artwork preserves color, icon, audio, and images referenced by recovery snapshots', async (t) => {
  const h = await harness(t);
  const { library, presentation } = await h.load();
  const audioUri = `file:///documents/play-library/${id}.wav`;
  const art = { fileName: `${id}.jpg`, source: 'gallery', title: 'Weekend photo' };
  const artworkUri = `file:///documents/play-library/artwork/${art.fileName}`;
  h.state.files.set(audioUri, 'audio');
  h.state.files.set(artworkUri, 'jpeg');
  library.commitImportedClip(clip(id));
  library.setLocalClipPresentation(id, { icon: 'bolt', color: '#ffc9a9', colorEnd: '#ff9eac', colorIndex: 15 });
  presentation.setClipArtwork(id, art);

  library.clearLocalClipArtwork(id);

  const saved = library.loadLocalClips()[0];
  assert.deepEqual({ icon: saved.icon, color: saved.color, colorEnd: saved.colorEnd, colorIndex: saved.colorIndex, artwork: saved.artwork }, {
    icon: 'bolt', color: '#ffc9a9', colorEnd: '#ff9eac', colorIndex: 15, artwork: undefined,
  });
  assert.equal(h.state.files.has(audioUri), true);
  assert.equal(h.state.files.has(artworkUri), true, 'the recovery snapshot still references the previous artwork');
});

test('failed Default artwork metadata write keeps the old artwork, gradient, and audio', async (t) => {
  const h = await harness(t);
  const { library, presentation } = await h.load();
  const audioUri = `file:///documents/play-library/${id}.wav`;
  const art = { fileName: `${id}.jpg`, source: 'gallery', title: 'Weekend photo' };
  const artworkUri = `file:///documents/play-library/artwork/${art.fileName}`;
  h.state.files.set(audioUri, 'audio');
  h.state.files.set(artworkUri, 'jpeg');
  library.commitImportedClip(clip(id));
  library.setLocalClipPresentation(id, { icon: 'bolt', color: '#ffc9a9', colorEnd: '#ff9eac', colorIndex: 15 });
  presentation.setClipArtwork(id, art);
  h.state.failMoveTo = 'file:///documents/play-library/presentation.json';

  assert.throws(() => library.clearLocalClipArtwork(id), /Simulated move failure/);
  h.state.failMoveTo = null;

  const saved = library.loadLocalClips()[0];
  assert.deepEqual({ icon: saved.icon, color: saved.color, colorEnd: saved.colorEnd, colorIndex: saved.colorIndex, artwork: saved.artwork }, {
    icon: 'bolt', color: '#ffc9a9', colorEnd: '#ff9eac', colorIndex: 15, artwork: art,
  });
  assert.equal(h.state.files.has(audioUri), true);
  assert.equal(h.state.files.has(artworkUri), true);
});

test('deleting a clip clears every Play board reference and keeps unrelated clips', async (t) => {
  const h = await harness(t);
  const { library, boards } = await h.load();
  const board = boards.loadBoards().boards[0];
  const fileUri = `file:///documents/play-library/${id}.wav`;
  h.state.files.set(fileUri, 'audio');
  library.commitImportedClip(clip(id));
  library.setLocalClipPresentation(id, { icon: 'music', color: '#abcdef' });
  boards.addClipToBoard(id, board.id, board.pads[0].id);
  library.deleteLocalClip(id);
  assert.equal(library.loadLocalClips().length, 0);
  assert.equal(library.loadLocalClips().some((entry) => entry.icon !== undefined), false);
  assert.equal(h.state.files.has(fileUri), false);
  assert.ok(boards.loadBoards().boards[0].pads.every((pad) => pad.clipId === null));
});

test('board collection creation and active selection survive reload', async (t) => {
  const h = await harness(t);
  const { boards } = await h.load();
  const initial = boards.loadBoards();
  const created = boards.createBoard('Practice');
  const reloaded = boards.loadBoards();
  assert.equal(created.name, 'Practice');
  assert.equal(reloaded.activeBoardId, created.id);
  assert.equal(reloaded.boards.length, initial.boards.length + 1);
  assert.equal(reloaded.boards.find((board) => board.id === created.id).pads.every((pad) => pad.clipId === null), true);
  boards.selectBoard(initial.activeBoardId);
  assert.equal(boards.loadBoards().activeBoardId, initial.activeBoardId);
});

test('appearance and quick action preferences persist, recover from backup, and support repeated writes', async (t) => {
  const h = await harness(t);
  const { preferences: prefs } = await h.load();
  const defaults = { version: 5, appearance: 'Vanilla', quickAction: 'file', masterVolume: 1, nextPadColorIndex: 15 };
  assert.deepEqual(prefs.loadPlayPreferences(), defaults);
  assert.deepEqual(prefs.loadPlayPreferences(true), defaults);
  for (const appearance of ['Peach', 'Mint', 'Snow', 'Ice', 'Vanilla', 'Chocolate', 'Grape', 'Nut', 'Blackberry']) {
    prefs.savePlayPreferences({ appearance, quickAction: 'record' });
    assert.deepEqual(prefs.loadPlayPreferences(), { ...defaults, appearance, quickAction: 'record' });
  }
  prefs.savePlayPreferences({ appearance: 'Mint', quickAction: 'file' });
  assert.deepEqual(prefs.loadPlayPreferences(), { ...defaults, appearance: 'Mint' });
  prefs.savePlayPreferences({ appearance: 'Ice', quickAction: 'device-audio' }, true);
  assert.deepEqual(prefs.loadPlayPreferences(), { ...defaults, appearance: 'Ice', quickAction: 'device-audio' });
  prefs.savePlayPreferences({ masterVolume: 0.35 });
  assert.deepEqual(prefs.loadPlayPreferences(), { ...defaults, appearance: 'Ice', quickAction: 'device-audio', masterVolume: 0.35 });
  assert.throws(() => prefs.savePlayPreferences({ masterVolume: 1.01 }), /master volume/);
  h.state.files.set('file:///documents/play-library/preferences.json', '{broken');
  assert.deepEqual(prefs.loadPlayPreferences(), { ...defaults, appearance: 'Ice', quickAction: 'device-audio' });
});

test('first supported-device defaults persist across later partial preference saves', async (t) => {
  const h = await harness(t);
  const { preferences: prefs } = await h.load();
  assert.deepEqual(prefs.loadPlayPreferences(true), { version: 5, appearance: 'Vanilla', quickAction: 'device-audio', masterVolume: 1, nextPadColorIndex: 15 });
  prefs.savePlayPreferences({ masterVolume: 0.4, appearance: 'Snow' });
  assert.deepEqual(prefs.loadPlayPreferences(), { version: 5, appearance: 'Snow', quickAction: 'device-audio', masterVolume: 0.4, nextPadColorIndex: 15 });
  assert.deepEqual(JSON.parse(h.state.files.get('file:///documents/play-library/preferences.json')), { version: 5, appearance: 'Snow', quickAction: 'device-audio', masterVolume: 0.4, nextPadColorIndex: 15 });
});

test('first preference load preserves a valid staged first-write snapshot after process death', async (t) => {
  const h = await harness(t);
  const { preferences } = await h.load();
  const staged = { version: 5, appearance: 'Grape', quickAction: 'library', masterVolume: 0.4, nextPadColorIndex: 27 };
  h.state.files.set('file:///documents/play-library/preferences.next.json', JSON.stringify(staged));
  assert.deepEqual(preferences.loadPlayPreferences(), staged);
  assert.equal(h.state.files.has('file:///documents/play-library/preferences.json'), false);
});

test('legacy preferences migrate appearance without replacing any saved Quick add choice', async (t) => {
  const h = await harness(t);
  const { preferences: prefs } = await h.load();
  for (const quickAction of ['file', 'record', 'library']) {
    h.state.files.set('file:///documents/play-library/preferences.json', JSON.stringify({ version: 2, appearance: 'Coffee', quickAction }));
    assert.deepEqual(prefs.loadPlayPreferences(true), { version: 5, appearance: 'Chocolate', quickAction, masterVolume: 1, nextPadColorIndex: 15 });
    assert.deepEqual(JSON.parse(h.state.files.get('file:///documents/play-library/preferences.json')), { version: 5, appearance: 'Chocolate', quickAction, masterVolume: 1, nextPadColorIndex: 15 });
  }
  h.state.files.set('file:///documents/play-library/preferences.json', JSON.stringify({ version: 1, appearance: 'dark', quickAction: 'library' }));
  assert.deepEqual(prefs.loadPlayPreferences(true), { version: 5, appearance: 'Chocolate', quickAction: 'library', masterVolume: 1, nextPadColorIndex: 15 });
  assert.deepEqual(JSON.parse(h.state.files.get('file:///documents/play-library/preferences.json')), { version: 5, appearance: 'Chocolate', quickAction: 'library', masterVolume: 1, nextPadColorIndex: 15 });
});

test('new pad colors allocate monotonically and round-trip both persisted gradient stops', async (t) => {
  const h = await harness(t);
  const { library, preferences, presentation } = await h.load();
  const fileUri = `file:///documents/play-library/${id}.wav`;
  h.state.files.set(fileUri, 'audio');
  library.commitImportedClip(clip(id));
  const first = preferences.allocateNextPadColorIndex();
  const second = preferences.allocateNextPadColorIndex();
  assert.equal(first, 15);
  assert.equal(second, 16);
  library.setLocalClipPresentation(id, { icon: 'music', color: '#ffc9a9', colorEnd: '#ff9eac', colorIndex: first });
  assert.deepEqual(library.loadLocalClips()[0], {
    ...clip(id), extension: 'wav', uri: fileUri, missing: false,
    icon: 'music', color: '#ffc9a9', colorEnd: '#ff9eac', colorIndex: 15, artworkUri: undefined,
  });
  assert.equal(preferences.loadPlayPreferences().nextPadColorIndex, 17);
  assert.deepEqual(presentation.loadClipPresentations()[id], { icon: 'music', color: '#ffc9a9', colorEnd: '#ff9eac', colorIndex: 15 });
});

test('legacy clips keep deterministic UUID-based gradients across reloads and backup recovery', async (t) => {
  const h = await harness(t);
  const { library } = await h.load();
  const fileUri = `file:///documents/play-library/${id}.wav`;
  h.state.files.set(fileUri, 'audio');
  h.state.files.set('file:///documents/play-library/catalog.json', JSON.stringify({ version: 1, clips: [clip(id)] }));
  h.state.files.set('file:///documents/play-library/presentation.json', JSON.stringify({ version: 1, clips: { [id]: { icon: 'bolt' } } }));

  const first = library.loadLocalClips()[0];
  const reloaded = library.loadLocalClips()[0];
  assert.deepEqual(
    { color: first.color, colorEnd: first.colorEnd, colorIndex: first.colorIndex },
    { color: reloaded.color, colorEnd: reloaded.colorEnd, colorIndex: reloaded.colorIndex },
  );
  assert.equal(first.icon, 'bolt');
  assert.deepEqual(JSON.parse(h.state.files.get('file:///documents/play-library/presentation.json')).clips[id], { icon: 'bolt' }, 'fallback rendering does not migrate or rewrite saved metadata');

  h.state.files.set('file:///documents/play-library/catalog.backup.json', JSON.stringify({ version: 1, clips: [clip(id)] }));
  h.state.files.set('file:///documents/play-library/catalog.json', '{broken');
  const recovered = library.loadLocalClips()[0];
  assert.equal(recovered.id, id);
  assert.deepEqual(
    { color: recovered.color, colorEnd: recovered.colorEnd, colorIndex: recovered.colorIndex },
    { color: first.color, colorEnd: first.colorEnd, colorIndex: first.colorIndex },
  );
});

test('catalog reads a valid backup after primary corruption and never resets when both copies are corrupt', async (t) => {
  const h = await harness(t);
  const { library } = await h.load();
  h.state.files.set(`file:///documents/play-library/${id}.wav`, 'audio');
  library.commitImportedClip(clip(id));
  const nextId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  h.state.files.set(`file:///documents/play-library/${nextId}.wav`, 'audio 2');
  library.commitImportedClip(clip(nextId, 'Second'));
  const primary = 'file:///documents/play-library/catalog.json';
  const backup = 'file:///documents/play-library/catalog.backup.json';
  const intactBackup = h.state.files.get(backup);
  h.state.files.set(primary, '{bad json');
  assert.deepEqual(library.loadLocalClips().map(({ id: clipId }) => clipId), [id]);
  assert.equal(h.state.files.get(primary), '{bad json');
  assert.equal(h.state.files.get(backup), intactBackup);
  h.state.files.set(backup, '{also bad');
  assert.throws(() => library.loadLocalClips());
  assert.equal(h.state.files.get(primary), '{bad json');
  assert.equal(h.state.files.get(backup), '{also bad');
});

test('interrupted clip deletion replays all metadata before removing media on the next read', async (t) => {
  for (const boundary of ['boards.json', 'presentation.json', 'clip-playback.json', 'catalog.json']) {
    const h = await harness(t);
    const { library, boards, presentation, clipPlayback } = await h.load();
    const board = boards.loadBoards().boards[0];
    const fileUri = `file:///documents/play-library/${id}.wav`;
    h.state.files.set(fileUri, 'audio');
    library.commitImportedClip(clip(id));
    library.setLocalClipPresentation(id, { icon: 'music', color: '#abcdef' });
    const artwork = { fileName: `${id}.jpg`, source: 'imgflip', sourceId: '12345', sourceUrl: 'https://imgflip.com/memetemplate/12345', title: 'Fixture template' };
    const artworkUri = `file:///documents/play-library/artwork/${id}.jpg`;
    h.state.files.set(artworkUri, 'jpeg');
    presentation.setClipArtwork(id, artwork);
    clipPlayback.setClipPlaybackPreference(id, { gain: 1.5, repeat: 'loop' });
    boards.addClipToBoard(id, board.id, board.pads[0].id);
    h.state.failMoveTo = `file:///documents/play-library/${boundary}`;
    assert.throws(() => library.deleteLocalClip(id), /Simulated move failure/);
    assert.equal(h.state.files.has(fileUri), true, 'media remains until every metadata snapshot commits');
    assert.equal(h.state.files.has('file:///documents/play-library/snapshot-transaction.json'), true, 'the durable journal survives the interrupted write');
    h.state.failMoveTo = null;
    assert.equal(library.loadLocalClips().length, 0);
    assert.equal(boards.loadBoards().boards[0].pads[0].clipId, null);
    assert.deepEqual(clipPlayback.loadClipPlaybackPreferences(), {});
    assert.equal(h.state.files.has(fileUri), false);
    assert.equal(h.state.files.has(artworkUri), false);
    assert.equal(h.state.files.has('file:///documents/play-library/snapshot-transaction.json'), false);
  }
});

test('artwork reference checker reads each recovery snapshot once and retains all on corruption', async (t) => {
  const h = await harness(t);
  const { presentation } = await h.load();
  const primary = 'file:///documents/play-library/presentation.json';
  const backup = 'file:///documents/play-library/presentation.backup.json';
  h.state.files.set(primary, JSON.stringify({ version: 1, clips: { [id]: { artwork: { fileName: `${id}.jpg`, source: 'gallery', title: 'Current' } } } }));
  h.state.files.set(backup, JSON.stringify({ version: 1, clips: {} }));
  h.state.textReads = 0;
  const references = presentation.createArtworkReferenceChecker();
  assert.equal(h.state.textReads, 2);
  assert.equal(references(`${id}.jpg`), true);
  assert.equal(references('cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg'), false);

  h.state.files.set(primary, '{damaged');
  const conservative = presentation.createArtworkReferenceChecker();
  assert.equal(h.state.textReads, 4);
  assert.equal(conservative('cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg'), true);
});
