import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repo = resolve(rootDir, '..');
const clipId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const appSettings = { version: 5, appearance: 'Mint', quickAction: 'file', masterVolume: 0.7, nextPadColorIndex: 19 };
const clip = { id: clipId, title: 'Fixture', durationMs: 1200, createdAt: '2026-10-17T00:00:00.000Z', extension: 'wav' };
const wavFixture = () => Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x04, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
const jpegFixture = (width, height) => Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0, 0xff, 0xd9]);
const crc32 = (bytes) => { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; } return (crc ^ 0xffffffff) >>> 0; };
const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
function storedZip(entries) {
  const encoder = new TextEncoder(); const locals = []; const centrals = []; let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name); const crc = crc32(entry.data); const size = entry.data.length;
    const header = Uint8Array.from([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...name]);
    locals.push(header, entry.data);
    const central = Uint8Array.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name]);
    centrals.push(central); offset += header.length + size;
  }
  const centralOffset = offset; const centralSize = centrals.reduce((n, row) => n + row.length, 0);
  const eocd = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(centralSize), ...u32(centralOffset), ...u16(0)]);
  return Uint8Array.from([...locals.flatMap((row) => [...row]), ...centrals.flatMap((row) => [...row]), ...eocd]);
}
function readStoredZipJson(archive, targetName) {
  let offset = 0;
  while (offset + 30 <= archive.length && new DataView(archive.buffer, archive.byteOffset + offset, 4).getUint32(0, true) === 0x04034b50) {
    const view = new DataView(archive.buffer, archive.byteOffset + offset, 30);
    const nameLength = view.getUint16(26, true); const extraLength = view.getUint16(28, true); const size = view.getUint32(18, true);
    const nameOffset = offset + 30; const name = new TextDecoder().decode(archive.subarray(nameOffset, nameOffset + nameLength));
    const dataOffset = nameOffset + nameLength + extraLength;
    if (name === targetName) return JSON.parse(new TextDecoder().decode(archive.subarray(dataOffset, dataOffset + size)));
    offset = dataOffset + size;
  }
  throw new Error(`ZIP entry ${targetName} was not found.`);
}

const fsStub = `
const s=globalThis.__backupStore; const join=(a,b)=>String(a).replace(/\\/+$/,'')+'/'+String(b).replace(/^\\//,'');
export const Paths={document:{uri:'file:///documents'},cache:{uri:'file:///cache'}}; export const FileMode={ReadOnly:'r',WriteOnly:'w'};
export class File { constructor(...parts){this.uri=parts.map(x=>x?.uri??x).reduce((a,b)=>a===undefined?String(b):join(a,b),undefined)} get name(){return this.uri.split('/').pop()} get exists(){return s.files.has(this.uri)} get size(){return s.files.get(this.uri)?.length??null} create(){if(this.exists)throw Error('exists');s.files.set(this.uri,new Uint8Array())} delete(){s.files.delete(this.uri)} text(){return Promise.resolve(new TextDecoder().decode(s.files.get(this.uri)))} write(text){s.files.set(this.uri,new TextEncoder().encode(text))} async copy(destination,options){if(!this.exists)throw Error('missing source');const uri=destination instanceof Directory?join(destination.uri,this.name):destination.uri;if(s.files.has(uri)&&!options?.overwrite)throw Error('exists');const bytes=s.files.get(this.uri);if(s.failCopy){s.files.set(uri,bytes.slice(0,Math.max(1,Math.floor(bytes.length/2))));throw Error('copy failed')}s.files.set(uri,bytes.slice())} open(mode){const uri=this.uri;if(mode==='w'&&!this.exists)this.create();let pos=0;let closed=false;return{readBytes(n){if(closed)throw Error('closed');const b=s.files.get(uri);const out=b.slice(pos,Math.min(b.length,pos+n));pos+=out.length;return out},writeBytes(chunk){if(closed)throw Error('closed');if(s.failWrite)throw Error('disk full');const before=s.files.get(uri)??new Uint8Array();const out=new Uint8Array(before.length+chunk.length);out.set(before);out.set(chunk,before.length);s.files.set(uri,out)},close(){closed=true}}} }
export class Directory { constructor(...parts){this.uri=parts.map(x=>x?.uri??x).reduce((a,b)=>a===undefined?String(b):join(a,b),undefined)} get name(){return this.uri.split('/').pop()} get exists(){return s.dirs.has(this.uri)} create(){s.dirs.add(this.uri)} delete(){for(const k of s.files.keys())if(k.startsWith(this.uri+'/'))s.files.delete(k);for(const k of [...s.dirs])if(k===this.uri||k.startsWith(this.uri+'/'))s.dirs.delete(k)} list(){const p=this.uri+'/';const rows=[];for(const k of s.files.keys())if(k.startsWith(p)&&!k.slice(p.length).includes('/'))rows.push(new File(k));return rows} createFile(name){const f=new File(this,name);if(f.exists)throw Error('exists');f.create();return f} static async pickDirectoryAsync(){if(s.pickerError)throw s.pickerError;return s.pickerDirectory} }
`;
const pickerStub = `export async function getDocumentAsync(){const s=globalThis.__backupStore;if(s.pickerPromise)return s.pickerPromise;return {canceled:false,assets:[{uri:s.pickedUri}]}}`;
const legacyPickerStub = `export const StorageAccessFramework={async requestDirectoryPermissionsAsync(){const s=globalThis.__backupStore;if(s.legacyPickerError)throw s.legacyPickerError;return s.legacyPickerResult}}`;
const boardsStub = `const s=globalThis.__backupStore;export function loadBoards(){return s.boards}export function saveBoards(v){if(s.failBoards)throw Error('board snapshot failed');s.boards=v;return v}`;
const presentationStub = `const s=globalThis.__backupStore;export function loadClipPresentations(){return s.presentations}export function parsePresentations(v){return v}export function setClipPresentation(id,v){s.presentations[id]=v}export function removeClipPresentation(id){delete s.presentations[id]}`;
const playbackStub = `const s=globalThis.__backupStore;export function loadClipPlaybackPreferences(){return s.playback}export function parseClipPlaybackPreferences(v){return v.clips}export function setClipPlaybackPreference(id,v){s.playback[id]=v}export function removeClipPlaybackPreference(id){delete s.playback[id]}`;
const preferencesStub = `const s=globalThis.__backupStore;export function loadPlayPreferences(){return s.preferences}export function parsePlayPreferences(v){return v}export function savePlayPreferences(v){s.preferences={...s.preferences,...v};return s.preferences}`;
const libraryStub = `const s=globalThis.__backupStore;export function loadLocalClips(){return s.clips.map(c=>({...c,uri:'file:///documents/play-library/'+c.id+'.'+c.extension,missing:false}))}export function prepareImportedClips(entries){const ids=new Set(s.clips.map(c=>c.id));const additions=entries.filter(c=>!ids.has(c.id));return{entries:additions,skipped:entries.length-additions.length}}export function commitImportedClips(p){s.clips.push(...p.entries);return{imported:p.entries,skipped:p.skipped}}`;
const snapshotStub = `import{Directory,Paths}from'EXPO';const s=globalThis.__backupStore;export const PLAY_LIBRARY_DIRECTORY=new Directory(Paths.document,'play-library');function replay(){if(!s.pending)return;for(const [i,c] of s.pending.entries()){if(s.failTransactionAt===i)throw Error('snapshot write interrupted');if(c.name==='boards.json')s.boards=c.value;else if(c.name==='presentation.json')s.presentations=c.value.clips;else if(c.name==='clip-playback.json')s.playback=c.value.clips;else if(c.name==='preferences.json')s.preferences=c.value;else if(c.name==='catalog.json')s.clips=c.value.clips}s.pending=null}s.recover=replay;export function recoverSnapshotTransaction(){replay()}export function hasPendingSnapshotTransaction(){return !!s.pending}export function writeSnapshotTransaction(changes){s.pending=changes.map(c=>({name:c.name,value:c.parse(c.value)}));replay()}`;
const validationStub = `export function parsePlayBackupManifest(v){if(v.format!=='stimmyz-play-backup'||v.version!==1)throw Error('unsupported backup');if(v.files.some(x=>x.crc32<0))throw Error('invalid crc');return v}export function mergePlayBackup(a,b){const ids=new Set(a.clips.map(c=>c.id));const imported=b.clips.filter(c=>!ids.has(c.id));return{clips:[...a.clips,...imported],boards:a.boards,presentations:{...b.presentations,...a.presentations},playback:{...b.playback,...a.playback},preferences:b.preferences,importedClipIds:imported.map(c=>c.id)}}export const MAX_BACKUP_MANIFEST_BYTES=8388608,MAX_BACKUP_FILE_BYTES=33554432,MAX_BACKUP_ARTWORK_BYTES=1048576,MAX_BACKUP_BYTES=536870912,MAX_BACKUP_FILES=2001`;

async function makeBackupModule(t) {
  const temp = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? '.', 'play-backup-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const state = globalThis.__backupStore = {
    files: new Map(), dirs: new Set(['file:///documents', 'file:///cache']),
    pickerDirectory: null, pickerError: null, legacyPickerResult: { granted: false }, legacyPickerError: null, pickedUri: null, pickerPromise: null, clips: [], boards: { version: 1, activeBoardId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', boards: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Main', pads: [], grid: '4x4', navigation: 'pages', allowOverlap: false }] },
    presentations: {}, playback: {}, preferences: { ...appSettings }, failWrite: false, failCopy: false, failBoards: false, failTransactionAt: null, pending: null,
  };
  const fsPath = join(temp, 'fs.mjs'); await writeFile(fsPath, fsStub);
  const fsUrl = pathToFileURL(fsPath).href;
  const fakeFs = await import(fsUrl);
  const pickerPath = join(temp, 'picker.mjs'); await writeFile(pickerPath, pickerStub);
  const pickerUrl = pathToFileURL(pickerPath).href;
  const legacyPickerPath = join(temp, 'legacy-picker.mjs'); await writeFile(legacyPickerPath, legacyPickerStub);
  const legacyPickerUrl = pathToFileURL(legacyPickerPath).href;
  const replacements = {
    '../data/boards.ts': boardsStub,
    '../data/presentation.ts': presentationStub,
    '../data/clipPlayback.ts': playbackStub,
    '../data/preferences.ts': preferencesStub,
    '../data/library.ts': libraryStub,
    '../data/padColors.ts': `export function padGradientForClipId(){return{color:'#123456',colorEnd:'#654321',colorIndex:42}}`,
    '../data/snapshot.ts': snapshotStub.replace('EXPO', fsUrl),
    './backupValidation.ts': validationStub,
  };
  const backupPath = join(temp, 'backup.ts');
  let source = await readFile(join(rootDir, 'src/media/backup.ts'), 'utf8');
  for (const [fragment, code] of Object.entries(replacements)) {
    const stub = join(temp, `${fragment.replace(/[^a-z]+/gi, '-')}.mjs`);
    let contents = code;
    if (fragment === '../data/snapshot.ts') contents = contents.replaceAll("from'EXPO'", `from'${fsUrl}'`).replaceAll("from 'EXPO'", `from '${fsUrl}'`);
    await writeFile(stub, contents);
    source = source.replaceAll(`from '${fragment}'`, `from '${pathToFileURL(stub).href}'`);
  }
  source = source.replace("from '../data/boardModel.ts'", `from '${pathToFileURL(join(repo, 'app-play/src/data/boardModel.ts')).href}'`);
  source = source.replaceAll("from 'expo-file-system/legacy'", `from '${legacyPickerUrl}'`).replaceAll("from 'expo-file-system'", `from '${fsUrl}'`).replaceAll("from 'expo-document-picker'", `from '${pickerUrl}'`);
  source = source.replace("from '../data/catalog.ts'", `from '${pathToFileURL(join(repo, 'app-play/src/data/catalog.ts')).href}'`);
  await writeFile(backupPath, source);
  return { state, api: await import(pathToFileURL(backupPath).href), Directory: fakeFs.Directory };
}

test('stored ZIP backup streams a round trip and restores media, board metadata, playback and app settings', async (t) => {
  const { state, api, Directory } = await makeBackupModule(t);
  state.pickerDirectory = new Directory('file:///export'); state.pickerDirectory.create();
  const sourceBytes = wavFixture();
  state.files.set(`file:///documents/play-library/${clipId}.wav`, sourceBytes);
  state.clips = [clip];
  const exported = await api.exportPlayBackup();
  const archive = state.files.get(exported.folderUri);
  assert.equal(new DataView(archive.buffer).getUint32(0, true), 0x04034b50);

  state.clips = []; state.playback = {}; state.presentations = {}; state.preferences = { version: 5, appearance: 'Vanilla', quickAction: 'record', masterVolume: 1, nextPadColorIndex: 15 };
  state.files.delete(`file:///documents/play-library/${clipId}.wav`);
  state.pickedUri = exported.folderUri;
  const restored = await api.importPlayBackup();
  assert.deepEqual(restored, { imported: 1, skipped: 0, boardsAdded: 0 });
  assert.deepEqual([...state.files.get(`file:///documents/play-library/${clipId}.wav`)], [...sourceBytes]);
  assert.deepEqual(state.clips, [clip]);
  assert.deepEqual(state.preferences, appSettings);
});

test('backup export records deterministic fallback colors for legacy clips', async (t) => {
  const { state, api, Directory } = await makeBackupModule(t);
  state.pickerDirectory = new Directory('file:///export'); state.pickerDirectory.create();
  state.files.set(`file:///documents/play-library/${clipId}.wav`, wavFixture());
  state.clips = [clip];
  state.presentations = { [clipId]: { icon: 'bolt' } };

  const exported = await api.exportPlayBackup();
  const manifest = readStoredZipJson(state.files.get(exported.folderUri), 'play-backup.json');
  assert.deepEqual(manifest.presentations[clipId], { icon: 'bolt', color: '#123456', colorEnd: '#654321', colorIndex: 42 });
});

test('backup export stores one shared artwork file once when multiple clips reference it', async (t) => {
  const { state, api, Directory } = await makeBackupModule(t);
  state.pickerDirectory = new Directory('file:///export'); state.pickerDirectory.create();
  const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const artwork = { fileName: `${clipId}.jpg`, source: 'gallery', title: 'Shared picture' };
  state.clips = [clip, { ...clip, id: secondId, title: 'Second' }];
  state.files.set(`file:///documents/play-library/${clipId}.wav`, wavFixture());
  state.files.set(`file:///documents/play-library/${secondId}.wav`, wavFixture());
  state.files.set(`file:///documents/play-library/artwork/${clipId}.jpg`, jpegFixture(32, 32));
  state.presentations = { [clipId]: { artwork }, [secondId]: { artwork } };
  const exported = await api.exportPlayBackup();
  const manifest = readStoredZipJson(state.files.get(exported.folderUri), 'play-backup.json');
  assert.equal(manifest.files.filter((entry) => entry.name === artwork.fileName).length, 1);
});

test('directory export falls back only for the stale native launcher and copies into its selected folder', async (t) => {
  const { state, api } = await makeBackupModule(t);
  state.dirs.add('file:///export');
  state.pickerError = new Error('java.lang.IllegalStateException: Attempting to launch an unregistered ActivityResultLauncher');
  state.legacyPickerResult = { granted: true, directoryUri: 'file:///export' };
  state.files.set(`file:///documents/play-library/${clipId}.wav`, wavFixture());
  state.clips = [clip];
  const result = await api.exportPlayBackup();
  assert.match(result.folderUri, /^file:\/\/\/export\/Stimmyz-Play-backup-/);
  assert.ok(state.files.has(result.folderUri));
});

test('directory picker fallback cancellation performs no writes', async (t) => {
  const { state, api } = await makeBackupModule(t);
  state.pickerError = new Error('Attempting to launch an unregistered ActivityResultLauncher');
  state.legacyPickerResult = { granted: false };
  assert.equal(await api.exportPlayBackup(), null);
  assert.deepEqual([...state.files.keys()], []);
});

test('abort while backup picker is open removes the returned DocumentPicker cache copy', async (t) => {
  const { state, api } = await makeBackupModule(t);
  const uri = 'file:///cache/DocumentPicker/backup.zip';
  state.files.set(uri, new Uint8Array([1, 2, 3]));
  let resolvePicker;
  state.pickerPromise = new Promise((resolve) => { resolvePicker = resolve; });
  const controller = new AbortController();
  const importing = api.importPlayBackup(controller.signal);
  controller.abort();
  resolvePicker({ canceled: false, assets: [{ uri }] });
  await assert.rejects(importing, /canceled/);
  assert.equal(state.files.has(uri), false);
});

test('backup import cleanup preserves encoded traversal and noncanonical picker paths', async (t) => {
  const { state, api } = await makeBackupModule(t);
  const uri = 'file:///cache/DocumentPicker/%2e%2e%2Foutside.zip';
  state.files.set(uri, new Uint8Array([1, 2, 3]));
  state.pickedUri = uri;
  await assert.rejects(api.importPlayBackup(), /Choose a Play backup archive/);
  assert.equal(state.files.has(uri), true);
});

test('directory picker fallback validates the selected folder and propagates unrelated picker errors', async (t) => {
  const { state, api } = await makeBackupModule(t);
  state.pickerError = new Error('some unrelated picker error');
  await assert.rejects(api.exportPlayBackup(), /some unrelated picker error/);
  state.pickerError = new Error('Attempting to launch an unregistered ActivityResultLauncher');
  state.legacyPickerResult = { granted: true, directoryUri: 'file:///missing-folder' };
  await assert.rejects(api.exportPlayBackup(), /selected backup folder is no longer available/);
  state.legacyPickerResult = { granted: false };
  state.legacyPickerError = new Error('legacy permission request failed');
  await assert.rejects(api.exportPlayBackup(), /legacy permission request failed/);
  assert.deepEqual([...state.files.keys()], []);
});

test('corrupt and truncated ZIPs fail before catalog commit; failed export removes its partial archive', async (t) => {
  const { state, api, Directory } = await makeBackupModule(t);
  state.pickerDirectory = new Directory('file:///export'); state.pickerDirectory.create();
  state.files.set(`file:///documents/play-library/${clipId}.wav`, wavFixture());
  state.clips = [clip];
  const exported = await api.exportPlayBackup();
  const valid = state.files.get(exported.folderUri);
  const corrupt = valid.slice(); corrupt[70] ^= 0xff;
  state.files.set('file:///cache/bad.zip', corrupt);
  state.pickedUri = 'file:///cache/bad.zip';
  state.clips = [];
  await assert.rejects(api.importPlayBackup(), /checksum|unsafe|invalid|directory/);
  assert.deepEqual(state.clips, []);
  state.files.set('file:///cache/bad.zip', valid.slice(0, valid.length - 12));
  await assert.rejects(api.importPlayBackup(), /ended|incomplete|directory/);
  assert.deepEqual(state.clips, []);

  const archivesBeforeFailure = [...state.files.keys()].filter((key) => key.startsWith('file:///export/Stimmyz-Play-backup-')).length;
  state.failWrite = true;
  await assert.rejects(api.exportPlayBackup(), /disk full/);
  assert.equal([...state.files.keys()].filter((key) => key.startsWith('file:///export/Stimmyz-Play-backup-')).length, archivesBeforeFailure);
  state.failWrite = false; state.failCopy = true;
  await assert.rejects(api.exportPlayBackup(), /copy failed/);
  assert.equal([...state.files.keys()].filter((key) => key.startsWith('file:///export/Stimmyz-Play-backup-')).length, archivesBeforeFailure);
  assert.equal([...state.files.keys()].filter((key) => key.startsWith('file:///cache/Stimmyz-Play-backup-')).length, 0);
});

test('interrupted metadata restore retains copied media for durable journal recovery', async (t) => {
  const { state, api, Directory } = await makeBackupModule(t);
  state.pickerDirectory = new Directory('file:///export'); state.pickerDirectory.create();
  state.files.set(`file:///documents/play-library/${clipId}.wav`, wavFixture());
  state.clips = [clip];
  const exported = await api.exportPlayBackup();
  state.pickedUri = exported.folderUri; state.clips = []; state.files.delete(`file:///documents/play-library/${clipId}.wav`); state.failTransactionAt = 0;
  await assert.rejects(api.importPlayBackup(), /snapshot write interrupted/);
  assert.deepEqual(state.clips, []);
  assert.equal(state.files.has(`file:///documents/play-library/${clipId}.wav`), true);
  state.failTransactionAt = null;
  state.recover();
  assert.deepEqual(state.clips, [clip]);
  assert.equal(state.files.has(`file:///documents/play-library/${clipId}.wav`), true);
});

test('export rejects malformed audio and oversized artwork before creating an archive', async (t) => {
  const { state, api, Directory } = await makeBackupModule(t);
  state.pickerDirectory = new Directory('file:///export'); state.pickerDirectory.create();
  state.clips = [clip];
  state.files.set(`file:///documents/play-library/${clipId}.wav`, new TextEncoder().encode('not a wav'));
  await assert.rejects(api.exportPlayBackup(), /valid WAV header/);
  state.files.set(`file:///documents/play-library/${clipId}.wav`, wavFixture());
  state.presentations[clipId] = { artwork: { fileName: `${clipId}.jpg`, source: 'gallery', title: 'Fixture' } };
  state.files.set(`file:///documents/play-library/artwork/${clipId}.jpg`, jpegFixture(513, 512));
  await assert.rejects(api.exportPlayBackup(), /512 px/);
  state.files.set(`file:///documents/play-library/artwork/${clipId}.jpg`, jpegFixture(512, 512));
  const result = await api.exportPlayBackup();
  assert.ok(state.files.has(result.folderUri));
});

test('import rejects audio whose ZIP and manifest CRCs are valid but whose media header is false', async (t) => {
  const { state, api } = await makeBackupModule(t);
  const fakeAudio = new TextEncoder().encode('not a wav');
  const manifest = {
    format: 'stimmyz-play-backup', version: 1, clips: [clip], boards: state.boards,
    presentations: {}, playback: {}, preferences: appSettings,
    files: [{ name: `${clipId}.wav`, sizeBytes: fakeAudio.length, crc32: crc32(fakeAudio), kind: 'audio' }],
  };
  const archive = storedZip([
    { name: `${clipId}.wav`, data: fakeAudio },
    { name: 'play-backup.json', data: new TextEncoder().encode(JSON.stringify(manifest)) },
  ]);
  state.files.set('file:///cache/bad-media.zip', archive);
  state.pickedUri = 'file:///cache/bad-media.zip';
  await assert.rejects(api.importPlayBackup(), /valid WAV header/);
  assert.deepEqual(state.clips, []);
  assert.equal(state.files.has(`file:///documents/play-library/${clipId}.wav`), false);
});

test('interrupted backup restore replays every metadata snapshot after restart at each write boundary', async (t) => {
  for (let boundary = 0; boundary < 5; boundary++) {
    const { state, api, Directory } = await makeBackupModule(t);
    state.pickerDirectory = new Directory('file:///export'); state.pickerDirectory.create();
    state.files.set(`file:///documents/play-library/${clipId}.wav`, wavFixture());
    state.clips = [clip];
    state.presentations = { [clipId]: { icon: 'bolt', color: '#123456' } };
    state.playback = { [clipId]: { gain: 1.5, repeat: 'loop' } };
    state.boards = {
      version: 1, activeBoardId: clipId,
      boards: [{ id: clipId, name: 'Saved board', pads: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', clipId }], grid: '4x4', navigation: 'pages', allowOverlap: false }],
    };
    const exported = await api.exportPlayBackup();
    const picked = exported.folderUri;
    state.files.delete(`file:///documents/play-library/${clipId}.wav`);
    state.clips = [];
    state.presentations = {};
    state.playback = {};
    state.preferences = { version: 5, appearance: 'Vanilla', quickAction: 'file', masterVolume: 1, nextPadColorIndex: 15 };
    state.boards = {
      version: 1, activeBoardId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      boards: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Main', pads: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', clipId: null }], grid: '4x4', navigation: 'pages', allowOverlap: false }],
    };
    state.pickedUri = picked;
    state.failTransactionAt = boundary;
    await assert.rejects(api.importPlayBackup(), /snapshot write interrupted/);
    assert.equal(state.pending.length, 5);
    assert.equal(state.files.has(`file:///documents/play-library/${clipId}.wav`), true, 'copied media remains for journal recovery');

    // A new process clears the transient I/O failure, then any metadata read replays the journal.
    state.failTransactionAt = null;
    state.recover();
    assert.deepEqual(state.clips, [clip]);
    assert.deepEqual(state.presentations[clipId], { icon: 'bolt', color: '#123456' });
    assert.deepEqual(state.playback[clipId], { gain: 1.5, repeat: 'loop' });
    assert.deepEqual(state.preferences, appSettings);
    assert.equal(state.boards.activeBoardId, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    assert.equal(state.pending, null);
  }
});
