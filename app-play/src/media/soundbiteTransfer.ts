import { File } from 'expo-file-system';
import { pickTransferFolder, copyTransferEntry } from '../../../app-client/src/transfer/folderTransfer';
import type { SavedClip } from '../../../app-client/src/editor/catalog';
import { commitImportedClips, prepareImportedClips, type PreparedClipImport } from '../data/library';
import { PLAY_LIBRARY_DIRECTORY } from '../data/snapshot';

export interface SoundbiteImportResult {
  imported: number;
  skipped: number;
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error('Import canceled.');
    error.name = 'AbortError';
    throw error;
  }
}

/** Copy a validated Soundboard transfer into Play's private Library as one catalog update. */
export async function importSoundbites(signal?: AbortSignal): Promise<SoundbiteImportResult | null> {
  const selected = await pickTransferFolder(signal);
  if (!selected) return null;
  checkAborted(signal);

  const entries = selected.manifest.clips.map(({ sizeBytes: _sizeBytes, crc32: _crc32, ...clip }) => clip as SavedClip);
  const prepared: PreparedClipImport = prepareImportedClips(entries);
  const entriesById = new Map(selected.manifest.clips.map((entry) => [entry.id, entry]));
  const copied: File[] = [];
  try {
    PLAY_LIBRARY_DIRECTORY.create({ intermediates: true, idempotent: true });
    for (const clip of prepared.entries) {
      checkAborted(signal);
      const entry = entriesById.get(clip.id);
      if (!entry) throw new Error('The selected folder manifest changed while importing.');
      const destination = new File(PLAY_LIBRARY_DIRECTORY, `${clip.id}.${clip.extension ?? 'm4a'}`);
      if (destination.exists) throw new Error(`A private audio file already exists for “${clip.title}”. The import was stopped to protect it.`);
      await copyTransferEntry(selected, entry, destination, signal);
      copied.push(destination);
      checkAborted(signal);
      if (!destination.exists || destination.size !== entry.sizeBytes) {
        throw new Error(`The copied audio for “${clip.title}” did not pass size validation.`);
      }
    }
    checkAborted(signal);
    const result = commitImportedClips(prepared);
    return { imported: result.imported.length, skipped: result.skipped };
  } catch (error) {
    for (const file of copied) {
      try { if (file.exists) file.delete(); } catch { /* retain the original failure */ }
    }
    throw error;
  }
}
