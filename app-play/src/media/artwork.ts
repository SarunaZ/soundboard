import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';

import { isUuid } from '../data/protocol.ts';
import { PLAY_LIBRARY_DIRECTORY } from '../data/snapshot.ts';
import { createArtworkReferenceChecker, presentationReferencesArtwork, setClipArtwork, type ClipArtwork } from '../data/presentation.ts';

export interface DraftArtwork { uri: string; source: 'gallery'; title: string; }

const MAX_IMAGE_DIMENSION = 4096;
const MAX_IMAGE_PIXELS = 16_000_000;
const MAX_THUMBNAIL_SIDE = 512;
const TEMP_DIRECTORY = new Directory(Paths.cache, 'play-gallery-artwork');
const OWNED_DIRECTORY = new Directory(PLAY_LIBRARY_DIRECTORY, 'artwork');

function randomName(): string {
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function randomArtworkId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

/** Decode a user-selected image and keep only a bounded, private JPEG thumbnail. */
export async function prepareGalleryArtwork(uri: string, fileName: string, metadata: { mimeType?: string | null; width?: number; height?: number; fileSize?: number | null } = {}): Promise<DraftArtwork> {
  if (typeof uri !== 'string' || !uri || typeof fileName !== 'string') throw new Error('Choose an image from Gallery.');
  const mime = metadata.mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  if (mime && !['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('Choose a JPEG, PNG, or WebP image.');
  if (typeof metadata.fileSize === 'number' && metadata.fileSize > 32 * 1024 * 1024) throw new Error('Choose an image that is 32 MB or smaller.');
  if (metadata.width !== undefined || metadata.height !== undefined) {
    const { width, height } = metadata;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width! < 1 || height! < 1 || width! > MAX_IMAGE_DIMENSION || height! > MAX_IMAGE_DIMENSION || width! * height! > MAX_IMAGE_PIXELS) {
      throw new Error('This image is too large to save. Choose a smaller image.');
    }
  }
  const raw = new File(uri);
  if (!raw.exists || raw.size <= 0) throw new Error('That image is no longer available. Choose it again.');
  if (raw.size > 32 * 1024 * 1024) throw new Error('Choose an image that is 32 MB or smaller.');
  TEMP_DIRECTORY.create({ intermediates: true, idempotent: true });
  let context: ReturnType<typeof ImageManipulator.manipulate> | undefined;
  let decoded: ImageRef | undefined;
  let rendered: ImageRef | undefined;
  let generated: File | undefined;
  let thumbnail: File | undefined;
  try {
    context = ImageManipulator.manipulate(raw.uri);
    decoded = await context.renderAsync();
    const { width, height } = decoded;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
      throw new Error('This image is too large to save. Choose a smaller image.');
    }
    decoded.release(); decoded = undefined;
    const side = Math.min(width, height);
    context.release(); context = ImageManipulator.manipulate(raw.uri);
    context.crop({ originX: Math.floor((width - side) / 2), originY: Math.floor((height - side) / 2), width: side, height: side });
    if (side > MAX_THUMBNAIL_SIDE) context.resize({ width: MAX_THUMBNAIL_SIDE, height: MAX_THUMBNAIL_SIDE });
    rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
    rendered.release(); rendered = undefined;
    context.release(); context = undefined;
    generated = new File(saved.uri);
    if (!generated.exists || generated.size <= 0 || generated.size > 1024 * 1024) throw new Error('Could not create a small artwork preview. Choose another image.');
    thumbnail = new File(TEMP_DIRECTORY, `${randomName()}.jpg`);
    generated.copySync(thumbnail); generated.delete(); generated = undefined;
    if (!thumbnail.exists || thumbnail.size <= 0 || thumbnail.size > 1024 * 1024) throw new Error('Could not create a small artwork preview. Choose another image.');
    const title = fileName.replace(/\.[^.]+$/, '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120).trim() || 'Gallery image';
    return { uri: thumbnail.uri, source: 'gallery', title };
  } catch (error) {
    if (thumbnail?.exists && isDraftCacheUri(thumbnail.uri)) thumbnail.delete();
    throw error;
  } finally {
    decoded?.release(); rendered?.release(); context?.release();
    if (generated?.exists && generated.uri.startsWith(Paths.cache.uri)) generated.delete();
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

/** Copy the new thumbnail before switching metadata; failed saves retain old art. */
export function commitDraftArtwork(clipId: string, draft: DraftArtwork, replaceExisting = false): { artwork: ClipArtwork; artworkUri: string } {
  if (!isUuid(clipId) || !draft || typeof draft.uri !== 'string' || !isDraftCacheUri(draft.uri)) throw new Error('The artwork draft is unavailable.');
  const source = new File(draft.uri);
  if (!source.exists || source.size <= 0 || source.size > 1024 * 1024) throw new Error('The artwork draft is missing or invalid.');
  const fileName = `${replaceExisting ? randomArtworkId() : clipId}.jpg`;
  const destination = ownedArtworkFile(fileName);
  if (destination.exists) throw new Error('Artwork is already saved for this clip.');
  OWNED_DIRECTORY.create({ intermediates: true, idempotent: true });
  const artwork: ClipArtwork = { fileName, source: 'gallery', title: draft.title };
  try {
    source.copySync(destination);
    setClipArtwork(clipId, artwork);
    pruneOwnedArtwork(createArtworkReferenceChecker());
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
  try {
    const file = ownedArtworkFile(artwork.fileName);
    if (file.exists && !stillReferenced(artwork.fileName)) file.delete();
  } catch {
    // Artwork cleanup is best-effort after the metadata transaction commits.
  }
}

/** Best-effort cleanup of only unreferenced UUID JPEGs in our private artwork folder. */
export function pruneOwnedArtwork(stillReferenced: (fileName: string) => boolean): void {
  try {
    for (const entry of OWNED_DIRECTORY.list()) {
      if (!(entry instanceof File) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i.test(entry.name)) continue;
      if (ownedArtworkFile(entry.name).uri !== entry.uri || stillReferenced(entry.name)) continue;
      if (entry.exists) entry.delete();
    }
  } catch {
    // Cleanup must never turn a committed artwork metadata update into a failure.
  }
}
