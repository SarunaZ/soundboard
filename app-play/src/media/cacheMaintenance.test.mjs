import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const appPlayRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function harness(t) {
  const temp = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? '.', 'play-cache-maintenance-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  globalThis.__playCacheMaintenance = { files: new Map(), dirs: new Set(['file:///cache', 'file:///documents']) };
  const fsPath = join(temp, 'fake-fs.mjs');
  await writeFile(fsPath, `
const s=globalThis.__playCacheMaintenance;
const join=(a,b)=>String(a).replace(/\\/+$/,'')+'/'+String(b).replace(/^\\//,'');
export const Paths={cache:{uri:'file:///cache'}};
export class File{constructor(...p){this.uri=p.map(x=>x?.uri??x).reduce((a,b)=>a===undefined?String(b):join(a,b),undefined)}get name(){return this.uri.split('/').pop()}get exists(){return s.files.has(this.uri)}delete(){s.files.delete(this.uri)}}
export class Directory{constructor(...p){this.uri=p.map(x=>x?.uri??x).reduce((a,b)=>a===undefined?String(b):join(a,b),undefined)}get name(){return this.uri.split('/').pop()}get exists(){return s.dirs.has(this.uri)}list(){const prefix=this.uri.replace(/\\/+$/,'')+'/';const rows=[];for(const uri of s.files.keys())if(uri.startsWith(prefix)&&!uri.slice(prefix.length).includes('/'))rows.push(new File(uri));for(const uri of s.dirs)if(uri.startsWith(prefix)&&!uri.slice(prefix.length).includes('/'))rows.push(new Directory(uri));return rows}delete(){for(const uri of [...s.files.keys()])if(uri.startsWith(this.uri+'/'))s.files.delete(uri);for(const uri of [...s.dirs])if(uri===this.uri||uri.startsWith(this.uri+'/'))s.dirs.delete(uri)}}
`);
  let source = await readFile(join(appPlayRoot, 'src/media/cacheMaintenance.ts'), 'utf8');
  source = source.replace("from 'expo-file-system'", `from '${pathToFileURL(fsPath).href}'`);
  const modulePath = join(temp, 'cacheMaintenance.ts');
  await writeFile(modulePath, source);
  return { state: globalThis.__playCacheMaintenance, api: await import(pathToFileURL(modulePath).href) };
}

test('startup cleanup removes only exact abandoned backup and artwork cache names', async (t) => {
  const { state, api } = await harness(t);
  const archive = 'file:///cache/Stimmyz-Play-backup-ab12-cd345678.zip';
  const malformedArchive = 'file:///cache/Stimmyz-Play-backup-../-bad.zip';
  const providerCopy = 'file:///cache/DocumentPicker/picked.zip';
  state.files.set(archive, 'old backup');
  state.files.set(malformedArchive, 'keep');
  state.files.set(providerCopy, 'keep');
  const editorDir = 'file:///cache/soundboard-editor-123e4567-e89b-42d3-a456-426614174000';
  const malformedEditorDir = 'file:///cache/soundboard-editor-not-a-uuid';
  state.dirs.add(editorDir);
  state.dirs.add(malformedEditorDir);
  state.files.set(`${editorDir}/source.wav`, 'stale editor source');
  state.files.set(`${malformedEditorDir}/keep.wav`, 'keep');

  const stagingRoot = 'file:///cache/play-backup-staging';
  const importDir = `${stagingRoot}/import-mabc-xyz123`;
  const malformedImportDir = `${stagingRoot}/import-../escaped`;
  state.dirs.add(stagingRoot);
  state.dirs.add(importDir);
  state.dirs.add(malformedImportDir);
  state.files.set(`${importDir}/partial.wav`, 'partial');
  state.files.set(`${malformedImportDir}/keep.wav`, 'keep');

  const artworkRoot = 'file:///cache/play-gallery-artwork';
  const draft = `${artworkRoot}/draft-mabc-xyz123.jpg`;
  state.dirs.add(artworkRoot);
  state.files.set(draft, 'old draft');
  state.files.set(`${artworkRoot}/draft-../escaped.jpg`, 'keep');
  state.files.set(`${artworkRoot}/saved-photo.jpg`, 'keep');

  api.cleanupStalePlayCache();
  assert.equal(state.files.has(archive), false);
  assert.equal(state.dirs.has(editorDir), false);
  assert.equal(state.files.has(`${editorDir}/source.wav`), false);
  assert.equal(state.files.has(`${importDir}/partial.wav`), false);
  assert.equal(state.dirs.has(importDir), false);
  assert.equal(state.files.has(draft), false);
  for (const uri of [malformedArchive, providerCopy, `${malformedImportDir}/keep.wav`, `${artworkRoot}/draft-../escaped.jpg`, `${artworkRoot}/saved-photo.jpg`]) {
    assert.equal(state.files.has(uri), true, `preserved ${uri}`);
  }
  assert.equal(state.dirs.has(malformedImportDir), true);
  assert.equal(state.dirs.has(malformedEditorDir), true);
});

test('cache cleanup runs once and leaves matching files created later in the process', async (t) => {
  const { state, api } = await harness(t);
  api.cleanupStalePlayCache();
  const activeArchive = 'file:///cache/Stimmyz-Play-backup-fabc-87654321.zip';
  const activeDraft = 'file:///cache/play-gallery-artwork/draft-fabc-87654321.jpg';
  state.files.set(activeArchive, 'active export');
  state.dirs.add('file:///cache/play-gallery-artwork');
  state.files.set(activeDraft, 'active draft');
  api.cleanupStalePlayCache();
  assert.equal(state.files.get(activeArchive), 'active export');
  assert.equal(state.files.get(activeDraft), 'active draft');
});
