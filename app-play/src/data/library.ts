import { File } from 'expo-file-system';

import { MAX_SOUNDBITES } from '../../../app-client/src/limits.ts';
import { appendClip, generatedClipId, normalizeClipTitle, parseClipCatalog, removeClip, renameClip, type AudioExtension, type ClipCatalog, type SavedClip } from './catalog';
import { isUuid } from './protocol';
import { emptyOrRecoveredSnapshot, PLAY_LIBRARY_DIRECTORY, writeSnapshot } from './snapshot.ts';
import { loadBoards, removeClipAssignments, saveBoards } from './boards.ts';
import { loadClipPresentations, presentationReferencesArtwork, removeClipPresentation, setClipPresentation, type ClipArtwork, type ClipPresentation } from './presentation.ts';
import { deleteOwnedArtwork, resolveArtworkUri } from '../media/artwork.ts';

const CATALOG_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'catalog.json');
const BACKUP_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'catalog.backup.json');
function nextCatalogFile(): File {
  // Expo move updates a File handle's URI; use a fresh handle for every write.
  return new File(PLAY_LIBRARY_DIRECTORY, 'catalog.next.json');
}

export interface LocalClip extends SavedClip {
  extension: AudioExtension;
  uri: string;
  missing: boolean;
  icon?: string;
  color?: string;
  artwork?: ClipArtwork;
  artworkUri?: string;
}

export type { ClipPresentation } from './presentation.ts';

function audioFile(id: string, extension: AudioExtension): File {
  if (!isUuid(id)) throw new Error('Invalid local clip ID.');
  return new File(PLAY_LIBRARY_DIRECTORY, `${id}.${extension}`);
}

function emptyCatalog(): ClipCatalog {
  return { version: 1, clips: [] };
}

function readCatalog(): ClipCatalog {
  return emptyOrRecoveredSnapshot(CATALOG_FILE, BACKUP_FILE, emptyCatalog, parseClipCatalog);
}

function persistCatalog(catalog: ClipCatalog): ClipCatalog {
  return writeSnapshot(catalog, parseClipCatalog, CATALOG_FILE, BACKUP_FILE, nextCatalogFile());
}

export function assertLibraryCapacity(): void {
  if (readCatalog().clips.length >= MAX_SOUNDBITES) {
    throw new Error(`The library is full. It can hold up to ${MAX_SOUNDBITES} soundbites.`);
  }
}

export function localClipUri(id: string): string {
  const clip = readCatalog().clips.find((entry) => entry.id === id);
  if (!clip) throw new Error('The selected library clip no longer exists.');
  return audioFile(id, clip.extension ?? 'm4a').uri;
}

export function loadLocalClips(): LocalClip[] {
  const presentations = loadClipPresentations();
  return readCatalog().clips.map((clip) => {
    const file = audioFile(clip.id, clip.extension ?? 'm4a');
    const missing = !file.exists || file.size <= 0;
    const presentation = presentations[clip.id];
    const artwork = presentation?.artwork;
    return { ...clip, extension: clip.extension ?? 'm4a', uri: missing ? '' : file.uri, missing, ...presentation, artworkUri: resolveArtworkUri(artwork) };
  });
}

export function setLocalClipPresentation(id: string, presentation: ClipPresentation): void {
  if (!readCatalog().clips.some((clip) => clip.id === id)) throw new Error('The selected library clip no longer exists.');
  setClipPresentation(id, presentation);
}

/** Add catalog metadata after a caller has written and validated the owned audio file. */
export function commitImportedClip(entry: SavedClip): LocalClip {
  const validated = parseClipCatalog({ version: 1, clips: [entry] }).clips[0]!;
  const file = audioFile(validated.id, validated.extension ?? 'm4a');
  if (!file.exists || file.size <= 0) throw new Error('The imported audio file is missing or empty.');
  const catalog = readCatalog();
  persistCatalog(appendClip(catalog, validated));
  return { ...validated, extension: validated.extension ?? 'm4a', uri: file.uri, missing: false };
}

export function renameLocalClip(id: string, title: string): void {
  persistCatalog(renameClip(readCatalog(), id, title));
}

/** Remove Play references and metadata atomically by snapshot, then delete audio. */
export function deleteLocalClip(id: string): void {
  if (!isUuid(id)) throw new Error('Invalid local clip ID.');
  const catalog = readCatalog();
  const clip = catalog.clips.find((entry) => entry.id === id);
  if (!clip) return;
  const nextCatalog = removeClip(catalog, id);
  const oldBoards = loadBoards();
  const oldPresentation = loadClipPresentations()[id];
  const nextBoards = removeClipAssignments(id, oldBoards);
  saveBoards(nextBoards);
  try {
    removeClipPresentation(id);
    persistCatalog(nextCatalog);
  } catch (error) {
    const rollbackErrors: string[] = [];
    try {
      if (oldPresentation) setClipPresentation(id, oldPresentation);
    } catch (presentationRollbackError) {
      rollbackErrors.push(`clip presentation rollback also failed: ${String(presentationRollbackError)}`);
    }
    try {
      saveBoards(oldBoards);
    } catch (rollbackError) {
      rollbackErrors.push(`board assignment rollback also failed: ${String(rollbackError)}`);
    }
    if (rollbackErrors.length > 0) throw new Error(`Could not update the clip catalog: ${String(error)}. ${rollbackErrors.join('. ')}.`);
    throw error;
  }
  const file = audioFile(id, clip.extension ?? 'm4a');
  if (file.exists) file.delete();
  if (oldPresentation?.artwork) deleteOwnedArtwork(oldPresentation.artwork, presentationReferencesArtwork);
}

/** Allocate IDs for callers that need to create an owned destination file. */
export function newLocalClipId(): string {
  return generatedClipId();
}

export function cleanLocalClipTitle(title: string): string {
  return normalizeClipTitle(title);
}
