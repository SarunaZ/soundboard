import { File } from 'expo-file-system';

import { MAX_SOUNDBITES } from '../../../app-client/src/limits.ts';
import { appendClip, generatedClipId, normalizeClipTitle, parseClipCatalog, removeClip, renameClip, type AudioExtension, type ClipCatalog, type SavedClip } from './catalog';
import { isUuid } from './protocol';
import { emptyOrRecoveredSnapshot, PLAY_LIBRARY_DIRECTORY, recoverSnapshotTransaction, registerSnapshotParser, writeSnapshot, writeSnapshotTransaction } from './snapshot.ts';
import { loadBoards, removeClipAssignments } from './boards.ts';
import { parseBoardCollection } from './boardModel.ts';
import { clearClipArtwork, createArtworkReferenceChecker, loadClipPresentations, parsePresentations, presentationReferencesArtwork, removeClipPresentation, setClipPresentation, type ClipArtwork, type ClipPresentation } from './presentation.ts';
import { deleteOwnedArtwork, pruneOwnedArtwork, resolveArtworkUri } from '../media/artwork.ts';
import { loadClipPlaybackPreferences, parseClipPlaybackPreferences } from './clipPlayback.ts';
import { allocateNextPadColorIndex } from './preferences.ts';
import { padGradientForClipId, padGradientStops } from './padColors.ts';

const CATALOG_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'catalog.json');
const BACKUP_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'catalog.backup.json');
registerSnapshotParser('catalog.json', parseClipCatalog);
let startupSweepCompleted = false;
function nextCatalogFile(): File {
  return new File(PLAY_LIBRARY_DIRECTORY, 'catalog.next.json');
}

export interface LocalClip extends SavedClip {
  extension: AudioExtension;
  uri: string;
  missing: boolean;
  icon?: string;
  color?: string;
  colorEnd?: string;
  colorIndex?: number;
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
  return emptyOrRecoveredSnapshot(CATALOG_FILE, BACKUP_FILE, emptyCatalog, parseClipCatalog, nextCatalogFile());
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
  initializeLocalLibrary();
  const presentations = loadClipPresentations();
  return readCatalog().clips.map((clip) => {
    const file = audioFile(clip.id, clip.extension ?? 'm4a');
    const missing = !file.exists || file.size <= 0;
    const presentation = presentations[clip.id];
    const colorFallback = presentation?.color ? {} : padGradientForClipId(clip.id);
    const artwork = presentation?.artwork;
    return { ...clip, extension: clip.extension ?? 'm4a', uri: missing ? '' : file.uri, missing, ...colorFallback, ...presentation, artworkUri: resolveArtworkUri(artwork) };
  });
}

/** Replay pending metadata work and perform one conservative orphan sweep for this process. */
export function initializeLocalLibrary(): void {
  if (startupSweepCompleted) return;
  recoverSnapshotTransaction();
  pruneUnreferencedOwnedAudio();
  pruneOwnedArtwork(createArtworkReferenceChecker());
  startupSweepCompleted = true;
}

/** Preserve every clip referenced by either recovery snapshot; remove only proven orphans. */
function pruneUnreferencedOwnedAudio(): void {
  try {
    const sources = CATALOG_FILE.exists ? [CATALOG_FILE, BACKUP_FILE] : [BACKUP_FILE, nextCatalogFile()];
    const catalogs = sources.filter((file) => file.exists).map((file) => parseClipCatalog(JSON.parse(file.textSync()) as unknown));
    if (catalogs.length === 0) return;
    const retained = new Set(catalogs.flatMap(({ clips }) => clips.map((clip) => `${clip.id}.${clip.extension ?? 'm4a'}`.toLowerCase())));
    for (const entry of PLAY_LIBRARY_DIRECTORY.list()) {
      if (!(entry instanceof File) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:mp3|m4a|wav|aac)$/i.test(entry.name)) continue;
      if (!retained.has(entry.name.toLowerCase()) && entry.exists) entry.delete();
    }
  } catch {
    // Unknown/corrupt catalog state means references cannot be proven absent.
  }
}

export function setLocalClipPresentation(id: string, presentation: ClipPresentation): void {
  if (!readCatalog().clips.some((clip) => clip.id === id)) throw new Error('The selected library clip no longer exists.');
  setClipPresentation(id, presentation);
}

/** Restore Default artwork without disturbing color, icon, or the audio file. */
export function clearLocalClipArtwork(id: string): void {
  if (!readCatalog().clips.some((clip) => clip.id === id)) throw new Error('The selected library clip no longer exists.');
  const artwork = clearClipArtwork(id);
  if (artwork) deleteOwnedArtwork(artwork, presentationReferencesArtwork);
  pruneOwnedArtwork(createArtworkReferenceChecker());
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

export interface PreparedClipImport {
  entries: SavedClip[];
  skipped: number;
}

/** Check capacity and private paths before the transfer starts writing any files. */
export function prepareImportedClips(entries: readonly SavedClip[]): PreparedClipImport {
  const validated = parseClipCatalog({ version: 1, clips: [...entries] }).clips;
  const catalog = readCatalog();
  const existingIds = new Set(catalog.clips.map((clip) => clip.id));
  const seen = new Set<string>();
  const additions = validated.filter((clip) => {
    if (existingIds.has(clip.id) || seen.has(clip.id)) return false;
    seen.add(clip.id);
    return true;
  });
  const skipped = validated.length - additions.length;
  if (catalog.clips.length + additions.length > MAX_SOUNDBITES) {
    throw new Error(`The library can hold up to ${MAX_SOUNDBITES} soundbites. Remove some sounds before importing this folder.`);
  }

  const destinations = additions.map((clip) => ({ clip, file: audioFile(clip.id, clip.extension ?? 'm4a') }));
  for (const { clip, file } of destinations) {
    if (file.exists) throw new Error(`A private audio file already exists for “${clip.title}”. The import was stopped to protect it.`);
  }
  return { entries: additions, skipped };
}

/** Commit a completed folder import in one catalog snapshot, preserving existing order. */
export function commitImportedClips(prepared: PreparedClipImport): { imported: LocalClip[]; skipped: number } {
  const additions = parseClipCatalog({ version: 1, clips: [...prepared.entries] }).clips;
  const catalog = readCatalog();
  const existingIds = new Set(catalog.clips.map((clip) => clip.id));
  if (additions.some((clip) => existingIds.has(clip.id))) throw new Error('The Library changed during import. Try importing the folder again.');
  if (catalog.clips.length + additions.length > MAX_SOUNDBITES) {
    throw new Error(`The library can hold up to ${MAX_SOUNDBITES} soundbites. Remove some sounds before importing this folder.`);
  }
  const destinations = additions.map((clip) => ({ clip, file: audioFile(clip.id, clip.extension ?? 'm4a') }));
  for (const { clip, file } of destinations) {
    if (!file.exists || file.size <= 0) throw new Error(`The copied audio for “${clip.title}” is missing or empty.`);
  }

  // Existing entries stay in place; transferred entries follow in manifest order.
  const next = parseClipCatalog({ version: 1, clips: [...catalog.clips, ...additions] });
  const oldPresentations = loadClipPresentations();
  const nextPresentations = { ...oldPresentations };
  const changedPresentations: string[] = [];
  const rollbackPresentations = () => {
    for (const id of changedPresentations.reverse()) {
      removeClipPresentation(id);
      if (oldPresentations[id]) setClipPresentation(id, oldPresentations[id]!);
    }
  };
  try {
    for (const clip of additions) {
      if (oldPresentations[clip.id]?.color) continue;
      const colorIndex = allocateNextPadColorIndex();
      const [color, colorEnd] = padGradientStops(colorIndex);
      nextPresentations[clip.id] = { ...oldPresentations[clip.id], color, colorEnd, colorIndex };
      setClipPresentation(clip.id, nextPresentations[clip.id]!);
      changedPresentations.push(clip.id);
    }
    persistCatalog(next);
  } catch (error) {
    try { rollbackPresentations(); } catch (rollbackError) { throw new Error(`Could not import the clips: ${String(error)}. Color metadata rollback also failed: ${String(rollbackError)}`); }
    throw error;
  }
  return {
    imported: destinations.map(({ clip, file }) => {
      const presentation = nextPresentations[clip.id];
      return { ...clip, extension: clip.extension ?? 'm4a', uri: file.uri, missing: false, ...presentation, artworkUri: resolveArtworkUri(presentation?.artwork) };
    }),
    skipped: prepared.skipped,
  };
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
  const currentPresentations = loadClipPresentations();
  const nextPresentations = { ...currentPresentations };
  delete nextPresentations[id];
  const nextPlayback = loadClipPlaybackPreferences();
  delete nextPlayback[id];
  const deleteAfterCommit = [`${id}.${clip.extension ?? 'm4a'}`];
  if (oldPresentation?.artwork && !Object.values(nextPresentations).some((entry) => entry.artwork?.fileName === oldPresentation.artwork!.fileName)) {
    deleteAfterCommit.push(`artwork/${oldPresentation.artwork.fileName}`);
  }
  writeSnapshotTransaction([
    { name: 'boards.json', value: nextBoards, parse: (value) => parseBoardCollection(value) },
    { name: 'presentation.json', value: { version: 1, clips: nextPresentations }, parse: parsePresentations },
    { name: 'clip-playback.json', value: { version: 1, clips: nextPlayback }, parse: (value) => ({ version: 1, clips: parseClipPlaybackPreferences(value) }) },
    { name: 'catalog.json', value: nextCatalog, parse: parseClipCatalog },
  ], deleteAfterCommit);
  if (oldPresentation?.artwork) deleteOwnedArtwork(oldPresentation.artwork, presentationReferencesArtwork);
  pruneOwnedArtwork(createArtworkReferenceChecker());
}

/** Allocate IDs for callers that need to create an owned destination file. */
export function newLocalClipId(): string {
  return generatedClipId();
}

export function cleanLocalClipTitle(title: string): string {
  return normalizeClipTitle(title);
}
