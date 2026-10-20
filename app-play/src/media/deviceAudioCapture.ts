import { requireOptionalNativeModule } from 'expo';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { disposeLocalAudioSource, openLocalAudioFile, type LocalAudioSource } from './localAudio';

export type DeviceAudioState = 'idle' | 'requesting-permission' | 'preparing' | 'recording' | 'stopping' | 'ready' | 'failed' | 'cancelled';
export type DeviceAudioResult = { uri: string; durationMs: number; sampleRate: number; channels: number; frames: number; peak: number; rms: number; quiet: boolean };
export type DeviceAudioStatus = { sessionId: string | null; state: DeviceAudioState; elapsedMs: number; error: string | null; result?: DeviceAudioResult; stopReason?: string };
type NativeDeviceAudioModule = {
  getStatus(): Promise<DeviceAudioStatus>;
  start(sessionId: string): Promise<DeviceAudioStatus>;
  stop(sessionId: string): Promise<DeviceAudioStatus>;
  cancel(sessionId: string): Promise<void>;
  release(sessionId: string): Promise<void>;
};

const nativeModule = requireOptionalNativeModule<NativeDeviceAudioModule>('SoundboardDeviceAudio');
let sessionCounter = 0;

export function isDeviceAudioCaptureSupported(): boolean {
  return Platform.OS === 'android' && Number(Platform.Version) >= 29 && nativeModule !== null;
}

export function isDeviceAudioSourceAlreadyOwned(source: LocalAudioSource, current: LocalAudioSource | null, pending: LocalAudioSource | null): boolean {
  return source === current || source === pending;
}

function newSessionId(): string {
  sessionCounter += 1;
  return `device-audio-${Date.now()}-${sessionCounter}-${Math.random().toString(36).slice(2)}`;
}

/** Owns one native capture session and transfers its WAV into the existing editor cache. */
export class DeviceAudioCaptureController {
  private sessionId: string | null = null;
  private status: DeviceAudioStatus = { sessionId: null, state: 'idle', elapsedMs: 0, error: null };
  private startPromise: Promise<DeviceAudioStatus> | null = null;
  private transferPromise: Promise<{ source: LocalAudioSource; quiet: boolean }> | null = null;
  private transferred: { source: LocalAudioSource; quiet: boolean } | null = null;
  private transferAbort: AbortController | null = null;
  private released = false;
  private cancelPromise: Promise<void> | null = null;

  getStatus(): DeviceAudioStatus { return this.status; }

  async start(): Promise<DeviceAudioStatus> {
    if (!isDeviceAudioCaptureSupported() || !nativeModule) throw new Error('Device audio recording is available on supported Android devices only.');
    if (this.sessionId) throw new Error('A device audio recording is already in progress.');
    const sessionId = newSessionId();
    this.sessionId = sessionId;
    this.released = false;
    this.transferred = null;
    this.cancelPromise = null;
    this.status = { sessionId, state: 'requesting-permission', elapsedMs: 0, error: null };
    this.startPromise = nativeModule.start(sessionId).then((next) => this.acceptStatus(next, sessionId));
    try {
      return await this.startPromise;
    } catch (error) {
      if (this.sessionId === sessionId) this.status = { sessionId, state: 'failed', elapsedMs: 0, error: error instanceof Error ? error.message : 'Could not start device audio recording.' };
      throw error;
    } finally { this.startPromise = null; }
  }

  async refresh(): Promise<DeviceAudioStatus> {
    if (!this.sessionId || !nativeModule) return this.status;
    const next = await nativeModule.getStatus();
    return this.acceptStatus(next, this.sessionId);
  }

  async stop(signal?: AbortSignal): Promise<{ source: LocalAudioSource; quiet: boolean }> {
    if (!this.sessionId || !nativeModule) throw new Error('No device audio recording is active.');
    const sessionId = this.sessionId;
    const next = await nativeModule.stop(sessionId);
    this.acceptStatus(next, sessionId);
    if (!['ready', 'failed', 'cancelled'].includes(this.status.state)) {
      const deadline = Date.now() + 10_000;
      while (!['ready', 'failed', 'cancelled'].includes(this.status.state) && Date.now() < deadline) {
        if (signal?.aborted) { const error = new Error('Device audio import was cancelled.'); error.name = 'AbortError'; throw error; }
        await new Promise((resolve) => setTimeout(resolve, 150));
        await this.refresh();
      }
    }
    if (!['ready', 'failed', 'cancelled'].includes(this.status.state)) throw new Error('Device audio is still finishing. Return to the app and try again.');
    return this.consumeReady(signal);
  }

  async consumeReady(signal?: AbortSignal): Promise<{ source: LocalAudioSource; quiet: boolean }> {
    if (this.transferred) return this.transferred;
    if (this.transferPromise) return this.transferPromise;
    const sessionId = this.sessionId;
    const result = this.status.result;
    if (!sessionId || !result || this.status.state !== 'ready') throw new Error(this.status.error || 'No completed device recording is ready.');
    if (result.durationMs <= 0 || result.frames <= 0 || !Number.isFinite(result.durationMs)) throw new Error('This recording has no playable audio. Try again with a compatible app playing audio.');
    const abort = new AbortController();
    this.transferAbort = abort;
    const onAbort = () => abort.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) abort.abort();
    this.transferPromise = (async () => {
      let source: LocalAudioSource | null = null;
      try {
        source = await openLocalAudioFile(new File(result.uri), abort.signal, 'Device audio recording', { name: 'device-recording.wav', mimeType: 'audio/wav' });
        if (abort.signal.aborted) {
          await disposeLocalAudioSource(source);
          source = null;
          const error = new Error('Device audio import was cancelled.'); error.name = 'AbortError'; throw error;
        }
        await this.releaseNative(sessionId);
        if (abort.signal.aborted) {
          await disposeLocalAudioSource(source);
          source = null;
          const error = new Error('Device audio import was cancelled.'); error.name = 'AbortError'; throw error;
        }
        const transferred = { source, quiet: result.quiet };
        this.transferred = transferred;
        return transferred;
      } catch (error) {
        if (source) { await disposeLocalAudioSource(source); source = null; }
        throw error;
      } finally {
        signal?.removeEventListener('abort', onAbort);
        this.transferAbort = null;
      }
    })();
    try { return await this.transferPromise; }
    finally { this.transferPromise = null; }
  }

  async cancel(): Promise<void> {
    if (this.cancelPromise) return this.cancelPromise;
    const sessionId = this.sessionId;
    if (!sessionId || !nativeModule) return;
    this.cancelPromise = (async () => {
      this.transferAbort?.abort();
      if (this.transferPromise) {
        await this.transferPromise.catch(() => {});
        await this.releaseNative(sessionId);
      } else {
        if (this.status.state !== 'ready' && this.status.state !== 'failed' && this.status.state !== 'cancelled') {
          await nativeModule.cancel(sessionId).catch(() => {});
        }
        await this.startPromise?.catch(() => {});
        const deadline = Date.now() + 10_000;
        while (!['ready', 'failed', 'cancelled'].includes(this.status.state) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 150));
          await this.refresh();
        }
        if (!['ready', 'failed', 'cancelled'].includes(this.status.state)) throw new Error('Device audio cancellation is still finishing.');
        await this.releaseNative(sessionId);
      }
      this.status = { sessionId, state: 'cancelled', elapsedMs: this.status.elapsedMs, error: null };
      this.sessionId = null;
    })();
    try { await this.cancelPromise; } finally { this.cancelPromise = null; }
  }

  private acceptStatus(next: DeviceAudioStatus, sessionId: string): DeviceAudioStatus {
    if (!next || next.sessionId !== sessionId || this.sessionId !== sessionId) return this.status;
    const currentState = this.status.state;
    const nextState = next.state;
    if (currentState === 'cancelled') return this.status;
    if (currentState === 'ready' || currentState === 'failed') {
      if (nextState !== currentState && nextState !== 'cancelled') return this.status;
    } else {
      const phase: Record<DeviceAudioState, number> = {
        idle: -1, 'requesting-permission': 0, preparing: 1, recording: 2,
        stopping: 3, ready: 4, failed: 4, cancelled: 5,
      };
      if (phase[nextState] < phase[currentState]) return this.status;
    }
    this.status = next;
    return this.status;
  }

  private async releaseNative(sessionId: string): Promise<void> {
    if (this.released || !nativeModule) return;
    await nativeModule.release(sessionId);
    this.released = true;
  }
}

export function createDeviceAudioCaptureController(): DeviceAudioCaptureController {
  return new DeviceAudioCaptureController();
}
