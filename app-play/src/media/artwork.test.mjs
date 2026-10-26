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
export class Directory{constructor(...p){this.uri=p.map(x=>x?.uri??x).reduce((a,b)=>a===undefined?String(b):join(a,b),undefined)}create({idempotent=false}={}){if(state.dirs.has(this.uri)&&!idempotent)throw Error('exists');state.dirs.add(this.uri)}list(){if(state.failList)throw Error('list failed');const prefix=this.uri.replace(/\\/+$/,'')+'/';return [...state.files.keys()].filter(uri=>uri.startsWith(prefix)&&!uri.slice(prefix.length).includes('/')).map(uri=>new File(uri))}}
export class File{constructor(...p){this.uri=p.map(x=>x?.uri??x).reduce((a,b)=>a===undefined?String(b):join(a,b),undefined)}get name(){return this.uri.split('/').pop()}get exists(){return state.files.has(this.uri)}get size(){const v=state.files.get(this.uri);return v instanceof Uint8Array?v.length:typeof v==='string'?new TextEncoder().encode(v).length:null}create({overwrite=false}={}){if(this.exists&&!overwrite)throw Error('exists');state.files.set(this.uri,new Uint8Array())}delete(){state.files.delete(this.uri)}copySync(dest){if(!this.exists)throw Error('missing');state.files.set(dest.uri,state.files.get(this.uri))}writableStream(){const file=this;return new WritableStream({write(value){const old=state.files.get(file.uri)??new Uint8Array();const next=new Uint8Array(old.length+value.length);next.set(old);next.set(value,old.length);state.files.set(file.uri,next)}})}}
`;
  const fakeManipulator = `
const state=globalThis.__artworkStore;
export const SaveFormat={JPEG:'jpeg'};
export const ImageManipulator={manipulate(){return {resize(){return this},crop(){return this},release(){},async renderAsync(){if(state.corrupt)throw Error('corrupt image');return {width:320,height:240,release(){},async saveAsync(){state.files.set(state.manipUri,new Uint8Array([1,2,3]));return {uri:state.manipUri}}}}}}};
`;
  const fakePresentation = `
export function presentationReferencesArtwork(fileName){const s=globalThis.__artworkStore;return s.art?.fileName===fileName||s.refs?.has(fileName)}
export function createArtworkReferenceChecker(){const s=globalThis.__artworkStore;const refs=new Set(s.refs??[]);if(s.art)refs.add(s.art.fileName);return name=>refs.has(name)}
export function setClipArtwork(_id,art){const s=globalThis.__artworkStore;if(s.failMetadata)throw Error('metadata write failed');if(s.art){s.refs??=new Set();s.refs.add(s.art.fileName)}s.art=art}
`;
  const fsPath = join(temp, 'fake-fs.mjs'); const manipPath = join(temp, 'fake-manipulator.mjs'); const presentationPath = join(temp, 'fake-presentation.mjs');
  await Promise.all([writeFile(fsPath, fakeFs), writeFile(manipPath, fakeManipulator), writeFile(presentationPath, fakePresentation)]);
  let source = await readFile(join(appPlayRoot, 'src/media/artwork.ts'), 'utf8');
  source = source.replace("from 'expo-file-system'", `from '${pathToFileURL(fsPath).href}'`)
    .replace("from 'expo-image-manipulator'", `from '${pathToFileURL(manipPath).href}'`)
    .replace("from '../data/protocol.ts'", `from '${pathToFileURL(join(temp, 'protocol.mjs')).href}'`)
    .replace("from '../data/snapshot.ts'", `from '${pathToFileURL(join(temp, 'snapshot.mjs')).href}'`)
    .replace("from '../data/presentation.ts'", `from '${pathToFileURL(presentationPath).href}'`);
  await writeFile(join(temp, 'artwork.ts'), source);
  await writeFile(join(temp, 'protocol.mjs'), `export const isUuid=(v)=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)`);
  await writeFile(join(temp, 'snapshot.mjs'), `import{Directory,Paths}from'${pathToFileURL(fsPath).href}';export const PLAY_LIBRARY_DIRECTORY=new Directory(Paths.document,'play-library')`);
  return { state: globalThis.__artworkStore, async load() { return import(pathToFileURL(join(temp, 'artwork.ts')).href); } };
}

test('gallery preparation rejects revoked, unsupported, oversized and invalid-dimension selections before decode', async (t) => {
  const h = await harness(t); const artwork = await h.load();
  await assert.rejects(artwork.prepareGalleryArtwork('file:///cache/revoked.png', 'photo.png'), /no longer available/);
  h.state.files.set('file:///cache/DocumentPicker/photo.png', pngHeader);
  await assert.rejects(artwork.prepareGalleryArtwork('file:///cache/DocumentPicker/photo.png', 'photo.svg', { mimeType: 'image/svg+xml' }), /JPEG, PNG, or WebP/);
  await assert.rejects(artwork.prepareGalleryArtwork('file:///cache/DocumentPicker/photo.png', 'photo.png', { fileSize: 32 * 1024 * 1024 + 1 }), /32 MB or smaller/);
  await assert.rejects(artwork.prepareGalleryArtwork('file:///cache/DocumentPicker/photo.png', 'photo.png', { width: 5000, height: 3000 }), /too large/);
  assert.deepEqual([...h.state.files.keys()], ['file:///cache/DocumentPicker/photo.png']);
});

test('corrupt gallery images leave no draft or owned artwork behind', async (t) => {
  const h = await harness(t); const artwork = await h.load();
  const uri = 'file:///cache/DocumentPicker/corrupt.png';
  h.state.files.set(uri, new Uint8Array([1, 2, 3]));
  h.state.corrupt = true;
  await assert.rejects(artwork.prepareGalleryArtwork(uri, 'corrupt.png', { mimeType: 'image/png', width: 120, height: 120 }), /corrupt image/);
  assert.deepEqual([...h.state.files.keys()], [uri]);
});

test('prepared gallery drafts have a private cache path and failed metadata writes remove the new copy', async (t) => {
  const h = await harness(t); const artwork = await h.load();
  h.state.files.set('file:///cache/DocumentPicker/photo.png', pngHeader);
  const draft = await artwork.prepareGalleryArtwork('file:///cache/DocumentPicker/photo.png', 'Template.png');
  assert.match(draft.uri, /^file:\/\/\/cache\/play-gallery-artwork\/draft-[a-z0-9]+-[a-z0-9]+\.jpg$/i);
  h.state.failMetadata = true;
  assert.throws(() => artwork.commitDraftArtwork('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', draft), /metadata write failed/);
  assert.equal(h.state.files.has('file:///documents/play-library/artwork/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'), false);
  artwork.disposeDraftArtwork(draft);
  assert.equal(h.state.files.has(draft.uri), false);
});

test('gallery artwork is compressed into an owned offline draft and records gallery provenance', async (t) => {
  const h = await harness(t); const artwork = await h.load();
  h.state.files.set('file:///cache/DocumentPicker/photo.png', pngHeader);
  const draft = await artwork.prepareGalleryArtwork('file:///cache/DocumentPicker/photo.png', 'Weekend photo.png');
  assert.match(draft.uri, /^file:\/\/\/cache\/play-gallery-artwork\/draft-[a-z0-9]+-[a-z0-9]+\.jpg$/i);
  assert.equal(draft.source, 'gallery');
  assert.equal(draft.title, 'Weekend photo');
  const committed = artwork.commitDraftArtwork('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', draft);
  assert.equal(committed.artwork.source, 'gallery');
  assert.equal('sourceUrl' in committed.artwork, false);
  artwork.disposeDraftArtwork(draft);
  assert.equal(h.state.files.has(draft.uri), false);
});

test('replacement metadata failure retains the previous image and removes the new copy', async (t) => {
  const h = await harness(t); const artwork = await h.load();
  const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const previousArtwork = { fileName: `${id}.jpg`, source: 'gallery', title: 'Previous image' };
  const previousUri = `file:///documents/play-library/artwork/${previousArtwork.fileName}`;
  h.state.files.set(previousUri, new Uint8Array([9, 9, 9]));
  h.state.art = previousArtwork;
  h.state.files.set('file:///cache/DocumentPicker/replacement.png', pngHeader);
  const draft = await artwork.prepareGalleryArtwork('file:///cache/DocumentPicker/replacement.png', 'Replacement.png');
  h.state.failMetadata = true;
  assert.throws(() => artwork.commitDraftArtwork(id, draft, true), /metadata write failed/);
  assert.deepEqual([...h.state.files.get(previousUri)], [9, 9, 9]);
  assert.deepEqual(h.state.art, previousArtwork);
  assert.deepEqual([...h.state.files.keys()].filter((uri) => uri.startsWith('file:///documents/play-library/artwork/')), [previousUri]);
  artwork.disposeDraftArtwork(draft);
});

test('replacement artwork uses a new owned thumbnail path and retains the old recovery image', async (t) => {
  const h = await harness(t); const artwork = await h.load();
  const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const oldArtwork = { fileName: `${id}.jpg`, source: 'gallery', title: 'Previous image' };
  const target = `file:///documents/play-library/artwork/${oldArtwork.fileName}`;
  h.state.files.set(target, new Uint8Array([9, 9, 9]));
  h.state.art = oldArtwork;
  h.state.files.set('file:///cache/DocumentPicker/replacement.png', pngHeader);
  const draft = await artwork.prepareGalleryArtwork('file:///cache/DocumentPicker/replacement.png', 'Replacement.png');
  const saved = artwork.commitDraftArtwork(id, draft, true);
  assert.notEqual(saved.artwork.fileName, oldArtwork.fileName);
  assert.deepEqual([...h.state.files.get(target)], [9, 9, 9]);
  assert.deepEqual([...h.state.files.get(saved.artworkUri)], [1, 2, 3]);
  assert.deepEqual(h.state.art, saved.artwork);
  artwork.disposeDraftArtwork(draft);
});

test('artwork pruning removes only unreferenced UUID JPEGs under the owned directory', async (t) => {
  const h = await harness(t); const artwork = await h.load();
  const dir = 'file:///documents/play-library/artwork/';
  const current = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  const recovery = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg';
  const orphan = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg';
  h.state.dirs.add(dir.slice(0, -1));
  h.state.refs = new Set([current, recovery]);
  for (const name of [current, recovery, orphan, 'not-an-id.jpg', 'image.png']) h.state.files.set(`${dir}${name}`, 'jpeg');
  const external = 'file:///documents/play-library/not-owned/dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg';
  h.state.files.set(external, 'untouched');

  artwork.pruneOwnedArtwork((fileName) => h.state.refs.has(fileName));

  assert.equal(h.state.files.has(`${dir}${current}`), true);
  assert.equal(h.state.files.has(`${dir}${recovery}`), true);
  assert.equal(h.state.files.has(`${dir}${orphan}`), false);
  assert.equal(h.state.files.has(`${dir}not-an-id.jpg`), true);
  assert.equal(h.state.files.has(`${dir}image.png`), true);
  assert.equal(h.state.files.has(external), true);

  h.state.failList = true;
  assert.doesNotThrow(() => artwork.pruneOwnedArtwork(() => false));
  assert.equal(h.state.files.has(`${dir}${current}`), true);
});
