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
export class Directory { constructor(...p){this.uri=p.map(x=>x?.uri??x).reduce((a,b)=>a===undefined?String(b):join(a,b),undefined)} get exists(){return state.dirs.has(this.uri)} create({idempotent=false}={}){if(this.exists&&!idempotent)throw Error('exists');state.dirs.add(this.uri)} }
export class File { constructor(...p){this.uri=p.map(x=>x?.uri??x).reduce((a,b)=>a===undefined?String(b):join(a,b),undefined)} get exists(){return state.files.has(this.uri)} get size(){return state.files.get(this.uri)?.length??null} textSync(){if(!this.exists)throw Error('missing');return state.files.get(this.uri)} create({overwrite=false}={}){if(this.exists&&!overwrite)throw Error('exists');state.files.set(this.uri,'')} write(v){if(!this.exists)throw Error('missing');state.files.set(this.uri,String(v))} copySync(dest,{overwrite=false}={}){const uri=dest.uri;if(this.exists){if(state.files.has(uri)&&!overwrite)throw Error('exists');state.files.set(uri,state.files.get(this.uri))}} moveSync(dest,{overwrite=false}={}){if(state.failMoveTo===dest.uri)throw Error('Simulated move failure');if(!this.exists)throw Error('missing');if(state.files.has(dest.uri)&&!overwrite)throw Error('exists');state.files.set(dest.uri,state.files.get(this.uri));state.files.delete(this.uri);this.uri=dest.uri} delete(){state.files.delete(this.uri)} }
`;

async function harness(t) {
  const temp = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? '.', 'play-library-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  globalThis.__playStore = { files: new Map(), dirs: new Set(['file:///documents', 'file:///cache']), failMoveTo: null };
  const fsPath = join(temp, 'fake-fs.mjs');
  await writeFile(fsPath, fsStub);
  const fsUrl = pathToFileURL(fsPath).href;
  const fakeArtworkPath = join(temp, 'fake-artwork.mjs');
  await writeFile(fakeArtworkPath, `import{File,Directory,Paths}from'${fsUrl}';export function resolveArtworkUri(art){if(!art)return undefined;const f=new File(new Directory(Paths.document,'play-library'),'artwork',art.fileName);return f.exists&&f.size>0?f.uri:undefined}export function deleteOwnedArtwork(art,referenced){const f=new File(new Directory(Paths.document,'play-library'),'artwork',art.fileName);if(f.exists&&!referenced(art.fileName))f.delete()}`);
  const files = ['snapshot.ts', 'protocol.ts', 'boardModel.ts', 'boards.ts', 'presentation.ts', 'preferences.ts', 'library.ts'];
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
    'library.ts': [["from 'expo-file-system'", `from '${fsUrl}'`], ["from '../../../app-client/src/limits.ts'", `from '${devLimits}'`], ["from './catalog'", `from '${devCatalog}'`], ["from './protocol'", `from '${pathToFileURL(join(temp, 'protocol.ts')).href}'`], ["from './snapshot.ts'", `from '${pathToFileURL(join(temp, 'snapshot.ts')).href}'`], ["from './boards.ts'", `from '${pathToFileURL(join(temp, 'boards.ts')).href}'`], ["from './presentation.ts'", `from '${pathToFileURL(join(temp, 'presentation.ts')).href}'`], ["from '../media/artwork.ts'", `from '${pathToFileURL(fakeArtworkPath).href}'`]],
  };
  for (const name of files) {
    let source = sources[name];
    for (const [before, after] of replacements[name]) source = source.replace(before, after);
    await writeFile(join(temp, name), source);
  }
  return {
    state: globalThis.__playStore,
    async load() {
      const [library, boards, preferences] = await Promise.all([
        import(pathToFileURL(join(temp, 'library.ts')).href),
        import(pathToFileURL(join(temp, 'boards.ts')).href),
        import(pathToFileURL(join(temp, 'preferences.ts')).href),
      ]);
      const presentation = await import(pathToFileURL(join(temp, 'presentation.ts')).href);
      return { library, boards, preferences, presentation };
    },
  };
}

const clip = (id, title = 'Test sound') => ({ id, title, durationMs: 1200, createdAt: '2026-10-17T00:00:00.000Z', extension: 'wav' });
const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
  assert.deepEqual(prefs.loadPlayPreferences(), { version: 1, appearance: 'system', quickAction: 'file' });
  prefs.savePlayPreferences({ appearance: 'dark', quickAction: 'library' });
  prefs.savePlayPreferences({ appearance: 'light', quickAction: 'file' });
  assert.deepEqual(prefs.loadPlayPreferences(), { version: 1, appearance: 'light', quickAction: 'file' });
  h.state.files.set('file:///documents/play-library/preferences.json', '{broken');
  assert.deepEqual(prefs.loadPlayPreferences(), { version: 1, appearance: 'dark', quickAction: 'library' });
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

test('catalog write failure rolls board-reference removal back and retains audio', async (t) => {
  const h = await harness(t);
  const { library, boards, presentation } = await h.load();
  const board = boards.loadBoards().boards[0];
  const fileUri = `file:///documents/play-library/${id}.wav`;
  h.state.files.set(fileUri, 'audio');
  library.commitImportedClip(clip(id));
  library.setLocalClipPresentation(id, { icon: 'music', color: '#abcdef' });
  const artwork = { fileName: `${id}.jpg`, source: 'imgflip', sourceId: '12345', sourceUrl: 'https://imgflip.com/memetemplate/12345', title: 'Fixture template' };
  const artworkUri = `file:///documents/play-library/artwork/${id}.jpg`;
  h.state.files.set(artworkUri, 'jpeg');
  presentation.setClipArtwork(id, artwork);
  boards.addClipToBoard(id, board.id, board.pads[0].id);
  h.state.failMoveTo = 'file:///documents/play-library/catalog.json';
  assert.throws(() => library.deleteLocalClip(id), /Simulated move failure/);
  h.state.failMoveTo = null;
  assert.equal(library.loadLocalClips().length, 1);
  assert.equal(boards.loadBoards().boards[0].pads[0].clipId, id);
  assert.equal(library.loadLocalClips()[0].icon, 'music');
  assert.equal(h.state.files.has(fileUri), true);
  assert.equal(h.state.files.has(artworkUri), true);
});
