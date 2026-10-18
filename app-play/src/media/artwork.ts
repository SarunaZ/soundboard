import { Directory, File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';

import { isUuid } from '../data/protocol.ts';
import { PLAY_LIBRARY_DIRECTORY } from '../data/snapshot.ts';
import { presentationReferencesArtwork, setClipArtwork, type ClipArtwork } from '../data/presentation.ts';
import type { MemeImage } from './memeSearch.ts';

export interface DraftArtwork {
  uri: string;
  sourceId: string;
  sourceUrl: string;
  title: string;
}

const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 4096;
const MAX_IMAGE_PIXELS = 16_000_000;
const MAX_THUMBNAIL_SIDE = 512;
const REQUEST_TIMEOUT_MS = 15_000;
const IMGFLIP_HOST = 'i.imgflip.com';
const TEMP_DIRECTORY = new Directory(Paths.cache, 'play-imgflip-artwork');
const OWNED_DIRECTORY = new Directory(PLAY_LIBRARY_DIRECTORY, 'artwork');

function imageUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== IMGFLIP_HOST || url.username || url.password ||
      !/\.(?:jpe?g|png|webp)$/i.test(url.pathname)) {
    throw new Error('This Imgflip image URL is invalid. Choose another template.');
  }
  return url;
}

function randomName(): string {
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function isMimeCompatible(mime: string, bytes: Uint8Array): boolean {
  const type = mime.split(';', 1)[0]?.trim().toLowerCase();
  const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
  return (png && type === 'image/png') || (jpeg && type === 'image/jpeg') || (webp && type === 'image/webp');
}

function abortError(): Error {
  const error = new Error('Artwork download was cancelled.');
  error.name = 'AbortError';
  return error;
}

async function downloadBounded(url: URL, destination: File, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError();
  const controller = new AbortController();
  let timedOut = false;
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
  let writer: WritableStreamDefaultWriter<Uint8Array<ArrayBufferLike>> | undefined;
  try {
    const response = await expoFetch(url.href, { method: 'GET', signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new Error(`Imgflip image download failed (HTTP ${response.status}).`);
    const finalUrl = response.url ? new URL(response.url) : url;
    if (finalUrl.protocol !== 'https:' || finalUrl.hostname !== IMGFLIP_HOST) throw new Error('Imgflip returned an image from an unexpected host.');
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_BYTES) throw new Error('This image is too large to save. Choose a smaller template.');
    const mime = response.headers.get('content-type') ?? '';
    if (!response.body) throw new Error('Imgflip returned an empty image.');
    reader = response.body.getReader();
    writer = destination.writableStream().getWriter();
    let total = 0;
    const header = new Uint8Array(16);
    let headerLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DOWNLOAD_BYTES) throw new Error('This image is too large to save. Choose a smaller template.');
      if (headerLength < header.length) {
        const take = Math.min(header.length - headerLength, value.length);
        header.set(value.subarray(0, take), headerLength);
        headerLength += take;
      }
      await writer.write(value);
    }
    if (!total || !isMimeCompatible(mime, header.subarray(0, headerLength))) throw new Error('Imgflip returned an unsupported or malformed image.');
    await writer.close();
    writer = undefined;
  } catch (error) {
    await reader?.cancel().catch(() => {});
    await writer?.abort().catch(() => {});
    if (signal?.aborted) throw abortError();
    if (timedOut) throw new Error('Imgflip took too long to respond. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

/** Download, decode and downsize one Imgflip template into a private draft thumbnail. */
export async function prepareMemeArtwork(meme: MemeImage, signal?: AbortSignal): Promise<DraftArtwork> {
  const url = imageUrl(meme.url);
  if (!/^\d{1,30}$/.test(meme.id) || !meme.name.trim()) throw new Error('This Imgflip template is invalid. Choose another image.');
  if (!Number.isInteger(meme.width) || !Number.isInteger(meme.height) || meme.width < 1 || meme.height < 1 ||
      meme.width > MAX_IMAGE_DIMENSION || meme.height > MAX_IMAGE_DIMENSION || meme.width * meme.height > MAX_IMAGE_PIXELS) {
    throw new Error('This image is too large to save. Choose a smaller template.');
  }
  TEMP_DIRECTORY.create({ intermediates: true, idempotent: true });
  const raw = new File(TEMP_DIRECTORY, `${randomName()}.source`);
  let thumbnail: File | undefined;
  let generated: File | undefined;
  let context: ReturnType<typeof ImageManipulator.manipulate> | undefined;
  let decoded: ImageRef | undefined;
  let rendered: ImageRef | undefined;
  try {
    raw.create();
    await downloadBounded(url, raw, signal);
    if (signal?.aborted) throw abortError();

    // Native decode verifies the complete raster and gives actual dimensions;
    // header and response metadata are never trusted for the pixel budget.
    context = ImageManipulator.manipulate(raw.uri);
    decoded = await context.renderAsync();
    const { width, height } = decoded;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
      throw new Error('This image is too large to save. Choose a smaller template.');
    }
    decoded.release();
    decoded = undefined;
    if (Math.max(width, height) > MAX_THUMBNAIL_SIDE) {
      context.release();
      context = ImageManipulator.manipulate(raw.uri);
      if (width >= height) context.resize({ width: MAX_THUMBNAIL_SIDE, height: null });
      else context.resize({ width: null, height: MAX_THUMBNAIL_SIDE });
    }
    rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
    rendered.release();
    rendered = undefined;
    context.release();
    context = undefined;
    generated = new File(saved.uri);
    if (!generated.exists || generated.size <= 0 || generated.size > 1024 * 1024) throw new Error('Could not create a small artwork preview. Choose another image.');
    thumbnail = new File(TEMP_DIRECTORY, `${randomName()}.jpg`);
    generated.copySync(thumbnail);
    generated.delete();
    generated = undefined;
    if (!thumbnail.exists || thumbnail.size <= 0 || thumbnail.size > 1024 * 1024) throw new Error('Could not create a small artwork preview. Choose another image.');
    if (signal?.aborted) throw abortError();
    const title = meme.name.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120).trim();
    if (!title) throw new Error('This Imgflip template has no valid title. Choose another image.');
    return { uri: thumbnail.uri, sourceId: meme.id, sourceUrl: `https://imgflip.com/memetemplate/${meme.id}`, title };
  } catch (error) {
    if (thumbnail?.exists && isDraftCacheUri(thumbnail.uri)) thumbnail.delete();
    throw error;
  } finally {
    decoded?.release();
    rendered?.release();
    context?.release();
    if (generated?.exists && generated.uri.startsWith(Paths.cache.uri)) generated.delete();
    if (raw.exists) raw.delete();
  }
}

function isDraftCacheUri(uri: string): boolean {
  const prefix = `${TEMP_DIRECTORY.uri.replace(/\/+$/, '')}/`;
  if (!uri.startsWith(prefix)) return false;
  const name = uri.slice(prefix.length);
  if (!/^draft-[a-z0-9]+-[a-z0-9]+\.jpg$/i.test(name)) return false;
  return new File(TEMP_DIRECTORY, name).uri === uri;
}

export function disposeDraftArtwork(draft: DraftArtwork): void {
  if (!draft || typeof draft.uri !== 'string' || !isDraftCacheUri(draft.uri)) return;
  const file = new File(draft.uri);
  if (file.exists) file.delete();
}

function ownedArtworkFile(fileName: string): File {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i.test(fileName)) throw new Error('Invalid local artwork filename.');
  return new File(OWNED_DIRECTORY, fileName);
}

/** Copy a draft thumbnail into owned Library storage and persist its provenance. */
export function commitDraftArtwork(clipId: string, draft: DraftArtwork): { artwork: ClipArtwork; artworkUri: string } {
  if (!isUuid(clipId) || !draft || typeof draft.uri !== 'string' || !isDraftCacheUri(draft.uri)) throw new Error('The artwork draft is unavailable.');
  const source = new File(draft.uri);
  if (!source.exists || source.size <= 0 || source.size > 1024 * 1024) throw new Error('The artwork draft is missing or invalid.');
  const fileName = `${clipId}.jpg`;
  const destination = ownedArtworkFile(fileName);
  if (destination.exists) throw new Error('Artwork is already saved for this clip.');
  OWNED_DIRECTORY.create({ intermediates: true, idempotent: true });
  const artwork: ClipArtwork = { fileName, source: 'imgflip', sourceId: draft.sourceId, sourceUrl: draft.sourceUrl, title: draft.title };
  try {
    source.copySync(destination);
    setClipArtwork(clipId, artwork);
  } catch (error) {
    if (destination.exists && !presentationReferencesArtwork(fileName)) destination.delete();
    throw error;
  }
  return { artwork, artworkUri: destination.uri };
}

export function resolveArtworkUri(artwork: ClipArtwork | undefined): string | undefined {
  if (!artwork) return undefined;
  try {
    const file = ownedArtworkFile(artwork.fileName);
    return file.exists && file.size > 0 ? file.uri : undefined;
  } catch { return undefined; }
}

export function deleteOwnedArtwork(artwork: ClipArtwork, stillReferenced: (fileName: string) => boolean): void {
  const file = ownedArtworkFile(artwork.fileName);
  if (file.exists && !stillReferenced(artwork.fileName)) file.delete();
}
