import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const appPlayRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pngHeader = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x48, 0x44, 0x52]);

async function harness(t) {
  const temp = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? '.', 'play-artwork-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  globalThis.__artworkStore = { files: new Map(), dirs: new Set(['file:///cache', 'file:///documents']), failMetadata: false, manipUri: 'file:///cache/image-manipulator-result.jpg' };
  const fakeFs = `
const state=globalThis.__artworkStore;
const join=(a,b)=>String(a).replace(/\\/+$/,'')+'/'+String(b).replace(/^\\//,'');
export const Paths={cache:{uri:'file:///cache'},document:{uri:'file:///documents'}};
export class Directory{constructor(...p){this.uri=p.map(x=>x?.uri??x).reduce((a,b)=>a===undefined?String(b):join(a,b),undefined)}create({idempotent=false}={}){if(state.dirs.has(this.uri)&&!idempotent)throw Error('exists');state.dirs.add(this.uri)}}
export class File{constructor(...p){this.uri=p.map(x=>x?.uri??x).reduce((a,b)=>a===undefined?String(b):join(a,b),undefined)}get exists(){return state.files.has(this.uri)}get size(){const v=state.files.get(this.uri);return v instanceof Uint8Array?v.length:typeof v==='string'?new TextEncoder().encode(v).length:null}create({overwrite=false}={}){if(this.exists&&!overwrite)throw Error('exists');state.files.set(this.uri,new Uint8Array())}delete(){state.files.delete(this.uri)}copySync(dest){if(!this.exists)throw Error('missing');state.files.set(dest.uri,state.files.get(this.uri))}writableStream(){const file=this;return new WritableStream({write(value){const old=state.files.get(file.uri)??new Uint8Array();const next=new Uint8Array(old.length+value.length);next.set(old);next.set(value,old.length);state.files.set(file.uri,next)}})}}
`;
  const fakeFetch = `
export async function fetch(){if(globalThis.__artworkStore.fetchError)throw globalThis.__artworkStore.fetchError;return globalThis.__artworkStore.response}
`;
  const fakeManipulator = `
const state=globalThis.__artworkStore;
export const SaveFormat={JPEG:'jpeg'};
export const ImageManipulator={manipulate(){return {resize(){return this},release(){},async renderAsync(){return {width:320,height:240,release(){},async saveAsync(){state.files.set(state.manipUri,new Uint8Array([1,2,3]));return {uri:state.manipUri}}}}}}};
`;
  const fakePresentation = `
export function presentationReferencesArtwork(){return false}
export function setClipArtwork(){if(globalThis.__artworkStore.failMetadata)throw Error('metadata write failed')}
`;
  const fsPath = join(temp, 'fake-fs.mjs'); const fetchPath = join(temp, 'fake-fetch.mjs'); const manipPath = join(temp, 'fake-manipulator.mjs'); const presentationPath = join(temp, 'fake-presentation.mjs');
  await Promise.all([writeFile(fsPath, fakeFs), writeFile(fetchPath, fakeFetch), writeFile(manipPath, fakeManipulator), writeFile(presentationPath, fakePresentation)]);
  let source = await readFile(join(appPlayRoot, 'src/media/artwork.ts'), 'utf8');
  source = source.replace("from 'expo-file-system'", `from '${pathToFileURL(fsPath).href}'`)
    .replace("from 'expo/fetch'", `from '${pathToFileURL(fetchPath).href}'`)
    .replace("from 'expo-image-manipulator'", `from '${pathToFileURL(manipPath).href}'`)
    .replace("from '../data/protocol.ts'", `from '${pathToFileURL(join(temp, 'protocol.mjs')).href}'`)
    .replace("from '../data/snapshot.ts'", `from '${pathToFileURL(join(temp, 'snapshot.mjs')).href}'`)
    .replace("from '../data/presentation.ts'", `from '${pathToFileURL(presentationPath).href}'`)
    .replace("from './memeSearch.ts'", "from './memeSearch.mjs'");
  await writeFile(join(temp, 'artwork.ts'), source);
  await writeFile(join(temp, 'protocol.mjs'), `export const isUuid=(v)=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)`);
  await writeFile(join(temp, 'snapshot.mjs'), `import{Directory,Paths}from'${pathToFileURL(fsPath).href}';export const PLAY_LIBRARY_DIRECTORY=new Directory(Paths.document,'play-library')`);
  await writeFile(join(temp, 'memeSearch.mjs'), '');
  return { state: globalThis.__artworkStore, async load() { return import(pathToFileURL(join(temp, 'artwork.ts')).href); } };
}

const meme = { id: '12345', name: 'Template', url: 'https://i.imgflip.com/12345.jpg', width: 320, height: 240, pageUrl: 'https://imgflip.com/memetemplate/12345' };
function response(chunks, headers = { 'content-type': 'image/png' }) {
  let index = 0;
  return { ok: true, status: 200, url: meme.url, headers: new Headers(headers), body: new ReadableStream({ pull(controller) { if (index < chunks.length) controller.enqueue(chunks[index++]); else controller.close(); } }) };
}

test('artwork streaming rejects a response over 2 MiB and removes its partial cache file', async (t) => {
  const h = await harness(t); const artwork = await h.load();
  const chunk = new Uint8Array(1024 * 1024); chunk.set(pngHeader);
  h.state.response = response([chunk, new Uint8Array(1024 * 1024 + 1)]);
  await assert.rejects(artwork.prepareMemeArtwork(meme), /too large/);
  assert.deepEqual([...h.state.files.keys()], []);
});

test('artwork cancellation leaves no partial cache file', async (t) => {
  const h = await harness(t); const artwork = await h.load();
  h.state.response = response([pngHeader]);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(artwork.prepareMemeArtwork(meme, controller.signal), { name: 'AbortError' });
  assert.deepEqual([...h.state.files.keys()], []);
});

test('prepared drafts have an owned cache path and metadata failure removes the copied thumbnail', async (t) => {
  const h = await harness(t); const artwork = await h.load();
  h.state.response = response([pngHeader]);
  const draft = await artwork.prepareMemeArtwork(meme);
  assert.match(draft.uri, /^file:\/\/\/cache\/play-imgflip-artwork\/draft-[a-z0-9]+-[a-z0-9]+\.jpg$/i);
  h.state.failMetadata = true;
  assert.throws(() => artwork.commitDraftArtwork('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', draft), /metadata write failed/);
  assert.equal(h.state.files.has('file:///documents/play-library/artwork/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'), false);
  artwork.disposeDraftArtwork(draft);
  assert.equal(h.state.files.has(draft.uri), false);
});
