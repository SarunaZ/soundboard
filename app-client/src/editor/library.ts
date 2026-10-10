import { Directory, File, Paths } from 'expo-file-system';

import { appendClip, parseClipCatalog, removeClip, type ClipCatalog, type SavedClip } from './catalog';
import { isUuid } from './protocol';
import { generatedClipId } from './catalog';
import { boundedSignal } from './network';

const LIBRARY_DIRECTORY = new Directory(Paths.document, 'local-clips');
const CACHE_FILE = new File(LIBRARY_DIRECTORY, 'catalog.json');
const BACKUP_FILE = new File(LIBRARY_DIRECTORY, 'catalog.backup.json');
const NEXT_FILE = new File(LIBRARY_DIRECTORY, 'catalog.next.json');
const MAX_RENDER_BYTES = 2 * 1024 * 1024;

function audioFile(id: string): File {
  if (!isUuid(id)) throw new Error('Invalid local clip ID.');
  return new File(LIBRARY_DIRECTORY, `${id}.m4a`);
}

function emptyCatalog(): ClipCatalog {
  return { version: 1, clips: [] };
}

function readCatalogFile(file: File): ClipCatalog {
  return parseClipCatalog(JSON.parse(file.textSync()) as unknown);
}

function readCatalog(): ClipCatalog {
  if (CACHE_FILE.exists) {
    try {
      return readCatalogFile(CACHE_FILE);
    } catch (error) {
      if (BACKUP_FILE.exists) {
        try {
          return readCatalogFile(BACKUP_FILE);
        } catch {
          // Preserve both files and show the corruption rather than silently
          // replacing the only remaining catalog state.
        }
      }
      throw error;
    }
  }
  if (BACKUP_FILE.exists) return readCatalogFile(BACKUP_FILE);
  return emptyCatalog();
}

function writeCatalog(catalog: ClipCatalog): void {
  const validated = parseClipCatalog(catalog);
  LIBRARY_DIRECTORY.create({ intermediates: true, idempotent: true });
  NEXT_FILE.create({ overwrite: true });
  NEXT_FILE.write(JSON.stringify(validated));

  // A prior copy remains available if the process is interrupted while the
  // new snapshot is being moved into place.
  if (CACHE_FILE.exists) {
    try {
      readCatalogFile(CACHE_FILE);
      CACHE_FILE.copySync(BACKUP_FILE, { overwrite: true });
    } catch {
      // If the primary is already damaged, retain the previous backup.
    }
  }
  NEXT_FILE.moveSync(CACHE_FILE, { overwrite: true });
}

function isMp4(file: File): boolean {
  if (!file.exists || file.size <= 8 || file.size > MAX_RENDER_BYTES) return false;
  const bytes = file.bytesSync().subarray(0, 12);
  return bytes.length >= 8 &&
    String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!) === 'ftyp';
}

export interface LocalClip extends SavedClip {
  uri: string;
  missing: boolean;
}

export function localClipUri(id: string): string {
  return audioFile(id).uri;
}

export function loadLocalClips(): LocalClip[] {
  const catalog = readCatalog();
  return catalog.clips.map((clip) => {
    const file = audioFile(clip.id);
    const missing = !file.exists || file.size <= 0;
    return { ...clip, uri: missing ? '' : file.uri, missing };
  });
}

export async function saveRenderedClip(
  url: string,
  token: string,
  title: string,
  durationMs: number,
  signal: AbortSignal,
): Promise<LocalClip> {
  const cleanTitle = title.trim().slice(0, 100);
  if (!cleanTitle) throw new Error('Give this clip a name before saving.');
  if (!Number.isInteger(durationMs) || durationMs <= 0 || durationMs > 60_000) throw new Error('The rendered clip has an invalid duration.');

  LIBRARY_DIRECTORY.create({ intermediates: true, idempotent: true });
  const id = generatedClipId();
  const staging = new File(Paths.cache, `soundboard-render-${id}.m4a`);
  const download = boundedSignal(signal, 120_000);
  let finalFile: File | null = null;
  let savedCatalog = false;
  try {
    const downloaded = await File.downloadFileAsync(url, staging, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'audio/mp4' },
      signal: download.signal,
    });
    if (download.timedOut()) throw new Error('Saving the audio file timed out. Try again.');
    if (!isMp4(downloaded)) throw new Error('The editor returned an empty or invalid audio file.');

    finalFile = audioFile(id);
    await downloaded.move(finalFile);
    if (!isMp4(finalFile)) throw new Error('The saved audio file failed validation.');
    if (signal.aborted) throw new Error('Saving was cancelled.');

    const entry: SavedClip = {
      id,
      title: cleanTitle,
      durationMs,
      createdAt: new Date().toISOString(),
    };
    const catalog = readCatalog();
    writeCatalog(appendClip(catalog, entry));
    savedCatalog = true;
    return { ...entry, uri: finalFile.uri, missing: false };
  } catch (error) {
    if (staging.exists) staging.delete();
    if (finalFile?.exists && !savedCatalog) finalFile.delete();
    if (download.timedOut()) throw new Error('Saving the audio file timed out. Try again.');
    throw error;
  } finally {
    download.dispose();
  }
}

export function deleteLocalClip(id: string): void {
  const catalog = readCatalog();
  const nextCatalog = removeClip(catalog, id);
  writeCatalog(nextCatalog);
  const file = audioFile(id);
  if (file.exists) file.delete();
}
