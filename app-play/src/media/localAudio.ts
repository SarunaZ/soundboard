import { createAudioPlayer } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import AudioContext from 'react-native-audio-api/lib/module/core/AudioContext';

import { assertLibraryCapacity, commitImportedClip, type LocalClip } from '../data/library';
import { PLAY_LIBRARY_DIRECTORY } from '../data/snapshot';
import { audioSourceExtensionFromMetadata, importTitleFromFilename } from '../data/importValidation';
import { generatedClipId, normalizeClipTitle, type SavedClip } from '../data/catalog';
import { isUuid } from '../data/protocol';
import { encodePcm16WavSlice, LOCAL_AUDIO_MAX_CHANNELS, LOCAL_AUDIO_MAX_RENDER_MS, LOCAL_AUDIO_MIN_RENDER_MS, LOCAL_AUDIO_SAMPLE_RATE, waveformPeaks } from '../../../app-client/src/editor/localAudioPcm.ts';

export const MAX_LOCAL_AUDIO_SOURCE_BYTES = 32 * 1024 * 1024;
export const MAX_LOCAL_AUDIO_SOURCE_MS = 5 * 60_000;
// The largest supported PCM decode is five minutes of 44.1 kHz stereo float PCM.
// Keep this explicit so a metadata change cannot silently make imports unbounded.
export const MAX_LOCAL_AUDIO_PCM_BYTES = 128 * 1024 * 1024;
export const MAX_LOCAL_AUDIO_RENDER_MS = LOCAL_AUDIO_MAX_RENDER_MS;
export const MIN_LOCAL_AUDIO_RENDER_MS = LOCAL_AUDIO_MIN_RENDER_MS;
export const LOCAL_AUDIO_WAVEFORM_BINS = 256;
const MAX_PROBE_MS = 30_000;

export type LocalAudioSource = {
  id: string;
  uri: string;
  title: string;
  durationMs: number;
  peaks: number[];
};

export type LocalAudioRender = {
  uri: string;
  startMs: number;
  endMs: number;
  durationMs: number;
};

type AudioContextInstance = InstanceType<typeof AudioContext>;
type DecodedAudio = Awaited<ReturnType<AudioContextInstance['decodeAudioData']>>;

type RenderRecord = { result: LocalAudioRender; file: File };
type SourceRecord = {
  source: LocalAudioSource;
  directory: Directory;
  buffer: DecodedAudio | null;
  pcmBytes: number;
  render: RenderRecord | null;
  disposed: boolean;
  rendering: boolean;
  saving: number;
  operations: Set<Promise<unknown>>;
  controllers: Set<AbortController>;
  cleanupPromise: Promise<void> | null;
};

const sources = new Map<string, SourceRecord>();
const MAX_RETAINED_EDITOR_SOURCES = 2;
let sourceOpenInProgress = false;
let nativeDecodeOutstanding = false;

function abortError(message = 'Audio editing was cancelled.'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function throwProbeError(error: unknown, message: string): Error {
  if (error instanceof Error && error.name === 'AbortError') return error;
  return error instanceof Error && /seconds|minutes|duration|MB|size|audio file|channel count|sample rate|inconsistent|memory|draft|decoder|finishing/i.test(error.message)
    ? error
    : new Error(message);
}

function validateSourceDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('The selected file has no playable audio duration.');
  if (durationMs > MAX_LOCAL_AUDIO_SOURCE_MS) throw new Error('Audio sources must be 5 minutes or shorter.');
  return Math.round(durationMs);
}

async function probeDurationMs(uri: string, signal?: AbortSignal): Promise<number> {
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
        signal?.removeEventListener('abort', onAbort);
        if (error) reject(error);
        else resolve(durationMs!);
      };
      const inspect = (status: typeof player.currentStatus) => {
        if (status.error) {
          finish(new Error('The selected file could not be read as audio.'));
        } else if (status.isLoaded) {
          try {
            finish(undefined, validateSourceDuration(status.duration * 1000));
          } catch (error) {
            finish(error instanceof Error ? error : new Error('The selected audio duration is invalid.'));
          }
        }
      };
      const onAbort = () => finish(abortError());
      timer = setTimeout(() => finish(new Error('Audio metadata validation timed out. Try another file.')), MAX_PROBE_MS);
      signal?.addEventListener('abort', onAbort, { once: true });
      const subscription = player.addListener('playbackStatusUpdate', inspect);
      removeSubscription = () => subscription.remove();
      inspect(player.currentStatus);
      if (signal?.aborted) onAbort();
    });
  } finally {
    if (timer) clearTimeout(timer);
    removeSubscription();
    player.remove();
  }
}

async function decodeAudio(uri: string, signal?: AbortSignal): Promise<DecodedAudio> {
  assertNotAborted(signal);
  if (nativeDecodeOutstanding) throw new Error('Audio decoding is still finishing from a cancelled import. Wait and try again; restart the app if it never clears.');
  const context = new AudioContext({ sampleRate: LOCAL_AUDIO_SAMPLE_RATE });
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    nativeDecodeOutstanding = true;
    let releasedNativeSlot = false;
    const releaseNativeSlot = () => {
      if (releasedNativeSlot) return;
      releasedNativeSlot = true;
      nativeDecodeOutstanding = false;
    };
    let decoding: Promise<DecodedAudio>;
    try { decoding = context.decodeAudioData(uri); }
    catch (error) { releaseNativeSlot(); throw error; }
    // The editor may abort its wait while the native codec is still working.
    // Keep the global decoder slot occupied until the actual native promise
    // settles, even if the caller has already left the import flow.
    void decoding.then(releaseNativeSlot, releaseNativeSlot);
    return await new Promise<DecodedAudio>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, buffer?: DecodedAudio) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (error) reject(error);
        else resolve(buffer!);
      };
      const onAbort = () => {
        void context.close().catch(() => {});
        finish(abortError());
      };
      timer = setTimeout(() => finish(new Error('Audio decoding timed out. Try another file.')), MAX_PROBE_MS);
      signal?.addEventListener('abort', onAbort, { once: true });
      decoding.then(
        (buffer) => finish(undefined, buffer),
        () => finish(new Error('The selected file could not be decoded as audio.')),
      );
      if (signal?.aborted) onAbort();
    });
  } catch (error) {
    throw throwProbeError(error, 'The selected file could not be decoded as audio.');
  } finally {
    if (timer) clearTimeout(timer);
    await context.close().catch(() => {});
  }
}

function assertSource(record: SourceRecord | undefined, source: LocalAudioSource): asserts record is SourceRecord {
  if (!isUuid(source.id) || !record || record.disposed || record.source.uri !== source.uri || record.source.durationMs !== source.durationMs) {
    throw new Error('This audio source is no longer available. Choose it again.');
  }
}

async function cleanupRecord(record: SourceRecord): Promise<void> {
  if (record.cleanupPromise) return record.cleanupPromise;
  record.cleanupPromise = (async () => {
    record.buffer = null;
    record.render = null;
    if (record.directory.exists) record.directory.delete();
    sources.delete(record.source.id);
  })();
  return record.cleanupPromise;
}

async function runSourceOperation<T>(
  record: SourceRecord,
  signal: AbortSignal | undefined,
  work: (operationSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (record.disposed) throw new Error('This audio source is no longer available. Choose it again.');
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) controller.abort();
  record.controllers.add(controller);
  const operation = (async () => {
    try {
      assertNotAborted(controller.signal);
      return await work(controller.signal);
    } finally {
      signal?.removeEventListener('abort', onAbort);
      record.controllers.delete(controller);
    }
  })();
  record.operations.add(operation);
  try {
    return await operation;
  } finally {
    record.operations.delete(operation);
    if (record.disposed && record.operations.size === 0) await cleanupRecord(record);
  }
}

function normalizedTitleOverride(titleOverride: string): string {
  const safe = titleOverride.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 100).trim();
  return safe || 'On-device audio';
}

/** Stage a caller-provided audio file, then probe and decode it locally. */
export async function openLocalAudioFile(
  selectedFile: File,
  signal?: AbortSignal,
  titleOverride?: string,
  selectedMetadata?: { name?: string; mimeType?: string | null },
): Promise<LocalAudioSource> {
  assertNotAborted(signal);
  if (nativeDecodeOutstanding) throw new Error('Audio decoding is still finishing from a cancelled import. Wait and try again; restart the app if it never clears.');
  if (sourceOpenInProgress) throw new Error('An audio source is already being opened. Wait for it to finish before choosing another.');
  if (sources.size >= MAX_RETAINED_EDITOR_SOURCES) throw new Error('Close the current and previous audio drafts before opening another source.');
  sourceOpenInProgress = true;
  try {
  if (typeof selectedFile.size !== 'number' || !Number.isSafeInteger(selectedFile.size) || selectedFile.size <= 0) {
    throw new Error('The selected file has an unknown or empty size.');
  }
  if (selectedFile.size > MAX_LOCAL_AUDIO_SOURCE_BYTES) throw new Error('Audio sources must be 32 MB or smaller.');
  if (!selectedFile.exists) throw new Error('The selected audio file is unavailable. Pick it again.');

  // Android picker results are content:// URIs. Expo FileSystem's copy-to-
  // directory path tries to resolve source.javaFile.name, which is unsupported
  // for content URIs. Copy to an explicit private file instead; Android streams
  // content providers correctly when the destination is a File.
  const originalName = selectedMetadata?.name || selectedFile.name;
  const extension = audioSourceExtensionFromMetadata(originalName, selectedMetadata?.mimeType ?? selectedFile.type);
  const fileName = `source.${extension}`;

  const id = generatedClipId();
  const directory = new Directory(Paths.cache, `soundboard-editor-${id}`);
  let ownsDirectory = false;
  try {
    directory.create({ intermediates: true, idempotent: false });
    ownsDirectory = true;
    const stagedFile = new File(directory, fileName);
    await selectedFile.copy(stagedFile);
    assertNotAborted(signal);
    if (!stagedFile.exists || stagedFile.size !== selectedFile.size) throw new Error('The selected audio file could not be copied completely.');
    // Recheck the copied metadata too; Android content URIs may expose a synthetic name before copying.
    audioSourceExtensionFromMetadata(stagedFile.name, stagedFile.type);

    const durationMs = await probeDurationMs(stagedFile.uri, signal);
    assertNotAborted(signal);
    const retainedPcmBytes = [...sources.values()].reduce((total, record) => total + record.pcmBytes, 0);
    const expectedPcmBytes = Math.ceil(durationMs * LOCAL_AUDIO_SAMPLE_RATE / 1000) * LOCAL_AUDIO_MAX_CHANNELS * Float32Array.BYTES_PER_ELEMENT;
    if (retainedPcmBytes + expectedPcmBytes > MAX_LOCAL_AUDIO_PCM_BYTES) {
      throw new Error('This source plus your current audio draft would use too much memory. Save or discard the current draft, or choose a shorter file. Your current draft is unchanged.');
    }
    const buffer = await decodeAudio(stagedFile.uri, signal);
    assertNotAborted(signal);
    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || !Number.isInteger(buffer.length) || buffer.length <= 0 ||
        buffer.numberOfChannels < 1 || buffer.numberOfChannels > LOCAL_AUDIO_MAX_CHANNELS || buffer.sampleRate !== LOCAL_AUDIO_SAMPLE_RATE) {
      throw new Error('This audio format or channel count is not supported.');
    }
    const decodedPcmBytes = buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
    if (!Number.isSafeInteger(decodedPcmBytes) || retainedPcmBytes + decodedPcmBytes > MAX_LOCAL_AUDIO_PCM_BYTES) {
      throw new Error('This source plus your current audio draft would use too much memory. Save or discard the current draft, or choose a shorter file. Your current draft is unchanged.');
    }
    const decodedDurationMs = buffer.length / buffer.sampleRate * 1000;
    if (decodedDurationMs > MAX_LOCAL_AUDIO_SOURCE_MS + 0.001 || Math.abs(decodedDurationMs - durationMs) > 1_000) {
      throw new Error(decodedDurationMs > MAX_LOCAL_AUDIO_SOURCE_MS + 0.001
        ? 'Audio sources must be 5 minutes or shorter.'
        : 'The selected file returned inconsistent duration information.');
    }
    const channelData = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    const peaks = await waveformPeaks(channelData, buffer.length, LOCAL_AUDIO_WAVEFORM_BINS, signal);
    assertNotAborted(signal);

    const source: LocalAudioSource = {
      id,
      uri: stagedFile.uri,
      title: titleOverride === undefined ? importTitleFromFilename(originalName) : normalizedTitleOverride(titleOverride),
      durationMs: Math.round(decodedDurationMs),
      peaks,
    };
    const record: SourceRecord = {
      source, directory, buffer, pcmBytes: decodedPcmBytes, render: null, disposed: false,
      rendering: false, saving: 0, operations: new Set(), controllers: new Set(), cleanupPromise: null,
    };
    sources.set(id, record);
    ownsDirectory = false;
    return source;
  } catch (error) {
    throw throwProbeError(error, 'The selected file could not be opened as audio.');
  } finally {
    if (ownsDirectory && directory.exists) directory.delete();
  }
  } finally {
    sourceOpenInProgress = false;
  }
}

function removeOwnedDocumentPickerCacheFile(uri: string): void {
  const cachePrefix = `${Paths.cache.uri.replace(/\/+$/, '')}/DocumentPicker/`;
  if (!uri.startsWith(cachePrefix)) return;
  const relativePath = uri.slice(cachePrefix.length);
  if (!relativePath || relativePath.includes('?') || relativePath.includes('#') || relativePath.includes('/')) return;
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'file:' || parsed.href !== uri) return;
    const decoded = decodeURIComponent(relativePath);
    if (!decoded || decoded === '.' || decoded === '..' || decoded.includes('/')) return;
  } catch {
    return;
  }
  try {
    const cacheFile = new File(uri);
    if (cacheFile.exists) cacheFile.delete();
  } catch {
    // The staged source is independent; cleanup failure must not discard it.
  }
}

/** Open the system picker, stage a private original copy, then probe and decode it locally. */
export async function pickLocalAudioSource(signal?: AbortSignal): Promise<LocalAudioSource | null> {
  assertNotAborted(signal);
  const picked = await DocumentPicker.getDocumentAsync({ type: ['audio/*', 'video/mp4', 'video/quicktime'], multiple: false, copyToCacheDirectory: true });
  if (picked.canceled) return null;
  const asset = picked.assets[0];
  if (!asset) throw new Error('The selected audio file could not be read. Choose it again.');
  try {
    assertNotAborted(signal);
    if (typeof asset.size === 'number' && asset.size > MAX_LOCAL_AUDIO_SOURCE_BYTES) {
      throw new Error('Audio sources must be 32 MB or smaller.');
    }
    const selectedFile = new File(asset.uri);
    return await openLocalAudioFile(selectedFile, signal, undefined, { name: asset.name, mimeType: asset.mimeType });
  } finally {
    removeOwnedDocumentPickerCacheFile(asset.uri);
  }
}

/** Render a bounded sample-accurate range to an owned PCM16 WAV file in cache. */
export async function renderLocalAudioRange(
  source: LocalAudioSource,
  startMs: number,
  endMs: number,
  signal?: AbortSignal,
): Promise<LocalAudioRender> {
  const record = sources.get(source.id);
  assertSource(record, source);
  return runSourceOperation(record, signal, async (operationSignal) => {
    if (record.rendering || record.saving > 0) throw new Error('Wait for the current audio operation to finish.');
    const buffer = record.buffer;
    if (!buffer) throw new Error('This audio source is no longer available. Choose it again.');
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs || endMs > source.durationMs + 1) {
      throw new Error('Choose a valid audio range.');
    }
    // UI values are milliseconds while the PCM is sample-indexed. Nearest
    // sample keeps a returned range stable if it is rendered again. The UI's
    // rounded full-source endpoint maps to the actual EOF, including sources
    // shorter than 100 ms whose displayed duration rounds down.
    const endFrame = endMs >= source.durationMs
      ? buffer.length
      : Math.min(buffer.length, Math.round(endMs * buffer.sampleRate / 1000));
    const startFrame = Math.min(buffer.length, Math.round(startMs * buffer.sampleRate / 1000));
    const frameCount = endFrame - startFrame;
    const actualDurationMs = Number((frameCount * 1000 / buffer.sampleRate).toFixed(6));
    const minimumMs = Math.min(MIN_LOCAL_AUDIO_RENDER_MS, buffer.length / buffer.sampleRate * 1000);
    if (actualDurationMs + 0.001 < minimumMs) throw new Error('Selections must be at least 100 ms long.');
    if (actualDurationMs - 0.001 > MAX_LOCAL_AUDIO_RENDER_MS) throw new Error('Selections must be 60 seconds or shorter.');

    record.rendering = true;
    let output: File | null = null;
    let ownsOutput = false;
    try {
      const previousRender = record.render;
      record.render = null;
      if (previousRender?.file.exists) previousRender.file.delete();
      output = new File(record.directory, `render-${generatedClipId()}.wav`);
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
      const wav = await encodePcm16WavSlice(channels, startFrame, endFrame, buffer.sampleRate, operationSignal);
      assertNotAborted(operationSignal);
      output.create();
      ownsOutput = true;
      output.write(wav);
      if (!output.exists || output.size !== wav.byteLength) throw new Error('The rendered audio file could not be written completely.');
      assertNotAborted(operationSignal);
      const result: LocalAudioRender = {
        uri: output.uri,
        startMs: Number((startFrame * 1000 / buffer.sampleRate).toFixed(6)),
        endMs: Number((endFrame * 1000 / buffer.sampleRate).toFixed(6)),
        durationMs: actualDurationMs,
      };
      record.render = { result, file: output };
      ownsOutput = false;
      return result;
    } finally {
      if (ownsOutput && output?.exists) output.delete();
      record.rendering = false;
    }
  });
}

/** Save only the current render belonging to this source into the private library. */
export async function saveLocalAudioRender(
  source: LocalAudioSource,
  render: LocalAudioRender,
  title: string,
  signal?: AbortSignal,
): Promise<LocalClip> {
  const record = sources.get(source.id);
  assertSource(record, source);
  return runSourceOperation(record, signal, async (operationSignal) => {
    assertNotAborted(operationSignal);
    if (record.rendering || record.saving > 0) throw new Error('Wait for the current audio operation to finish.');
    const currentRender = record.render;
    if (!currentRender || currentRender.result.uri !== render.uri || currentRender.result.startMs !== render.startMs ||
        currentRender.result.endMs !== render.endMs || currentRender.result.durationMs !== render.durationMs ||
        currentRender.file.uri !== render.uri || !currentRender.file.exists) {
      throw new Error('Render the selected range again before saving.');
    }
    const cleanTitle = normalizeClipTitle(title);
    assertLibraryCapacity();
    record.saving += 1;
    let finalFile: File | null = null;
    let ownsFinalFile = false;
    let committed = false;
    try {
      const id = generatedClipId();
      PLAY_LIBRARY_DIRECTORY.create({ intermediates: true, idempotent: true });
      finalFile = new File(PLAY_LIBRARY_DIRECTORY, `${id}.wav`);
      if (finalFile.exists) throw new Error('Could not allocate a unique local clip file. Try again.');
      finalFile.create();
      ownsFinalFile = true;
      await currentRender.file.copy(finalFile, { overwrite: true });
      assertNotAborted(operationSignal);
      if (!finalFile.exists || finalFile.size !== currentRender.file.size) throw new Error('The rendered audio file could not be copied completely.');
      const entry: SavedClip = {
        id,
        title: cleanTitle,
        durationMs: Math.round(currentRender.result.durationMs),
        createdAt: new Date().toISOString(),
        extension: 'wav',
      };
      const clip = commitImportedClip(entry);
      committed = true;
      return clip;
    } finally {
      if (ownsFinalFile && !committed && finalFile?.exists) finalFile.delete();
      record.saving -= 1;
    }
  });
}

/** Abort active work and remove only cache files owned by this source handle. */
export async function disposeLocalAudioSource(source: LocalAudioSource): Promise<void> {
  const record = sources.get(source.id);
  if (!record || record.source.uri !== source.uri) return;
  if (record.disposed) {
    await record.cleanupPromise;
    return;
  }
  record.disposed = true;
  for (const controller of record.controllers) controller.abort();
  await Promise.allSettled([...record.operations]);
  await cleanupRecord(record);
}
