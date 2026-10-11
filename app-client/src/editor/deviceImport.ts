import { createAudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import AudioContext from 'react-native-audio-api/lib/module/core/AudioContext';

import { assertLibraryCapacity, commitImportedClip, type LocalClip } from './library';
import { audioExtensionFromMetadata, importTitleFromFilename, validateDeviceImportDuration, validateDeviceImportSize } from './importValidation';
import { generatedClipId, type AudioExtension, type SavedClip } from './catalog';
import { isUuid } from './protocol';

const LIBRARY_DIRECTORY = new Directory(Paths.document, 'local-clips');
const MAX_PROBE_MS = 20_000;
type AudioContextInstance = InstanceType<typeof AudioContext>;

function importedAudioFile(id: string, extension: AudioExtension): File {
  if (!isUuid(id)) throw new Error('Invalid local clip ID.');
  return new File(LIBRARY_DIRECTORY, `${id}.${extension}`);
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('Audio import was cancelled.');
    error.name = 'AbortError';
    throw error;
  }
}

async function decodedDurationMs(uri: string, signal: AbortSignal): Promise<number> {
  assertNotAborted(signal);
  const player = createAudioPlayer(uri, { updateInterval: 200 });
  let removeSubscription: () => void = () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await new Promise<number>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, durationMs?: number) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        if (error) reject(error);
        else resolve(durationMs!);
      };
      const inspect = (status: typeof player.currentStatus) => {
        if (status.error) {
          finish(new Error('The selected file could not be decoded as audio.'));
        } else if (status.isLoaded) {
          if (!Number.isFinite(status.duration) || status.duration <= 0) {
            finish(new Error('The selected file has no playable audio duration.'));
          } else {
            try {
              finish(undefined, validateDeviceImportDuration(Math.round(status.duration * 1000)));
            } catch (error) {
              finish(error instanceof Error ? error : new Error('The selected audio duration is invalid.'));
            }
          }
        }
      };
      const onAbort = () => {
        const error = new Error('Audio import was cancelled.');
        error.name = 'AbortError';
        finish(error);
      };
      timer = setTimeout(() => finish(new Error('Audio validation timed out. Try another file.')), MAX_PROBE_MS);
      signal.addEventListener('abort', onAbort, { once: true });
      const subscription = player.addListener('playbackStatusUpdate', inspect);
      removeSubscription = () => subscription.remove();
      inspect(player.currentStatus);
    });
  } finally {
    if (timer) clearTimeout(timer);
    removeSubscription();
    player.remove();
  }
}

async function boardDecoderDurationMs(uri: string, signal: AbortSignal): Promise<number> {
  assertNotAborted(signal);
  const context = new AudioContext();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let removeAbortListener: () => void = () => {};
  try {
    const decoded = context.decodeAudioData(uri);
    const result = await new Promise<Awaited<ReturnType<AudioContextInstance['decodeAudioData']>>>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, buffer?: Awaited<ReturnType<AudioContextInstance['decodeAudioData']>>) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        removeAbortListener();
        if (error) reject(error);
        else resolve(buffer!);
      };
      const onAbort = () => {
        const error = new Error('Audio import was cancelled.');
        error.name = 'AbortError';
        finish(error);
      };
      removeAbortListener = () => signal.removeEventListener('abort', onAbort);
      timer = setTimeout(() => finish(new Error('Audio validation timed out. Try another file.')), MAX_PROBE_MS);
      signal.addEventListener('abort', onAbort, { once: true });
      decoded.then(
        (buffer) => finish(undefined, buffer),
        () => finish(new Error('The soundboard could not decode this audio file.')),
      );
      if (signal.aborted) onAbort();
    });
    if (!Number.isFinite(result.duration) || result.duration <= 0 || result.numberOfChannels < 1 || result.length <= 0) {
      throw new Error('The selected file contains no playable audio.');
    }
    return validateDeviceImportDuration(Math.round(result.duration * 1000));
  } finally {
    if (timer) clearTimeout(timer);
    removeAbortListener();
    await context.close();
  }
}

/** Pick, validate, and copy an audio file into the app-private local library. */
export async function importDeviceAudio(signal: AbortSignal): Promise<LocalClip | null> {
  assertNotAborted(signal);
  assertLibraryCapacity();
  const picked = await File.pickFileAsync({ mimeTypes: ['audio/*'], multipleFiles: false });
  if (picked.canceled || !picked.result) return null;
  assertNotAborted(signal);

  const source = picked.result;
  const extension = audioExtensionFromMetadata(source.name, source.type);
  validateDeviceImportSize(source.size);
  if (!source.exists) throw new Error('The selected audio file is unavailable. Pick it again.');

  const id = generatedClipId();
  const stagingDirectory = new Directory(Paths.cache, `soundboard-import-${id}`);
  const finalFile = importedAudioFile(id, extension);
  let ownsStagingDirectory = false;
  let ownsFinalFile = false;
  let committed = false;

  try {
    stagingDirectory.create({ intermediates: true, idempotent: false });
    ownsStagingDirectory = true;
    await source.copy(stagingDirectory);
    assertNotAborted(signal);
    const stagedFiles = stagingDirectory.list();
    if (stagedFiles.length !== 1 || !(stagedFiles[0] instanceof File)) {
      throw new Error('The selected audio file could not be copied safely.');
    }
    const stagedFile = stagedFiles[0];
    const copiedExtension = audioExtensionFromMetadata(stagedFile.name, stagedFile.type);
    if (copiedExtension !== extension || !stagedFile.exists || stagedFile.size !== source.size) {
      throw new Error('The selected audio file changed or could not be copied completely.');
    }

    LIBRARY_DIRECTORY.create({ intermediates: true, idempotent: true });
    if (finalFile.exists) throw new Error('Could not allocate a unique local clip file. Try again.');
    // Exclusive create reserves this UUID path for this import. If the copy
    // fails partway through, cleanup still only touches the file we created.
    finalFile.create();
    ownsFinalFile = true;
    await stagedFile.copy(finalFile, { overwrite: true });
    if (!ownsFinalFile || finalFile.size !== source.size) throw new Error('The selected audio file could not be copied completely.');
    assertNotAborted(signal);

    const metadataDurationMs = await decodedDurationMs(finalFile.uri, signal);
    const durationMs = await boardDecoderDurationMs(finalFile.uri, signal);
    if (Math.abs(metadataDurationMs - durationMs) > 250) {
      throw new Error('The selected audio file returned inconsistent duration information.');
    }
    assertNotAborted(signal);
    const entry: SavedClip = {
      id,
      title: importTitleFromFilename(stagedFile.name),
      durationMs,
      createdAt: new Date().toISOString(),
      extension,
    };
    // Remove temporary staging before the catalog commit so a cleanup failure
    // cannot make a successful import appear to have failed after persistence.
    stagingDirectory.delete();
    ownsStagingDirectory = false;
    const clip = commitImportedClip(entry);
    committed = true;
    return clip;
  } catch (error) {
    if (ownsFinalFile && !committed && finalFile.exists) finalFile.delete();
    throw error;
  } finally {
    if (ownsStagingDirectory && stagingDirectory.exists) stagingDirectory.delete();
  }
}
