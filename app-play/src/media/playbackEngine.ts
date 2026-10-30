import AudioContext from 'react-native-audio-api/lib/module/core/AudioContext';
import AudioManager from 'react-native-audio-api/lib/module/system/AudioManager';
import { Platform } from 'react-native';
import { calculateMixHeadroom, conservativePeakBound, conservativePeakEstimate, createSoftLimiterCurve, DSP_YIELD_SAMPLES, LIMITER_CEILING, playbackGainFromControl, processClipPcm } from './playbackDsp';
import { assertNativePlaybackPreparationAvailable, prepareNativePlaybackPcm } from './nativePlaybackPreparation';

type Ctx = InstanceType<typeof AudioContext>;
type DecodedBuffer = Awaited<ReturnType<Ctx['decodeAudioData']>>;
type SourceNode = ReturnType<Ctx['createBufferSource']>;
type GainNode = ReturnType<Ctx['createGain']>;
type WaveShaperNode = ReturnType<Ctx['createWaveShaper']>;

export type PlaybackRepeat = 'once' | 'loop' | 'three';
export type PlaybackOptions = {
  soundId?: string;
  gain?: number;
  repeat?: PlaybackRepeat;
  allowOverlap?: boolean;
  protected?: boolean;
};
export type PlaybackVoiceSnapshot = {
  padId: string;
  soundId?: string;
  position: number;
  duration: number;
  progress: number;
  protected: boolean;
};
export type PlaybackSnapshot = {
  voices: PlaybackVoiceSnapshot[];
  pendingProtected: Array<{ padId: string; soundId?: string }>;
  active: boolean;
};

/** Safe boosted clips keep their requested gain; unsafe clips use protected PCM processing. */
export const PLAYBACK_BOOST_AVAILABLE = true;
const MAX_VOICES = 8;
const MAX_CACHE_BYTES = 48 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 24;
const MAX_VOICE_BUFFER_BYTES = 128 * 1024 * 1024;
const FADE_SECONDS = 0.008;
const UPDATE_MS = 50;
const IDLE_SUSPEND_DELAY_MS = 40;

type Voice = {
  padId: string;
  soundId?: string;
  uri: string;
  buffer: DecodedBuffer;
  source: SourceNode | null;
  gain: GainNode;
  clipGain: number;
  peakBound: number;
  startedAt: number;
  fadeStopAt: number | null;
  repeat: PlaybackRepeat;
  stopped: boolean;
  protected: boolean;
  reservationKeys: string[];
};

type PlaybackRequest = {
  token: number;
  padId: string;
  soundId?: string;
  protected: boolean;
  cancelled: boolean;
  failure?: unknown;
  retryCancelled?: boolean;
  reservationKeys: string[];
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let limiter: WaveShaperNode | null = null;
let masterVolume = 1;
let requestToken = 0;
let lastOverlapMode: boolean | null = null;
const requests = new Map<number, PlaybackRequest>();
const contextRetryRequests = new Set<PlaybackRequest>();
const protectedReservations = new Map<string, PlaybackRequest | Voice>();
const voices: Voice[] = [];
const cache = new Map<string, { buffer: DecodedBuffer; bytes: number; peakBound?: number; clipGain?: number }>();
const decoding = new Map<string, { promise: Promise<DecodedBuffer>; requests: Set<number> }>();
const analyzed = new Map<string, { peak: number; hasNonFinite: boolean }>();
let processingTail: Promise<void> = Promise.resolve();
const MAX_CONCURRENT_DECODES = 2;
let activeDecodes = 0;
const decodeQueue: Array<{ requests: Set<number>; work: () => Promise<DecodedBuffer>; resolve: (buffer: DecodedBuffer) => void; reject: (error: unknown) => void }> = [];
const listeners = new Set<(snapshot: PlaybackSnapshot) => void>();
let updateTimer: ReturnType<typeof setInterval> | null = null;
let interruptionListenerInstalled = false;
let audioFocusHeld = false;
let idleSuspendTimer: ReturnType<typeof setTimeout> | null = null;
let suspendPromise: Promise<void> | null = null;
let resumePromise: Promise<void> | null = null;
let contextRecoveryPromise: Promise<void> | null = null;

function observeInterruptions(): void {
  if (interruptionListenerInstalled) return;
  AudioManager.addSystemEventListener('interruption', (event) => {
    if (event.type === 'began') stop();
  });
  // AudioManager emits Android's AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK as a
  // separate `duck` event. Short sound effects follow a stop-on-duck policy.
  AudioManager.addSystemEventListener('duck', () => stop());
  interruptionListenerInstalled = true;
}

function ensureAudioFocus(): void {
  if (audioFocusHeld) return;
  observeInterruptions();
  AudioManager.observeAudioInterruptions('gainTransientMayDuck');
  audioFocusHeld = true;
}

function releaseAudioFocusIfIdle(): void {
  if (!audioFocusHeld || requests.size > 0 || voices.some((voice) => !voice.stopped)) return;
  audioFocusHeld = false;
  try { AudioManager.observeAudioInterruptions(false); } catch { /* focus release must not make Stop fail */ }
}

function audioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    if (ctx.state !== 'closed') {
      master = ctx.createGain();
      limiter = ctx.createWaveShaper();
      limiter.curve = createSoftLimiterCurve();
      // The protected PCM path already reserves intersample margin. A shared
      // oversampled WaveShaper retains resampler state when the graph goes idle,
      // so its previous clip's buffered tail can reappear on the next trigger.
      // The stateless curve remains a final fail-safe without that stale state.
      limiter.oversample = 'none';
      master.gain.setValueAtTime(masterVolume, ctx.currentTime);
      master.connect(limiter);
      limiter.connect(ctx.destination);
    }
  }
  return ctx;
}

function isContextClosed(current: AudioContext): boolean {
  return current.state === 'closed';
}

function scheduleIdleSuspend(): void {
  if (!ctx || requests.size > 0 || voices.length > 0) return;
  if (idleSuspendTimer !== null) clearTimeout(idleSuspendTimer);
  idleSuspendTimer = setTimeout(() => {
    idleSuspendTimer = null;
    const current = ctx;
    if (!current || requests.size > 0 || voices.length > 0) return;
    suspendPromise = (async () => {
      if (current.state === 'running') await current.suspend();
    })().catch(() => {}).finally(() => { suspendPromise = null; });
  }, IDLE_SUSPEND_DELAY_MS);
}

async function resumeForPlayback(current: AudioContext): Promise<void> {
  if (contextRecoveryPromise) await contextRecoveryPromise;
  if (ctx !== current) throw new Error('Playback audio context was replaced.');
  if (idleSuspendTimer !== null) clearTimeout(idleSuspendTimer);
  idleSuspendTimer = null;
  if (suspendPromise) await suspendPromise;
  if (current.state === 'closed') {
    const error = new Error('Playback audio context was closed.');
    await recoverAudioContext(current, error);
    throw error;
  }
  if (current.state !== 'suspended') return;
  if (!resumePromise) resumePromise = current.resume().finally(() => { resumePromise = null; });
  try {
    await resumePromise;
    if (isContextClosed(current)) throw new Error('Playback audio context was closed.');
  } catch (error) {
    await recoverAudioContext(current, error);
    throw error;
  }
}

/** Retire a context whose native output stream can no longer be resumed. */
function recoverAudioContext(failed: AudioContext, error: unknown): Promise<void> {
  if (ctx !== failed) return contextRecoveryPromise ?? Promise.resolve();
  if (contextRecoveryPromise) return contextRecoveryPromise;

  // Invalidate synchronously so concurrent taps cannot keep using a context
  // whose native stream has failed. AudioBuffers are runtime-owned, so drop
  // decoded and prepared entries along with it.
  ctx = null;
  master = null;
  limiter = null;
  cache.clear();
  decoding.clear();
  analyzed.clear();
  if (idleSuspendTimer !== null) clearTimeout(idleSuspendTimer);
  idleSuspendTimer = null;

  for (const request of [...requests.values()]) {
    request.failure = error;
    contextRetryRequests.add(request);
    cancelRequest(request);
  }
  for (const voice of [...voices]) {
    voice.stopped = true;
    releaseReservations(voice);
    try { voice.source?.stop(failed.currentTime); } catch { /* native stream already failed */ }
    try { voice.source?.disconnect(); } catch { /* already disconnected */ }
    try { voice.gain.disconnect(); } catch { /* already disconnected */ }
  }
  voices.length = 0;
  if (updateTimer !== null) clearInterval(updateTimer);
  updateTimer = null;
  publish();
  releaseAudioFocusIfIdle();

  // Closing is serialized before a later attempt resumes a newly constructed
  // context, avoiding an overlap between the dead and replacement Oboe streams.
  contextRecoveryPromise = Promise.resolve().then(() => failed.close()).catch(() => {}).finally(() => {
    contextRecoveryPromise = null;
  });
  return contextRecoveryPromise;
}

function bufferBytes(buffer: DecodedBuffer): number {
  return buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
}

function voiceBufferBytes(extra?: DecodedBuffer): number {
  const unique = new Set(voices.map((voice) => voice.buffer));
  if (extra) unique.add(extra);
  return [...unique].reduce((total, buffer) => total + bufferBytes(buffer), 0);
}

function cacheBuffer(key: string, buffer: DecodedBuffer): void {
  const bytes = bufferBytes(buffer);
  // A single unusually long decoded clip may play, but is not retained.
  if (bytes > MAX_CACHE_BYTES) return;
  cache.delete(key);
  cache.set(key, { buffer, bytes });
  let usedBytes = [...cache.values()].reduce((total, entry) => total + entry.bytes, 0);
  while (cache.size > MAX_CACHE_ENTRIES || usedBytes > MAX_CACHE_BYTES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    const removed = cache.get(oldest);
    cache.delete(oldest);
    usedBytes -= removed?.bytes ?? 0;
  }
}

function load(uri: string, request: PlaybackRequest): Promise<DecodedBuffer> {
  const cached = cache.get(uri);
  if (cached) {
    cache.delete(uri);
    cache.set(uri, cached);
    return Promise.resolve(cached.buffer);
  }
  const pending = decoding.get(uri);
  if (pending) {
    pending.requests.add(request.token);
    return pending.promise;
  }
  const entry = { promise: Promise.resolve(null as unknown as DecodedBuffer), requests: new Set([request.token]) };
  entry.promise = withDecodeSlot(entry.requests, async () => {
    const buffer = await audioContext().decodeAudioData(uri);
    // A native decode cannot be interrupted, but discard its result when all
    // waiting taps were stopped so cold rapid taps cannot fill the cache.
    if (![...entry.requests].some((token) => {
      const current = requests.get(token);
      return current !== undefined && isCurrentRequest(current);
    })) throw new Error('Playback request was superseded.');
    cacheBuffer(uri, buffer);
    return buffer;
  }).finally(() => { if (decoding.get(uri) === entry) decoding.delete(uri); });
  decoding.set(uri, entry);
  return entry.promise;
}

function hasCurrentDecodeRequest(tokens: Set<number>): boolean {
  return [...tokens].some((token) => {
    const current = requests.get(token);
    return current !== undefined && isCurrentRequest(current);
  });
}

function drainDecodeQueue(): void {
  while (activeDecodes < MAX_CONCURRENT_DECODES && decodeQueue.length > 0) {
    const entry = decodeQueue.shift()!;
    if (!hasCurrentDecodeRequest(entry.requests)) {
      entry.reject(new Error('Playback request was superseded.'));
      continue;
    }
    activeDecodes += 1;
    void entry.work().then(entry.resolve, entry.reject).finally(() => {
      activeDecodes -= 1;
      drainDecodeQueue();
    });
  }
}

function withDecodeSlot(requestsToKeep: Set<number>, work: () => Promise<DecodedBuffer>): Promise<DecodedBuffer> {
  return new Promise((resolve, reject) => {
    decodeQueue.push({ requests: requestsToKeep, work, resolve, reject });
    drainDecodeQueue();
  });
}

function isCurrentRequest(request: PlaybackRequest): boolean {
  return !request.cancelled && requests.get(request.token) === request;
}

function reservationKeys(padId: string, soundId?: string): string[] {
  return [`pad:${padId}`, ...(soundId ? [`sound:${soundId}`] : [])];
}

function releaseReservations(owner: PlaybackRequest | Voice): void {
  for (const key of owner.reservationKeys) {
    if (protectedReservations.get(key) === owner) protectedReservations.delete(key);
  }
}

function cancelRequest(request: PlaybackRequest): void {
  const wasProtected = request.protected;
  request.cancelled = true;
  requests.delete(request.token);
  releaseReservations(request);
  if (wasProtected) publish();
  releaseAudioFocusIfIdle();
  scheduleIdleSuspend();
}

function protectOwner(owner: PlaybackRequest | Voice): boolean {
  if (owner.protected) return true;
  const keys = reservationKeys(owner.padId, owner.soundId);
  if (keys.some((key) => {
    const reservation = protectedReservations.get(key);
    return reservation !== undefined && reservation !== owner;
  })) return false;
  owner.protected = true;
  owner.reservationKeys = keys;
  for (const key of keys) protectedReservations.set(key, owner);
  return true;
}

async function withProcessingSlot<T>(work: () => Promise<T>): Promise<T> {
  const previous = processingTail;
  let release!: () => void;
  processingTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await work(); }
  finally { release(); }
}

function rememberAnalysis(uri: string, result: { peak: number; hasNonFinite: boolean }): void {
  analyzed.delete(uri);
  analyzed.set(uri, result);
  while (analyzed.size > MAX_CACHE_ENTRIES) {
    const oldest = analyzed.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    analyzed.delete(oldest);
  }
}

async function prepareBuffer(
  uri: string,
  source: DecodedBuffer,
  gain: number,
  request: PlaybackRequest,
): Promise<{ buffer: DecodedBuffer; clipGain: number; peakBound: number }> {
  if (Platform.OS === 'android') assertNativePlaybackPreparationAvailable();
  const key = `${uri}\u0000gain:${gain}`;
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return { buffer: cached.buffer, clipGain: cached.clipGain ?? 1, peakBound: cached.peakBound ?? LIMITER_CEILING };
  }
  // Keep duration/progress while making mute allocation- and scan-free.
  if (gain === 0) return { buffer: source, clipGain: 0, peakBound: 0 };

  const channels = Array.from({ length: source.numberOfChannels }, (_, channel) => source.getChannelData(channel));
  if (Platform.OS === 'android') {
    const nativeResult = await withProcessingSlot(() => prepareNativePlaybackPcm(
      channels,
      gain,
      source.sampleRate,
      () => !isCurrentRequest(request),
    ));
    if (!nativeResult || !isCurrentRequest(request)) {
      throw new Error('Playback request was superseded.');
    }
    if (!nativeResult.processed) {
      return { buffer: source, clipGain: nativeResult.clipGain, peakBound: nativeResult.peakBound };
    }
    const output = audioContext().createBuffer(source.numberOfChannels, source.length, source.sampleRate);
    nativeResult.channels.forEach((channel, index) => output.copyToChannel(channel, index));
    const prepared = { buffer: output, clipGain: nativeResult.clipGain, peakBound: nativeResult.peakBound };
    cacheBuffer(key, prepared.buffer);
    const entry = cache.get(key);
    if (entry) {
      entry.peakBound = prepared.peakBound;
      entry.clipGain = prepared.clipGain;
    }
    return prepared;
  }

  let inspection = analyzed.get(uri);
  if (inspection) {
    analyzed.delete(uri);
    analyzed.set(uri, inspection);
  } else {
    let peak = 0;
    let hasNonFinite = false;
    for (let frame = 0; frame < source.length; frame += 1) {
      if (frame > 0 && frame % DSP_YIELD_SAMPLES === 0) {
        if (!isCurrentRequest(request)) throw new Error('Playback request was superseded.');
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      for (const channel of channels) {
        const sample = channel[frame]!;
        if (!Number.isFinite(sample)) hasNonFinite = true;
        else peak = Math.max(peak, Math.abs(sample));
      }
    }
    inspection = { peak, hasNonFinite };
    rememberAnalysis(uri, inspection);
  }
  const peakAfterGain = inspection.peak * gain;
  // Quiet clips can take the requested boost directly through the voice gain
  // node. Running the offline limiter for every >100% gain needlessly copies
  // and scans PCM, and can delay a first tap by seconds on longer clips.
  const needsProcessing = inspection.hasNonFinite || conservativePeakEstimate(peakAfterGain) > LIMITER_CEILING;
  if (!needsProcessing) return { buffer: source, clipGain: gain, peakBound: conservativePeakBound(peakAfterGain) };

  const processed = await withProcessingSlot(async () => {
    if (!isCurrentRequest(request)) throw new Error('Playback request was superseded.');
    const pcm = await processClipPcm(channels, gain, source.sampleRate, () => !isCurrentRequest(request));
    if (!isCurrentRequest(request)) throw new Error('Playback request was superseded.');
    const output = audioContext().createBuffer(source.numberOfChannels, source.length, source.sampleRate);
    pcm.channels.forEach((channel, index) => output.copyToChannel(new Float32Array(channel), index));
    return { ...pcm, buffer: output };
  });
  // Keep derived PCM within the existing cache and active voice budgets. A
  // large one-off clip is playable but does not remain cached.
  cacheBuffer(key, processed.buffer);
  const entry = cache.get(key);
  if (entry) {
    entry.peakBound = processed.peak;
    entry.clipGain = 1;
  }
  return { buffer: processed.buffer, clipGain: 1, peakBound: processed.peak };
}

function publish(): void {
  const snapshot = getPlaybackSnapshot();
  for (const listener of listeners) listener(snapshot);
  if (!voices.length && updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
}

function startUpdates(): void {
  if (updateTimer === null) updateTimer = setInterval(publish, UPDATE_MS);
}

function removeVoice(voice: Voice): void {
  const index = voices.indexOf(voice);
  if (index >= 0) voices.splice(index, 1);
  releaseReservations(voice);
  try { voice.source?.disconnect(); } catch { /* already disconnected */ }
  try { voice.gain.disconnect(); } catch { /* already disconnected */ }
  updateHeadroom();
  publish();
  releaseAudioFocusIfIdle();
  scheduleIdleSuspend();
}

/** Bound a worst-case aligned PCM sum before it reaches the soft-knee stage. */
function updateHeadroom(): void {
  // Include releasing/fading voices so an aligned worst-case mix stays below
  // the per-clip ceiling. A lone protected clip keeps its full level.
  const headroom = calculateMixHeadroom(voices.map((voice) => voice.peakBound));
  const now = ctx?.currentTime ?? 0;
  for (const voice of voices) {
    if (!voice.stopped) voice.gain.gain.setValueAtTime(voice.clipGain * headroom, now);
  }
}

function latestFadeStopTime(now: number): number {
  return voices.reduce((latest, voice) =>
    voice.stopped && voice.fadeStopAt !== null ? Math.max(latest, voice.fadeStopAt) : latest, now);
}

function releaseVoice(voice: Voice, at = audioContext().currentTime): void {
  if (voice.stopped) return;
  voice.stopped = true;
  releaseReservations(voice);
  try {
    voice.fadeStopAt = at + FADE_SECONDS;
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, at);
    voice.gain.gain.linearRampToValueAtTime(0, at + FADE_SECONDS);
    voice.source?.stop(voice.fadeStopAt);
    updateHeadroom();
  } catch {
    removeVoice(voice);
  }
}

function retireVoiceForMemory(voice: Voice): void {
  if (!voice.stopped) {
    voice.stopped = true;
    try { voice.source?.stop(audioContext().currentTime); } catch { /* already ended */ }
  }
  removeVoice(voice);
}

function makeSource(voice: Voice, when: number): void {
  if (voice.stopped || !ctx) return;
  const source = audioContext().createBufferSource();
  source.buffer = voice.buffer;
  source.loop = voice.repeat !== 'once';
  source.connect(voice.gain);
  voice.source = source;
  voice.startedAt = when;
  source.onEnded = () => {
    if (voice.stopped || !voices.includes(voice)) {
      removeVoice(voice);
      return;
    }
    removeVoice(voice);
  };
  source.start(when);
  if (voice.repeat === 'three') source.stop(when + voice.buffer.duration * 3);
}

function voiceSnapshot(voice: Voice, now: number): PlaybackVoiceSnapshot {
  const duration = Math.max(0, voice.buffer.duration);
  const elapsed = Math.max(0, now - voice.startedAt);
  const position = voice.repeat !== 'once' && duration > 0
    ? elapsed % duration
    : Math.min(duration, elapsed);
  return {
    padId: voice.padId,
    ...(voice.soundId ? { soundId: voice.soundId } : {}),
    position,
    duration,
    progress: duration > 0 ? Math.min(1, position / duration) : 0,
    protected: voice.protected,
  };
}

export function getPlaybackSnapshot(): PlaybackSnapshot {
  const now = ctx?.currentTime ?? 0;
  const activeVoices = voices.filter((voice) => !voice.stopped);
  const pendingProtected = [...requests.values()]
    .filter((request) => request.protected && !request.cancelled)
    .map(({ padId, soundId }) => ({ padId, ...(soundId ? { soundId } : {}) }));
  return {
    voices: activeVoices.map((voice) => voiceSnapshot(voice, now)),
    pendingProtected,
    active: activeVoices.length > 0 || pendingProtected.length > 0,
  };
}

export function subscribePlayback(listener: (snapshot: PlaybackSnapshot) => void): () => void {
  listeners.add(listener);
  listener(getPlaybackSnapshot());
  return () => { listeners.delete(listener); };
}

/** Promote a pending request or active voice without restarting its source. */
export function protectPad(padId: string): boolean {
  const voice = [...voices].reverse().find((candidate) => candidate.padId === padId && !candidate.stopped);
  if (voice) {
    const promoted = protectOwner(voice);
    if (promoted) publish();
    return promoted;
  }
  const request = [...requests.values()].reverse().find((candidate) => candidate.padId === padId && !candidate.cancelled);
  if (!request) return false;
  const promoted = protectOwner(request);
  if (promoted) publish();
  return promoted;
}

async function playInternal(uri: string, padId: string, options: PlaybackOptions, allowContextRetry: boolean): Promise<void> {
  const overlap = options.allowOverlap === true;
  const isProtected = options.protected === true;
  const soundId = options.soundId;
  const keys = isProtected ? reservationKeys(padId, soundId) : [];
  if (keys.some((key) => protectedReservations.has(key)) || protectedReservations.has(`pad:${padId}`) || (soundId ? protectedReservations.has(`sound:${soundId}`) : false)) return;
  if (lastOverlapMode !== null && lastOverlapMode !== overlap) {
    for (const request of [...requests.values()]) if (!request.protected) cancelRequest(request);
  }
  lastOverlapMode = overlap;
  const token = ++requestToken;
  const request: PlaybackRequest = { token, padId, soundId, protected: isProtected, cancelled: false, reservationKeys: keys };
  requests.set(token, request);
  if (isProtected) for (const key of keys) protectedReservations.set(key, request);
  if (isProtected) publish();
  // Monophonic requests supersede pending unprotected requests. Protected
  // requests and their reservations survive ordinary replacement.
  for (const pending of [...requests.values()]) {
    if (pending !== request && !pending.protected && (!overlap || pending.padId === padId)) cancelRequest(pending);
  }
  // A normal repeated tap restarts that pad. A protected voice is immutable
  // to normal replacement and cannot be retriggered through either identity.
  for (const voice of [...voices]) {
    if (voice.protected) continue;
    if ((!isProtected && !overlap) || voice.padId === padId) releaseVoice(voice);
  }
  try { ensureAudioFocus(); }
  catch (error) { cancelRequest(request); throw error; }
  let c: AudioContext;
  try {
    // A new native AudioContext opens its Oboe stream during construction.
    // Wait for teardown of a failed stream before constructing its replacement.
    if (contextRecoveryPromise) await contextRecoveryPromise;
    if (!isCurrentRequest(request)) { scheduleIdleSuspend(); return; }
    if (ctx?.state === 'closed') {
      await recoverAudioContext(ctx, new Error('Playback audio context was closed.'));
      if (!isCurrentRequest(request)) {
        if (allowContextRetry && request.failure !== undefined && !request.retryCancelled && request.token === requestToken) {
          contextRetryRequests.delete(request);
          return playInternal(uri, padId, { ...options, protected: request.protected }, false);
        }
        contextRetryRequests.delete(request);
        scheduleIdleSuspend();
        if (request.failure !== undefined && !request.retryCancelled && request.token === requestToken) throw request.failure;
        return;
      }
    }
    c = audioContext();
    if (c.state === 'closed') {
      await recoverAudioContext(c, new Error('Playback audio context was closed.'));
      if (!isCurrentRequest(request)) {
        if (allowContextRetry && request.failure !== undefined && !request.retryCancelled && request.token === requestToken) {
          contextRetryRequests.delete(request);
          return playInternal(uri, padId, { ...options, protected: request.protected }, false);
        }
        contextRetryRequests.delete(request);
        scheduleIdleSuspend();
        if (request.failure !== undefined && !request.retryCancelled && request.token === requestToken) throw request.failure;
        return;
      }
      c = audioContext();
    }
  }
  catch (error) { cancelRequest(request); throw error; }
  // Android can leave the native output stream paused after an interruption
  // or lifecycle transition. Resume in parallel with decoding, then re-check
  // the request token before any source is scheduled.
  let resume: Promise<void>;
  try { resume = resumeForPlayback(c); }
  catch (error) { cancelRequest(request); throw error; }
  let buffer: DecodedBuffer;
  try {
    // Defer load by one microtask so Promise.all attaches rejection handlers
    // to both operations even if starting the decode itself throws.
    [buffer] = await Promise.all([Promise.resolve().then(() => load(uri, request)), resume]);
  } catch (error) {
    if (!isCurrentRequest(request)) {
      scheduleIdleSuspend();
      if (request.failure !== undefined && !request.retryCancelled && request.token === requestToken) {
        contextRetryRequests.delete(request);
        if (allowContextRetry) return playInternal(uri, padId, { ...options, protected: request.protected }, false);
        throw request.failure;
      }
      contextRetryRequests.delete(request);
      return;
    }
    cancelRequest(request);
    throw error;
  }
  if (!isCurrentRequest(request)) { scheduleIdleSuspend(); return; }

  if (bufferBytes(buffer) > MAX_VOICE_BUFFER_BYTES) {
    cancelRequest(request);
    throw new Error('This audio file is too large to play safely.');
  }
  const requestedGain = playbackGainFromControl(options.gain, PLAYBACK_BOOST_AVAILABLE);
  let prepared: Awaited<ReturnType<typeof prepareBuffer>>;
  try {
    prepared = await prepareBuffer(uri, buffer, requestedGain, request);
  } catch (error) {
    if (!isCurrentRequest(request)) { scheduleIdleSuspend(); return; }
    cancelRequest(request);
    throw error;
  }
  if (!isCurrentRequest(request)) { scheduleIdleSuspend(); return; }
  buffer = prepared.buffer;
  if (bufferBytes(buffer) > MAX_VOICE_BUFFER_BYTES) {
    cancelRequest(request);
    throw new Error('This audio file is too large to play safely.');
  }
  while (voiceBufferBytes(buffer) > MAX_VOICE_BUFFER_BYTES) {
    const oldest = voices.find((voice) => !voice.protected);
    if (!oldest) {
      cancelRequest(request);
      throw new Error('There is not enough playback memory for this audio file.');
    }
    retireVoiceForMemory(oldest);
  }
  const liveVoices = voices.filter((voice) => !voice.stopped);
  if (liveVoices.length >= MAX_VOICES) {
    const oldest = liveVoices.find((voice) => !voice.protected);
    if (!oldest) {
      cancelRequest(request);
      throw new Error('Playback is at its protected voice limit. Stop a protected sound before playing another.');
    }
    releaseVoice(oldest);
  }
  let voiceGain: GainNode | null = null;
  try {
    voiceGain = c.createGain();
    voiceGain.gain.setValueAtTime(prepared.clipGain, c.currentTime);
    voiceGain.connect(master!);
  } catch (error) {
    try { voiceGain?.disconnect(); } catch { /* partial graph setup */ }
    cancelRequest(request);
    throw error;
  }
  const voice: Voice = {
    padId,
    soundId: options.soundId,
    uri,
    buffer,
    source: null,
    gain: voiceGain!,
    clipGain: prepared.clipGain,
    peakBound: prepared.peakBound,
    startedAt: c.currentTime,
    fadeStopAt: null,
    repeat: options.repeat ?? 'once',
    stopped: false,
    // protectPad may promote this request while decode/DSP is awaiting, so
    // transfer the live request state rather than the original option value.
    protected: request.protected,
    reservationKeys: request.reservationKeys,
  };
  requests.delete(request.token);
  if (request.protected) for (const key of request.reservationKeys) protectedReservations.set(key, voice);
  voices.push(voice);
  try {
    updateHeadroom();
    makeSource(voice, latestFadeStopTime(c.currentTime));
  } catch (error) {
    removeVoice(voice);
    throw error;
  }
  startUpdates();
  publish();
}

export function play(uri: string, padId: string, options: PlaybackOptions = {}): Promise<void> {
  return playInternal(uri, padId, options, true);
}

export function stop(): void {
  requestToken += 1;
  for (const request of [...requests.values()]) cancelRequest(request);
  for (const voice of [...voices]) releaseVoice(voice);
  publish();
  releaseAudioFocusIfIdle();
  scheduleIdleSuspend();
}

/** Stop every pending or active playback for one board pad. */
export function stopPad(padId: string): void {
  for (const request of contextRetryRequests) if (request.padId === padId) request.retryCancelled = true;
  for (const request of [...requests.values()]) if (request.padId === padId) cancelRequest(request);
  for (const voice of [...voices]) if (voice.padId === padId) releaseVoice(voice);
  publish();
  releaseAudioFocusIfIdle();
  scheduleIdleSuspend();
}

export function setMasterVolume(value: number): void {
  if (!Number.isFinite(value)) return;
  masterVolume = Math.min(1, Math.max(0, value));
  if (ctx && master) master.gain.setValueAtTime(masterVolume, ctx.currentTime);
}
