import AudioContext from 'react-native-audio-api/lib/module/core/AudioContext';
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
};
export type PlaybackVoiceSnapshot = {
  padId: string;
  soundId?: string;
  position: number;
  duration: number;
  progress: number;
};
export type PlaybackSnapshot = { voices: PlaybackVoiceSnapshot[]; active: boolean };

/** Safe boosted clips keep their requested gain; unsafe clips use protected PCM processing. */
export const PLAYBACK_BOOST_AVAILABLE = true;
const MAX_VOICES = 8;
const MAX_CACHE_BYTES = 48 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 24;
const MAX_VOICE_BUFFER_BYTES = 128 * 1024 * 1024;
const FADE_SECONDS = 0.008;
const UPDATE_MS = 50;

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
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let limiter: WaveShaperNode | null = null;
let masterVolume = 1;
let requestToken = 0;
let stopEpoch = 0;
let lastOverlapMode: boolean | null = null;
const latestRequestByPad = new Map<string, number>();
const voices: Voice[] = [];
const cache = new Map<string, { buffer: DecodedBuffer; bytes: number; peakBound?: number; clipGain?: number }>();
const decoding = new Map<string, Promise<DecodedBuffer>>();
const analyzed = new Map<string, { peak: number; hasNonFinite: boolean }>();
let processingTail: Promise<void> = Promise.resolve();
const listeners = new Set<(snapshot: PlaybackSnapshot) => void>();
let updateTimer: ReturnType<typeof setInterval> | null = null;

function audioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
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
  return ctx;
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

function load(uri: string): Promise<DecodedBuffer> {
  const cached = cache.get(uri);
  if (cached) {
    cache.delete(uri);
    cache.set(uri, cached);
    return Promise.resolve(cached.buffer);
  }
  const pending = decoding.get(uri);
  if (pending) return pending;
  const promise = audioContext().decodeAudioData(uri).then((buffer) => {
    cacheBuffer(uri, buffer);
    return buffer;
  }).finally(() => {
    if (decoding.get(uri) === promise) decoding.delete(uri);
  });
  decoding.set(uri, promise);
  return promise;
}

function isCurrentRequest(padId: string, token: number, epoch: number): boolean {
  return epoch === stopEpoch && latestRequestByPad.get(padId) === token;
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
  padId: string,
  token: number,
  epoch: number,
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
      () => !isCurrentRequest(padId, token, epoch),
    ));
    if (!nativeResult || !isCurrentRequest(padId, token, epoch)) {
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
        if (!isCurrentRequest(padId, token, epoch)) throw new Error('Playback request was superseded.');
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
    if (!isCurrentRequest(padId, token, epoch)) throw new Error('Playback request was superseded.');
    const pcm = await processClipPcm(channels, gain, source.sampleRate, () => !isCurrentRequest(padId, token, epoch));
    if (!isCurrentRequest(padId, token, epoch)) throw new Error('Playback request was superseded.');
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
  try { voice.source?.disconnect(); } catch { /* already disconnected */ }
  try { voice.gain.disconnect(); } catch { /* already disconnected */ }
  updateHeadroom();
  publish();
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
  };
}

export function getPlaybackSnapshot(): PlaybackSnapshot {
  const now = ctx?.currentTime ?? 0;
  return { voices: voices.filter((voice) => !voice.stopped).map((voice) => voiceSnapshot(voice, now)), active: voices.some((voice) => !voice.stopped) };
}

export function subscribePlayback(listener: (snapshot: PlaybackSnapshot) => void): () => void {
  listeners.add(listener);
  listener(getPlaybackSnapshot());
  return () => { listeners.delete(listener); };
}

export async function play(uri: string, padId: string, options: PlaybackOptions = {}): Promise<void> {
  const overlap = options.allowOverlap === true;
  if (lastOverlapMode !== null && lastOverlapMode !== overlap) {
    stopEpoch += 1;
    latestRequestByPad.clear();
  }
  lastOverlapMode = overlap;
  // A monophonic request supersedes pending decodes. Overlap requests remain
  // independent across pads and replace only another request for that pad.
  if (!overlap) stopEpoch += 1;
  const epoch = stopEpoch;
  const token = ++requestToken;
  latestRequestByPad.set(padId, token);
  // Default mode is monophonic. A repeated tap always restarts that pad.
  for (const voice of [...voices]) {
    if (!overlap || voice.padId === padId) releaseVoice(voice);
  }
  const c = audioContext();
  // Android can leave the native output stream paused after an interruption
  // or lifecycle transition. Resume in parallel with decoding, then re-check
  // the request token before any source is scheduled.
  const resume = c.state === 'suspended' ? c.resume() : Promise.resolve();
  let buffer: DecodedBuffer;
  try {
    // Defer load by one microtask so Promise.all attaches rejection handlers
    // to both operations even if starting the decode itself throws.
    [buffer] = await Promise.all([Promise.resolve().then(() => load(uri)), resume]);
  } catch (error) {
    if (epoch !== stopEpoch || latestRequestByPad.get(padId) !== token) return;
    throw error;
  }
  if (!isCurrentRequest(padId, token, epoch)) return;

  if (bufferBytes(buffer) > MAX_VOICE_BUFFER_BYTES) {
    throw new Error('This audio file is too large to play safely.');
  }
  const requestedGain = playbackGainFromControl(options.gain, PLAYBACK_BOOST_AVAILABLE);
  let prepared: Awaited<ReturnType<typeof prepareBuffer>>;
  try {
    prepared = await prepareBuffer(uri, buffer, requestedGain, padId, token, epoch);
  } catch (error) {
    if (!isCurrentRequest(padId, token, epoch)) return;
    throw error;
  }
  if (!isCurrentRequest(padId, token, epoch)) return;
  buffer = prepared.buffer;
  if (bufferBytes(buffer) > MAX_VOICE_BUFFER_BYTES) {
    throw new Error('This audio file is too large to play safely.');
  }
  while (voiceBufferBytes(buffer) > MAX_VOICE_BUFFER_BYTES) {
    const oldest = voices[0];
    if (!oldest) throw new Error('There is not enough playback memory for this audio file.');
    retireVoiceForMemory(oldest);
  }
  const liveVoices = voices.filter((voice) => !voice.stopped);
  if (liveVoices.length >= MAX_VOICES) releaseVoice(liveVoices[0]);
  const voiceGain = c.createGain();
  voiceGain.gain.setValueAtTime(prepared.clipGain, c.currentTime);
  voiceGain.connect(master!);
  const voice: Voice = {
    padId,
    soundId: options.soundId,
    uri,
    buffer,
    source: null,
    gain: voiceGain,
    clipGain: prepared.clipGain,
    peakBound: prepared.peakBound,
    startedAt: c.currentTime,
    fadeStopAt: null,
    repeat: options.repeat ?? 'once',
    stopped: false,
  };
  voices.push(voice);
  updateHeadroom();
  try {
    makeSource(voice, latestFadeStopTime(c.currentTime));
  } catch (error) {
    removeVoice(voice);
    throw error;
  }
  startUpdates();
  publish();
}

export function stop(): void {
  requestToken += 1;
  stopEpoch += 1;
  latestRequestByPad.clear();
  for (const voice of [...voices]) releaseVoice(voice);
  publish();
}

export function setMasterVolume(value: number): void {
  if (!Number.isFinite(value)) return;
  masterVolume = Math.min(1, Math.max(0, value));
  if (ctx && master) master.gain.setValueAtTime(masterVolume, ctx.currentTime);
}
