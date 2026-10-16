import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import { generatedClipId } from './catalog';
import { File } from 'expo-file-system';
import { disposeLocalAudioSource, openLocalAudioFile, type LocalAudioSource } from './localAudio';
import { youtubeUrl } from './protocol';

type NativeYoutubeResult = { uri: string; title: string; durationMs: number };
type NativeYoutubeModule = {
  enabled: boolean;
  privateRelease?: boolean;
  extract(requestId: string, canonicalUrl: string): Promise<NativeYoutubeResult>;
  cancel(requestId: string): Promise<void>;
  release(requestId: string): Promise<void>;
};

const nativeModule = requireOptionalNativeModule<NativeYoutubeModule>('SoundboardYoutube');
const BUNDLED_EXTRACTOR_VERSION = '2025.11.12';
const STAGES = ['INIT', 'METADATA', 'DOWNLOAD', 'OUTPUT'] as const;
const REASONS = [
  'RUNTIME', 'NETWORK', 'ACCESS', 'FORMAT', 'EXTRACTOR', 'INVALID', 'STORAGE', 'TIMEOUT',
  'TOO_LARGE', 'TOO_LONG', 'LIVE_SOURCE', 'HTTP_UNAUTHORIZED', 'HTTP_FORBIDDEN', 'HTTP_NOT_FOUND',
  'HTTP_RATE_LIMIT', 'HTTP_SERVER', 'HTTP_OTHER', 'SIGNATURE', 'JS_CHALLENGE', 'PO_TOKEN',
  'TOOL_MISSING', 'IO', 'PYTHON', 'BUSY', 'CANCELLED', 'UNKNOWN',
] as const;
const SAFE_CODE = new RegExp(`^ERR_SBYT_(?:${STAGES.join('|')})_(?:${REASONS.join('|')})$`);

const STAGE_LABEL: Record<(typeof STAGES)[number], string> = {
  INIT: 'Could not start the extractor',
  METADATA: 'Could not read video information',
  DOWNLOAD: 'Could not download audio',
  OUTPUT: 'Could not prepare audio',
};

const REASON_LABEL: Record<(typeof REASONS)[number], string> = {
  RUNTIME: 'runtime problem',
  NETWORK: 'network/TLS failure',
  ACCESS: 'YouTube access restriction',
  FORMAT: 'unsupported audio format',
  EXTRACTOR: 'extractor failure',
  INVALID: 'invalid response',
  STORAGE: 'storage problem',
  TIMEOUT: 'request timed out',
  TOO_LARGE: 'audio exceeds the 32 MiB limit',
  TOO_LONG: 'video exceeds the 5-minute limit',
  LIVE_SOURCE: 'live or upcoming videos are unsupported',
  HTTP_UNAUTHORIZED: 'HTTP 401 unauthorized response',
  HTTP_FORBIDDEN: 'HTTP 403 forbidden response',
  HTTP_NOT_FOUND: 'HTTP 404 not found response',
  HTTP_RATE_LIMIT: 'HTTP 429 rate limit response',
  HTTP_SERVER: 'HTTP 5xx server response',
  HTTP_OTHER: 'HTTP 4xx client response',
  SIGNATURE: 'signature decryption failure',
  JS_CHALLENGE: 'JavaScript challenge failure',
  PO_TOKEN: 'required PO token missing',
  TOOL_MISSING: 'required media tool missing',
  IO: 'device storage write failure',
  PYTHON: 'extractor Python exception',
  BUSY: 'another extraction is already running',
  CANCELLED: 'loading was cancelled',
  UNKNOWN: 'unknown extraction problem',
};

const LEGACY_ERRORS: Record<string, string> = {
  'On-device YouTube sources must be 5 minutes or shorter.': 'ERR_SBYT_METADATA_TOO_LONG',
  'The extracted audio is larger than 32 MiB.': 'ERR_SBYT_OUTPUT_TOO_LARGE',
  'On-device YouTube extraction timed out.': 'ERR_SBYT_DOWNLOAD_TIMEOUT',
  'Another on-device extraction is already running.': 'ERR_SBYT_INIT_BUSY',
  'The on-device YouTube runtime could not start.': 'ERR_SBYT_INIT_RUNTIME',
};

export function isOnDeviceYoutubeAvailable(): boolean {
  return Platform.OS === 'android' && nativeModule?.enabled === true &&
    typeof nativeModule.extract === 'function' && typeof nativeModule.cancel === 'function' &&
    typeof nativeModule.release === 'function';
}

export function isPrivateYoutubeRelease(): boolean {
  return nativeModule?.privateRelease === true;
}

function abortError(): Error {
  const error = new Error('On-device YouTube loading was cancelled.');
  error.name = 'AbortError';
  return error;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function safeNativeCode(cause: unknown): string | null {
  if (cause === null || (typeof cause !== 'object' && typeof cause !== 'function')) return null;
  let code: unknown;
  try {
    code = (cause as { code?: unknown }).code;
  } catch {
    return null;
  }
  if (typeof code === 'string') {
    const match = SAFE_CODE.exec(code);
    if (match?.[0] === code) return code;
  }

  // Older native builds exposed only these exact, static messages. Never use an
  // arbitrary message as a diagnostic or display string.
  let message: unknown;
  try {
    message = (cause as { message?: unknown }).message;
  } catch {
    return null;
  }
  return typeof message === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_ERRORS, message)
    ? LEGACY_ERRORS[message]
    : null;
}

function safeNativeError(cause: unknown): string {
  const code = safeNativeCode(cause);
  const match = code && /^ERR_SBYT_([A-Z]+)_([A-Z_]+)$/.exec(code);
  if (!code || !match || match[0] !== code ||
      !STAGES.includes(match[1] as (typeof STAGES)[number]) ||
      !REASONS.includes(match[2] as (typeof REASONS)[number])) {
    return `On-device YouTube loading could not complete. Diagnostic: SBYT_UNKNOWN. Bundled extractor: ${BUNDLED_EXTRACTOR_VERSION}.`;
  }
  const stage = match[1] as (typeof STAGES)[number];
  const reason = match[2] as (typeof REASONS)[number];
  const accessNote = reason === 'ACCESS'
    ? ' This prototype does not bypass YouTube sign-in, bot, or access restrictions.'
    : '';
  return `${STAGE_LABEL[stage]}: ${REASON_LABEL[reason]}.${accessNote} Diagnostic: SBYT_${stage}_${reason}. Bundled extractor: ${BUNDLED_EXTRACTOR_VERSION}. These categories are clues, not confirmed root causes.`;
}

/** Extract a permitted YouTube source on Android, then hand it to the normal local editor. */
export async function openYoutubeOnDevice(rawUrl: string, signal?: AbortSignal): Promise<LocalAudioSource> {
  if (!isOnDeviceYoutubeAvailable() || !nativeModule) {
    throw new Error('On-device YouTube loading is unavailable in this build.');
  }
  const canonicalUrl = youtubeUrl(rawUrl);
  assertNotAborted(signal);

  const requestId = generatedClipId();
  let extraction: Promise<NativeYoutubeResult> | null = null;
  let cancelPromise: Promise<void> | null = null;
  let aborted = false;
  let released = false;
  let openedSource: LocalAudioSource | null = null;
  const cancelNative = () => {
    aborted = true;
    if (!cancelPromise) cancelPromise = Promise.resolve().then(() => nativeModule.cancel(requestId)).catch(() => undefined);
    return cancelPromise;
  };
  const onAbort = () => { void cancelNative(); };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    assertNotAborted(signal);
    extraction = nativeModule.extract(requestId, canonicalUrl);
    let result: NativeYoutubeResult;
    try {
      result = await extraction;
    } catch (cause) {
      if (aborted || signal?.aborted) throw abortError();
      throw new Error(safeNativeError(cause));
    }
    assertNotAborted(signal);
    let outputUrl: URL | null = null;
    try { if (typeof result?.uri === 'string') outputUrl = new URL(result.uri); } catch { /* Invalid native URI is handled below. */ }
    const outputPath = outputUrl?.pathname.toLowerCase() ?? '';
    if (!result || !outputUrl || outputUrl.protocol !== 'file:' || !/\.(?:mp3|m4a)$/.test(outputPath) || typeof result.title !== 'string' ||
        typeof result.durationMs !== 'number' || !Number.isFinite(result.durationMs) || result.durationMs <= 0 || result.durationMs > 5 * 60_000) {
      throw new Error('On-device YouTube loading returned invalid audio metadata.');
    }
    try {
      openedSource = await openLocalAudioFile(new File(result.uri), signal, result.title);
    } catch (error) {
      if (aborted || signal?.aborted) throw abortError();
      throw error;
    }
    if (aborted || signal?.aborted) {
      await disposeLocalAudioSource(openedSource);
      openedSource = null;
      throw abortError();
    }
    return openedSource;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    if (aborted || signal?.aborted) await cancelNative();
    // Native owns the temp audio until extraction has fully settled and JS has copied it.
    if (extraction) await extraction.then(() => undefined, () => undefined);
    if (cancelPromise) await cancelPromise;
    if (!released) {
      released = true;
      await Promise.resolve().then(() => nativeModule.release(requestId)).catch(() => undefined);
    }
  }
}
