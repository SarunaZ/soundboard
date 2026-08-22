/**
 * Tap latency instrumentation — STEPS step 8, DESIGN §6 "Instrument before
 * optimizing".
 *
 * §6's optimization ladder has seven rungs and M5 climbs them one at a time
 * against measured p95. Without a dataset gathered first, every rung will feel
 * like it helped. So this ships before any optimization does.
 *
 * ── What this actually measures ──────────────────────────────────────────────
 * `onPressIn → source scheduled`, NOT DESIGN's "first audible sample".
 * react-native-audio-api exposes neither `outputLatency` nor `baseLatency`, so
 * the hardware output buffer — roughly 10–40 ms on Android's Oboe path — is
 * invisible from inside the app. It is a constant, so it does not distort the
 * comparison between ladder rungs, but it does sit under any absolute claim of
 * p95 < 150 ms. Calibrate it once against an external recording (tap transient
 * to audio onset) and subtract it knowingly. The field is named for what it is
 * rather than what we wish it were.
 */
import { AppState, type AppStateStatus } from 'react-native';

import { currentConnection, startConnectionWatch, type Connection } from './connection';
import { writeBatch } from './sink';

const SCHEMA = 2;

/** Flush once this many samples are waiting. */
const BATCH = 25;
const FLUSH_INTERVAL_MS = 30_000;

/** If the sink keeps failing, drop the oldest rather than growing without bound. */
const MAX_BUFFERED = 1000;

export interface TapSample {
  v: number;
  /** One app launch. Lets a session be excluded wholesale if it was a bad run. */
  session: string;
  padId: string;
  /** Wall clock, for reading and joining only — never for the duration. */
  at: number;
  /** Monotonic. See the note at the top about what this does and does not include. */
  pressToScheduledMs: number;
  /** The bimodal split of §6: warm taps are pure memory, cold ones are the problem. */
  cacheHit: boolean;
  /**
   * Since the previous tap, null on the first of a session. §6's trap is that a
   * phone idle for a few seconds has to wake its modem — without this column the
   * single largest source of cold-tap variance reads as unexplained scatter.
   */
  idleMs: number | null;
  connection: Connection;
  /**
   * Was the previous tap the same pad? null on the first of a session.
   *
   * Without this, "warm" is one bucket holding two regimes that differ by 4x:
   * retriggering a pad (~3 ms) and switching to a different cached pad (~14 ms),
   * both with cacheHit true and comparable idle gaps. Which one dominates depends
   * on how the user happens to tap, so an unsplit warm p50 moves with behaviour
   * rather than with the app - useless as a before/after for M5's ladder.
   */
  sameAsPrevious: boolean | null;
  /** false when play() rejected. A failure is a data point, not a gap. */
  ok: boolean;
}

/**
 * Monotonic. Date.now() is wall clock and steps under NTP correction, which
 * would surface as impossible — occasionally negative — tap durations.
 */
const clock: () => number =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now();

const session = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

let buffer: TapSample[] = [];
let lastTapAt: number | null = null;
let lastPadId: string | null = null;
let flushing = false;

export interface TapHandle {
  /** The sound is scheduled. Returns the recorded sample so the UI can show it. */
  scheduled(): TapSample;
  /** play() rejected. */
  failed(): TapSample;
}

/**
 * Open a measurement. Call at the top of the onPressIn handler, before anything
 * else — `cacheHit` comes from engine.isWarm(), which is the same check play()
 * makes internally on the same tick.
 */
export function beginTap(padId: string, cacheHit: boolean): TapHandle {
  const t0 = clock();
  const idleMs = lastTapAt === null ? null : Math.round(t0 - lastTapAt);
  const sameAsPrevious = lastPadId === null ? null : padId === lastPadId;
  lastTapAt = t0;
  lastPadId = padId;

  // Read synchronously: connection.ts keeps a pushed snapshot precisely so this
  // costs nothing here.
  const connection = currentConnection();
  const at = Date.now();

  const finish = (ok: boolean): TapSample => {
    const sample: TapSample = {
      v: SCHEMA,
      session,
      padId,
      at,
      pressToScheduledMs: Math.round((clock() - t0) * 1000) / 1000,
      cacheHit,
      idleMs,
      sameAsPrevious,
      connection,
      ok,
    };
    push(sample);
    return sample;
  };

  return { scheduled: () => finish(true), failed: () => finish(false) };
}

function push(sample: TapSample): void {
  buffer.push(sample);
  if (buffer.length > MAX_BUFFERED) buffer.splice(0, buffer.length - MAX_BUFFERED);
  if (buffer.length >= BATCH) scheduleFlush('batch');
}

/**
 * Never flush inline. writeBatch touches the filesystem synchronously and push()
 * runs with a finger still on the glass; a zero-delay timeout puts the I/O after
 * the tap has been served. Instrumentation that perturbs the thing it measures
 * is worse than none.
 */
function scheduleFlush(reason: string): void {
  setTimeout(() => {
    void flush(reason);
  }, 0);
}

export async function flush(reason = 'manual'): Promise<void> {
  if (flushing || buffer.length === 0) return;
  flushing = true;

  const batch = buffer;
  buffer = [];

  try {
    await writeBatch(batch);
  } catch (err) {
    // Put them back in front of anything recorded while we were away, so a
    // transient failure costs nothing but ordering.
    buffer = [...batch, ...buffer].slice(-MAX_BUFFERED);
    console.warn(`[metrics] flush (${reason}) failed — ${buffer.length} samples still buffered`, err);
  } finally {
    flushing = false;
  }
}

/** Samples recorded but not yet written. Surfaced in the header during M0. */
export function pendingCount(): number {
  return buffer.length;
}

/** Start collecting. Returns a disposer, so it drops straight into useEffect. */
export function startMetrics(): () => void {
  const stopConnectionWatch = startConnectionWatch();

  // Held in the closure rather than module scope, so a double start cannot
  // strand the first interval (React 19 StrictMode mounts effects twice).
  const timer = setInterval(() => {
    void flush('timer');
  }, FLUSH_INTERVAL_MS);

  // Backgrounding is where samples are most likely to be lost — the process can
  // be killed without further warning.
  const onAppState = (state: AppStateStatus): void => {
    if (state !== 'active') void flush('background');
  };
  const subscription = AppState.addEventListener('change', onAppState);

  return () => {
    subscription.remove();
    clearInterval(timer);
    stopConnectionWatch();
    void flush('teardown');
  };
}

export { metricsFile, readAll, clearAll, METRICS_ENDPOINT } from './sink';
export type { Connection } from './connection';
