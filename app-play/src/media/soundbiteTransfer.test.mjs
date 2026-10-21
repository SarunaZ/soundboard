import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function harness(t, { failCopy = false, failCopyAt = 1, wrongSize = false, failCommit = false } = {}) {
  const temp = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? '.', 'play-transfer-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const state = { files: new Map(), selected: null, copyCalls: [], failCopy, failCopyAt, wrongSize, failCommit };
  globalThis.__transfer = state;
  const fsPath = join(temp, 'fake-fs.mjs');
  await writeFile(fsPath, `
const state=globalThis.__transfer;
const join=(a,b)=>String(a).replace(/\\/+$/,'')+'/'+String(b).replace(/^\\//,'');
export class File { constructor(...p){this.uri=p.map(x=>x?.uri??x).reduce((a,b)=>a===undefined?String(b):join(a,b),undefined)} get exists(){return state.files.has(this.uri)} get size(){return state.files.get(this.uri)?.length??null} delete(){state.files.delete(this.uri)} }
`);
  const sharedPath = join(temp, 'folderTransfer.mjs');
  await writeFile(sharedPath, `
const state=globalThis.__transfer;
export async function pickTransferFolder(signal){ if(signal?.aborted){const e=new Error('aborted');e.name='AbortError';throw e} return state.selected; }
export async function copyTransferEntry(source,entry,destination,signal){
  state.copyCalls.push(destination.uri);
  if(state.files.has(destination.uri)) throw new Error('overwrite refused');
  if(signal?.aborted){const e=new Error('aborted');e.name='AbortError';throw e}
  state.files.set(destination.uri, state.wrongSize ? 'bad' : 'a'.repeat(entry.sizeBytes));
  state.onCopied?.();
  await new Promise((resolve)=>setImmediate(resolve));
  if(signal?.aborted || (state.failCopy && state.copyCalls.length===state.failCopyAt)){state.files.delete(destination.uri);const e=new Error(signal?.aborted?'aborted':'corrupt entry CRC');if(signal?.aborted)e.name='AbortError';throw e}
}
`);
  const libraryPath = join(temp, 'library.mjs');
  await writeFile(libraryPath, `
const state=globalThis.__transfer;
export const PLAY_LIBRARY_DIRECTORY={uri:'file:///private/library',create(){}};
export function prepareImportedClips(entries){return {entries,skipped:0}}
export function commitImportedClips(prepared){if(state.failCommit)throw Error('catalog commit failed');return {imported:prepared.entries,skipped:prepared.skipped}}
`);
  let source = await readFile(join(root, 'src/media/soundbiteTransfer.ts'), 'utf8');
  source = source.replace("from 'expo-file-system'", `from '${pathToFileURL(fsPath).href}'`)
    .replace("from '../../../app-client/src/transfer/folderTransfer'", `from '${pathToFileURL(sharedPath).href}'`)
    .replace("from '../data/library'", `from '${pathToFileURL(libraryPath).href}'`)
    .replace("from '../data/snapshot'", `from '${pathToFileURL(libraryPath).href}'`);
  const modulePath = join(temp, 'soundbiteTransfer.ts');
  await writeFile(modulePath, source);
  return { state, module: await import(pathToFileURL(modulePath).href) };
}

const clip = (id) => ({ id, title: 'Imported', extension: 'wav', durationMs: 1200, createdAt: '2026-10-20T00:00:00.000Z', sizeBytes: 4, crc32: 123 });
const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const selected = (entries = [clip(id)]) => ({ directory: { uri: 'file:///transfer' }, manifest: { format: 'soundboard-transfer', version: 1, clips: entries } });

test('partial copy and catalog failure clean only files created by this import', async (t) => {
  for (const options of [{ failCopy: true, failCopyAt: 2 }, { failCommit: true }]) {
    const h = await harness(t, options);
    const secondId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    h.state.selected = selected([clip(id), clip(secondId)]);
    h.state.files.set('file:///private/library/keep.wav', 'existing');
    await assert.rejects(h.module.importSoundbites(), /CRC|catalog commit/);
    assert.equal(h.state.files.has(`file:///private/library/${id}.wav`), false);
    assert.equal(h.state.files.has(`file:///private/library/${secondId}.wav`), false);
    assert.equal(h.state.files.get('file:///private/library/keep.wav'), 'existing');
  }
});

test('size validation failure removes the incomplete copied file', async (t) => {
  const h = await harness(t, { wrongSize: true });
  h.state.selected = selected();
  await assert.rejects(h.module.importSoundbites(), /size validation/);
  assert.equal(h.state.files.has(`file:///private/library/${id}.wav`), false);
});

test('an existing private destination is never overwritten or removed', async (t) => {
  const h = await harness(t);
  h.state.selected = selected();
  const destination = `file:///private/library/${id}.wav`;
  h.state.files.set(destination, 'orphan bytes');
  await assert.rejects(h.module.importSoundbites(), /already exists/);
  assert.equal(h.state.files.get(destination), 'orphan bytes');
  assert.deepEqual(h.state.copyCalls, []);
});

test('abort between entries removes earlier copied files and leaves private files intact', async (t) => {
  const h = await harness(t);
  const secondId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  h.state.selected = selected([clip(id), clip(secondId)]);
  h.state.files.set('file:///private/library/keep.wav', 'keep');
  const controller = new AbortController();
  h.state.onCopied = () => controller.abort();
  const copy = h.module.importSoundbites(controller.signal);
  await assert.rejects(copy, (error) => error.name === 'AbortError');
  assert.equal(h.state.files.has(`file:///private/library/${id}.wav`), false);
  assert.equal(h.state.files.get('file:///private/library/keep.wav'), 'keep');
});
