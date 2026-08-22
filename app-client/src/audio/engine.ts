// Deep import, deliberately. The package root re-exports AudioControls, a UI
// component importing react-native-gesture-handler and react-native-reanimated -
// neither is a declared peer dependency, and both are native modules that would
// force an APK rebuild for a component we never render.
//
// lib/module (compiled) rather than src (TypeScript): importing the source makes
// tsc typecheck the library itself, which does not pass its own strict settings.
// The package publishes no "exports" map, so these paths are legal.
import AudioContext from 'react-native-audio-api/lib/module/core/AudioContext';

// Derived from the API rather than imported: the library's own declarations
// resolve `AudioBuffer` to the DOM global, so importing its classes directly
// produces two mutually-unassignable types with the same name.
type Ctx = InstanceType<typeof AudioContext>;
type AudioBuffer = Awaited<ReturnType<Ctx['decodeAudioData']>>;
type GainNode = ReturnType<Ctx['createGain']>;
type AudioBufferSourceNode = ReturnType<Ctx['createBufferSource']>;

/**
 * Playback engine — DESIGN.md §8.
 *
 * Monophonic: a new pad cuts the current one. "Monophonic" here really means
 * one logical voice with a short crossfade, so two nodes are briefly alive.
 */

/** Without this, every retrigger clicks. §8. */
const FADE_S = 0.008;

/**
 * Decoded PCM is far larger than the encoded file, so the cache is bounded.
 * A miss costs one decode (5-15 ms for a short clip), which stays imperceptible
 * on pointerdown — so a small cache is cheap to be wrong about.
 */
const LRU_MAX = 30;

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
const inFlight = new Map<string, Promise<AudioBuffer>>();
let voice: Voice | null = null;

function context(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/** Map access order is insertion order, so re-inserting on hit gives us LRU. */
function touch(uri: string, buf: AudioBuffer): void {
  buffers.delete(uri);
  buffers.set(uri, buf);
  while (buffers.size > LRU_MAX) {
    const oldest = buffers.keys().next().value;
    if (oldest === undefined) break;
    buffers.delete(oldest);
  }
}

async function load(uri: string): Promise<AudioBuffer> {
  const hit = buffers.get(uri);
  if (hit) {
    touch(uri, hit);
    return hit;
  }
  // Dedup concurrent decodes of the same clip: spamming a cold pad must not
  // start N decodes.
  const pending = inFlight.get(uri);
  if (pending) return pending;

  const p = context()
    .decodeAudioData(uri)
    .then((buf) => {
      touch(uri, buf);
      inFlight.delete(uri);
      return buf;
    })
    .catch((err) => {
      inFlight.delete(uri);
      throw err;
    });
  inFlight.set(uri, p);
  return p;
}

/** Fade the outgoing voice out over FADE_S, then stop it. */
function release(v: Voice, at: number): void {
  try {
    v.gain.gain.setValueAtTime(v.gain.gain.value, at);
    v.gain.gain.linearRampToValueAtTime(0, at + FADE_S);
    v.source.stop(at + FADE_S);
  } catch {
    // Node already ended; nothing to release.
  }
}

export function isWarm(uri: string): boolean {
  return buffers.has(uri);
}

/**
 * Trigger a pad. Resolves once the sound has actually been scheduled, so the
 * caller can measure press -> first audible sample (step 8).
 *
 * No debouncing: spamming faster than the clip length is the airhorn aesthetic.
 */
export async function play(uri: string): Promise<{ cacheHit: boolean }> {
  const cacheHit = buffers.has(uri);
  const buffer = await load(uri);
  const c = context();
  const now = c.currentTime;

  if (voice) release(voice, now);

  // A gain node PER VOICE, not one shared - retrofitting this later is painful.
  const gain = c.createGain();
  gain.gain.setValueAtTime(1, now);
  gain.connect(c.destination);

  // AudioBufferSourceNode is single-use: a fresh node per retrigger, over the
  // same decoded buffer. Sub-millisecond.
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  source.start(now);

  voice = { source, gain };
  return { cacheHit };
}

/** The persistent kill-bar while playing (§9). */
export function stop(): void {
  if (!voice) return;
  release(voice, context().currentTime);
  voice = null;
}

export async function warm(uri: string): Promise<void> {
  try {
    await load(uri);
  } catch {
    // Prefetch is best-effort.
  }
}
