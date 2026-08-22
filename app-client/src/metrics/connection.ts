/**
 * Connection tagging for the latency dataset — STEPS step 8, DESIGN §6.
 *
 * §6's sleeping-radio trap is a cellular phenomenon, "invisible on wifi and at a
 * desk". A timing recorded without the connection it was taken on is therefore
 * close to worthless: the cold taps that matter and the cold taps that don't
 * look identical in the numbers.
 *
 * The snapshot is kept in a variable that NetInfo pushes to, so reading it on
 * the tap path is a plain property read. Instrumentation that awaited a native
 * call while a finger was on the glass would be measuring itself.
 */

/** The slice of NetInfo's state we keep. Recorded on every sample. */
export interface Connection {
  /** 'wifi' | 'cellular' | 'none' | 'unknown' | … straight from NetInfo. */
  type: string;
  /** '2g' | '3g' | '4g' | '5g' on cellular, else null. The radio-wake covariate. */
  generation: string | null;
  reachable: boolean | null;
}

const UNKNOWN: Connection = { type: 'unknown', generation: null, reachable: null };

/**
 * Typed locally rather than imported, following the precedent in audio/engine.ts:
 * this module must survive the package being absent (see loadNetInfo), which a
 * static import would defeat.
 */
interface NetInfoState {
  type: string;
  isInternetReachable: boolean | null;
  details: { cellularGeneration?: string | null } | null;
}

interface NetInfoModule {
  addEventListener(listener: (state: NetInfoState) => void): () => void;
}

declare const require: (name: string) => { default?: NetInfoModule } & NetInfoModule;

let current: Connection = UNKNOWN;

/** Synchronous by design — called once per tap. */
export function currentConnection(): Connection {
  return current;
}

/**
 * NetInfo is a native module, so a JS bundle newer than the installed APK throws
 * here rather than at first use. That is a routine state during development
 * (edit JS, reload Metro, forget the rebuild), and it must not take the app down:
 * samples stay tagged 'unknown' and a rebuild fixes them. `sb apk --clean`.
 */
function loadNetInfo(): NetInfoModule | null {
  try {
    const mod = require('@react-native-community/netinfo');
    return mod.default ?? mod;
  } catch (err) {
    console.warn('[metrics] NetInfo unavailable — connection stays "unknown"', err);
    return null;
  }
}

export function startConnectionWatch(): () => void {
  const netInfo = loadNetInfo();
  if (!netInfo) return () => {};

  try {
    return netInfo.addEventListener((state) => {
      current = {
        type: state.type,
        generation: state.details?.cellularGeneration ?? null,
        reachable: state.isInternetReachable,
      };
    });
  } catch (err) {
    console.warn('[metrics] NetInfo subscription failed', err);
    return () => {};
  }
}
