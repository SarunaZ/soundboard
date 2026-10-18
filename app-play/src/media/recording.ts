import { AudioModule, RecordingPresets, getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { disposeLocalAudioSource, MAX_LOCAL_AUDIO_SOURCE_BYTES, MAX_LOCAL_AUDIO_SOURCE_MS, openLocalAudioFile, type LocalAudioSource } from './localAudio';

const MAX_RECORDING_MS = MAX_LOCAL_AUDIO_SOURCE_MS;
const MAX_RECORDING_BYTES = MAX_LOCAL_AUDIO_SOURCE_BYTES;
const RECORDING_TITLE = 'Microphone recording';

type RecorderInstance = InstanceType<typeof AudioModule.AudioRecorder>;

export type LocalAudioRecorderStatus = {
  isRecording: boolean;
  elapsedMs: number;
  error: string | null;
};

export type LocalAudioRecorderController = {
  /** Requests microphone access and starts capture. Call only from an explicit user action. */
  start(): Promise<void>;
  /** Stops capture and opens the cache file in trim. The returned source is transferred by dispose(). */
  stop(signal?: AbortSignal): Promise<LocalAudioSource>;
  /** Stops capture and removes only this controller's cache/source files. Safe to call repeatedly. */
  cancel(): Promise<void>;
  /** Releases native resources; after stop succeeds this transfers the staged source to the caller. */
  dispose(): Promise<void>;
  getStatus(): LocalAudioRecorderStatus;
};

type Phase = 'idle' | 'preparing' | 'recording' | 'stopping' | 'importing' | 'complete' | 'cancelled' | 'failed' | 'disposed';

function abortError(): Error {
  const error = new Error('Recording was cancelled.');
  error.name = 'AbortError';
  return error;
}

function permissionError(): Error {
  return new Error('Microphone access is off. Allow microphone access in your device settings, then try recording again.');
}

function recorderError(error: unknown, fallback: string): Error {
  if (error instanceof Error && error.name === 'AbortError') return error;
  if (error instanceof Error && /microphone|recording|audio|permission|storage|space/i.test(error.message)) return error;
  return new Error(fallback);
}

function cacheUriPrefix(): string {
  const uri = Paths.cache.uri;
  return uri.endsWith('/') ? uri : `${uri}/`;
}

function processRecordingOptions(options: typeof RecordingPresets.HIGH_QUALITY & { directory: 'cache'; android: typeof RecordingPresets.HIGH_QUALITY.android & { maxFileSize: number } }) {
  const common = {
    extension: options.extension,
    sampleRate: options.sampleRate,
    numberOfChannels: options.numberOfChannels,
    bitRate: options.bitRate,
    isMeteringEnabled: false,
  };
  if (Platform.OS === 'android') return { ...common, directory: options.directory, ...options.android };
  if (Platform.OS === 'ios') return { ...common, directory: options.directory, ...options.ios };
  return { ...common, ...options.web };
}

/** Create a foreground-only, one-shot recorder that feeds the existing local trim flow. */
export function createLocalAudioRecorder(): LocalAudioRecorderController {
  let phase: Phase = 'idle';
  let recorder: RecorderInstance | null = null;
  let startedAt = 0;
  let elapsedMs = 0;
  let errorMessage: string | null = null;
  let cancelRequested = false;
  let ownedUri: string | null = null;
  let completedSource: LocalAudioSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startPromise: Promise<void> | null = null;
  let nativeStopPromise: Promise<void> | null = null;
  let stopPromise: Promise<LocalAudioSource> | null = null;
  let cancelPromise: Promise<void> | null = null;
  let modeChanged = false;
  const operationController = new AbortController();

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const restoreAudioMode = async () => {
    if (!modeChanged) return;
    modeChanged = false;
    // expo-audio does not expose a mode getter. Restore the app's normal playback defaults.
    await setAudioModeAsync({
      allowsRecording: false,
      allowsBackgroundRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    });
  };

  const releaseRecorder = () => {
    if (!recorder) return;
    try {
      recorder.release();
    } catch {
      // Releasing is best effort after native stop/failure.
    }
    recorder = null;
  };

  const removeOwnedFile = () => {
    const uri = ownedUri;
    ownedUri = null;
    if (!uri || !uri.startsWith(cacheUriPrefix())) return;
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Never let cleanup of our cache file mask the recording/import error.
    }
  };

  const stopNative = (): Promise<void> => {
    if (nativeStopPromise) return nativeStopPromise;
    clearTimer();
    nativeStopPromise = (async () => {
      phase = 'stopping';
      const current = recorder;
      if (current) {
        const uri = current.uri;
        if (uri && uri.startsWith(cacheUriPrefix())) ownedUri = uri;
        if (current.isRecording || current.getStatus().isRecording) await current.stop();
        const finalUri = current.uri ?? current.getStatus().url;
        if (finalUri && finalUri.startsWith(cacheUriPrefix())) ownedUri = finalUri;
      }
      await restoreAudioMode();
    })();
    return nativeStopPromise;
  };

  const cleanupAll = async () => {
    removeOwnedFile();
    try {
      await restoreAudioMode();
    } catch {
      // A failed mode restore must not prevent recorder release or cache cleanup.
    }
    releaseRecorder();
  };

  const start = (): Promise<void> => {
    if (startPromise) return startPromise;
    if (phase !== 'idle') return Promise.reject(new Error('This recording session has already been used.'));
    phase = 'preparing';
    errorMessage = null;
    startPromise = (async () => {
      try {
        let permission = await getRecordingPermissionsAsync();
        if (!permission.granted) permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) throw permissionError();
        if (cancelRequested) throw abortError();

        await setAudioModeAsync({
          allowsRecording: true,
          allowsBackgroundRecording: false,
          shouldPlayInBackground: false,
          shouldRouteThroughEarpiece: false,
          playsInSilentMode: true,
          interruptionMode: 'doNotMix',
        });
        modeChanged = true;
        if (cancelRequested) throw abortError();

        const preset = RecordingPresets.HIGH_QUALITY;
        const options = {
          ...preset,
          directory: 'cache',
          android: { ...preset.android, maxFileSize: MAX_RECORDING_BYTES },
        } as const;
        recorder = new AudioModule.AudioRecorder(processRecordingOptions(options));
        await recorder.prepareToRecordAsync({
          ...options,
        });
        if (recorder.uri?.startsWith(cacheUriPrefix())) ownedUri = recorder.uri;
        if (cancelRequested) throw abortError();

        startedAt = Date.now();
        recorder.record({ forDuration: MAX_RECORDING_MS / 1000 });
        phase = 'recording';
        timer = setTimeout(() => {
          elapsedMs = MAX_RECORDING_MS;
          void stopNative().catch((error) => {
            errorMessage = recorderError(error, 'The recording could not be stopped. Please try again.').message;
            phase = 'failed';
          });
        }, MAX_RECORDING_MS);
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'Microphone recording could not start.';
        phase = cancelRequested ? 'cancelled' : 'failed';
        await cleanupAll();
        throw error;
      }
    })();
    return startPromise;
  };

  const stop = (signal?: AbortSignal): Promise<LocalAudioSource> => {
    if (stopPromise) return stopPromise;
    if (phase === 'idle') return Promise.reject(new Error('Start a recording before stopping it.'));
    if (phase === 'complete' && completedSource) return Promise.resolve(completedSource);
    if (phase === 'disposed' && completedSource) return Promise.resolve(completedSource);
    if (phase === 'cancelled' || cancelRequested) return Promise.reject(abortError());
    stopPromise = (async () => {
      const onAbort = () => operationController.abort();
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
      try {
        if (startPromise) await startPromise;
        if (cancelRequested || operationController.signal.aborted) throw abortError();
        let nativeElapsed = 0;
        try {
          nativeElapsed = recorder?.getStatus().durationMillis ?? 0;
        } catch {
          // Use the wall clock if the recorder status is no longer available.
        }
        elapsedMs = Math.min(MAX_RECORDING_MS, Math.max(elapsedMs, nativeElapsed, Date.now() - startedAt));
        await stopNative();
        if (cancelRequested || operationController.signal.aborted) throw abortError();
        const uri = ownedUri;
        if (!uri) throw new Error('The recording file was not created. Please record again.');
        const file = new File(uri);
        if (!file.exists || !Number.isSafeInteger(file.size) || file.size <= 0) {
          throw new Error('The recording is empty. Record a sound before continuing.');
        }
        if (file.size > MAX_RECORDING_BYTES) throw new Error('Recordings must be 32 MB or smaller. Record a shorter sound.');
        if (elapsedMs < 100) throw new Error('The recording is too short. Record at least 100 ms of sound.');
        phase = 'importing';
        const source = await openLocalAudioFile(file, operationController.signal, RECORDING_TITLE);
        if (cancelRequested || operationController.signal.aborted) {
          await disposeLocalAudioSource(source);
          throw abortError();
        }
        completedSource = source;
        removeOwnedFile();
        releaseRecorder();
        phase = 'complete';
        return source;
      } catch (error) {
        if (!cancelRequested) {
          const wrapped = recorderError(error, 'The recording could not be opened. Try recording again.');
          errorMessage = wrapped.message;
          phase = 'failed';
        }
        await cleanupAll();
        throw cancelRequested ? abortError() : recorderError(error, 'The recording could not be opened. Try recording again.');
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    })();
    return stopPromise;
  };

  const cancel = (): Promise<void> => {
    if (cancelPromise) return cancelPromise;
    cancelRequested = true;
    operationController.abort();
    clearTimer();
    cancelPromise = (async () => {
      if (startPromise) await startPromise.catch(() => {});
      if (recorder && !nativeStopPromise) await stopNative().catch(() => {});
      if (stopPromise) await stopPromise.catch(() => {});
      if (completedSource) {
        const source = completedSource;
        completedSource = null;
        await disposeLocalAudioSource(source).catch(() => {});
      }
      await cleanupAll();
      if (phase !== 'disposed') phase = 'cancelled';
    })();
    return cancelPromise;
  };

  const dispose = async () => {
    if (phase === 'complete' || phase === 'disposed') {
      clearTimer();
      try {
        await restoreAudioMode();
      } catch {
        // A failed mode restore must not prevent releasing native resources.
      }
      releaseRecorder();
      // The caller now owns the editor source and must dispose it through the normal editor lifecycle.
      completedSource = null;
      phase = 'disposed';
    } else {
      await cancel();
      phase = 'disposed';
    }
  };

  const getStatus = (): LocalAudioRecorderStatus => {
    if (phase === 'recording') {
      try {
        elapsedMs = Math.min(MAX_RECORDING_MS, Math.max(elapsedMs, recorder?.getStatus().durationMillis ?? Date.now() - startedAt));
      } catch {
        elapsedMs = Math.min(MAX_RECORDING_MS, Date.now() - startedAt);
      }
    }
    return { isRecording: phase === 'recording', elapsedMs: Math.round(elapsedMs), error: errorMessage };
  };

  return { start, stop, cancel, dispose, getStatus };
}
