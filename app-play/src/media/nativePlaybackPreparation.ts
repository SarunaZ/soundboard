import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { MAX_PLAYBACK_AMPLITUDE } from './playbackDsp';

type NativePreparationStatus =
  | { state: 'pending' }
  | { state: 'ready'; processed: boolean; clipGain: number; peakBound: number; channels: ArrayBuffer[] }
  | { state: 'failed'; message: string }
  | { state: 'cancelled' };

type NativePlaybackPreparationModule = {
  startPlaybackPreparation(channels: Float32Array[], gain: number, sampleRate: number): string;
  pollPlaybackPreparation(jobId: string): NativePreparationStatus;
  cancelPlaybackPreparation(jobId: string): void;
};

export type NativePlaybackPcm = {
  processed: boolean;
  clipGain: number;
  peakBound: number;
  channels: Float32Array<ArrayBuffer>[];
};

const nativeModule = requireOptionalNativeModule<NativePlaybackPreparationModule>('SoundboardDeviceAudio');
const POLL_INTERVAL_MS = 8;

function missingNativeError(): Error {
  return new Error('Native playback preparation is unavailable. Rebuild and reinstall the Android app to enable boosted playback.');
}

function hasNativePlaybackApi(module: NativePlaybackPreparationModule | null): module is NativePlaybackPreparationModule {
  return module !== null
    && typeof module.startPlaybackPreparation === 'function'
    && typeof module.pollPlaybackPreparation === 'function'
    && typeof module.cancelPlaybackPreparation === 'function';
}

function validateReady(result: Extract<NativePreparationStatus, { state: 'ready' }>, expectedChannels: number, expectedLength: number): NativePlaybackPcm {
  if (typeof result.processed !== 'boolean') {
    throw new Error('Native playback preparation returned an invalid processing status.');
  }
  if (!Number.isFinite(result.clipGain) || result.clipGain < 0 || result.clipGain > MAX_PLAYBACK_AMPLITUDE) {
    throw new Error('Native playback preparation returned an invalid clip gain.');
  }
  if (!Number.isFinite(result.peakBound) || result.peakBound < 0) {
    throw new Error('Native playback preparation returned an invalid peak bound.');
  }
  if (!result.processed) {
    if (!Array.isArray(result.channels) || result.channels.length !== 0) {
      throw new Error('Native playback preparation returned audio for an unprocessed clip.');
    }
    return { processed: false, clipGain: result.clipGain, peakBound: result.peakBound, channels: [] };
  }
  if (!Array.isArray(result.channels) || result.channels.length !== expectedChannels) {
    throw new Error('Native playback preparation returned the wrong number of audio channels.');
  }
  const channels = result.channels.map((buffer) => {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== expectedLength * Float32Array.BYTES_PER_ELEMENT) {
      throw new Error('Native playback preparation returned an invalid audio channel length.');
    }
    return new Float32Array(buffer);
  });
  return { processed: true, clipGain: result.clipGain, peakBound: result.peakBound, channels };
}

/** Run Android PCM analysis and limiting on the native worker, polling without blocking JS. */
export async function prepareNativePlaybackPcm(
  sourceChannels: Float32Array[],
  gain: number,
  sampleRate: number,
  shouldCancel: () => boolean = () => false,
): Promise<NativePlaybackPcm | null> {
  if (Platform.OS !== 'android' || !hasNativePlaybackApi(nativeModule)) throw missingNativeError();
  if (shouldCancel()) return null;
  if (!sourceChannels.length || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error('Native playback preparation received invalid audio.');
  }
  const expectedLength = sourceChannels[0]!.length;
  if (sourceChannels.some((channel) => channel.length !== expectedLength)) {
    throw new Error('Native playback preparation received mismatched channel lengths.');
  }

  const jobId = nativeModule.startPlaybackPreparation(sourceChannels, gain, sampleRate);
  let cancelling = false;
  try {
    for (;;) {
      if (shouldCancel() && !cancelling) {
        cancelling = true;
        nativeModule.cancelPlaybackPreparation(jobId);
      }
      const status = nativeModule.pollPlaybackPreparation(jobId);
      if (status.state === 'pending') {
        await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }
      if (status.state === 'cancelled') return null;
      if (status.state === 'failed') throw new Error(status.message || 'Native playback preparation failed.');
      // If cancellation raced with completion, discard the result. The native
      // poll consumes completed results, so this also guarantees no job leaks.
      if (cancelling || shouldCancel()) return null;
      return validateReady(status, sourceChannels.length, expectedLength);
    }
  } catch (error) {
    if (!cancelling) {
      cancelling = true;
      try { nativeModule.cancelPlaybackPreparation(jobId); } catch { /* terminal jobs may already be consumed */ }
      // Drain until native acknowledges the cancellation/completion. This owns
      // the job lifetime even when a poll or validation call throws.
      for (;;) {
        try {
          const status = nativeModule.pollPlaybackPreparation(jobId);
          if (status.state !== 'pending') break;
        } catch { break; }
        await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }
    throw error;
  }
}

/** Android builds missing the rebuilt native module must not silently run the slow Hermes DSP. */
export function assertNativePlaybackPreparationAvailable(): void {
  if (Platform.OS === 'android' && !hasNativePlaybackApi(nativeModule)) throw missingNativeError();
}
