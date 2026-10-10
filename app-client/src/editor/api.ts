import {
  editorResourceUrl,
  normalizeEditorBase,
  parseEditorSession,
  validateRange,
  youtubeUrl,
  type EditorSession,
} from './protocol';
import { boundedSignal } from './network';

export const EDITOR_API_URL = process.env.EXPO_PUBLIC_EDITOR_API_URL?.trim();
export const EDITOR_TOKEN = process.env.EXPO_PUBLIC_EDITOR_TOKEN?.trim();
const POLL_MS = 1000;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export interface EditorConfig {
  base: URL;
  token: string;
}

export function getEditorConfig(): EditorConfig {
  const base = normalizeEditorBase(EDITOR_API_URL);
  if (!EDITOR_TOKEN) throw new Error('Set EXPO_PUBLIC_EDITOR_TOKEN to enable the editor.');
  return { base, token: EDITOR_TOKEN };
}

function headers(config: EditorConfig): Record<string, string> {
  return { Authorization: `Bearer ${config.token}`, Accept: 'application/json' };
}

function endpoint(config: EditorConfig, suffix: string): string {
  return `${config.base.toString().replace(/\/$/, '')}${suffix}`;
}

async function jsonRequest(
  config: EditorConfig,
  url: string,
  options: RequestInit,
): Promise<EditorSession> {
  const request = boundedSignal(options.signal ?? undefined, 30_000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: request.signal,
      headers: { ...headers(config), ...(options.headers as Record<string, string> | undefined) },
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (request.signal.aborted) throw error;
      body = null;
    }
    if (!response.ok) {
      const message = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `Editor service request failed (${response.status}).`;
      throw new Error(message);
    }
    return parseEditorSession(body);
  } catch (error) {
    if (request.timedOut()) throw new Error('The editor service request timed out. Try again.');
    throw error;
  } finally {
    request.dispose();
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error('Editor operation cancelled.'));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      reject(new Error('Editor operation cancelled.'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function pollEditorSession(
  config: EditorConfig,
  initial: EditorSession,
  signal: AbortSignal,
  target: 'ready' | 'rendered',
  onUpdate: (session: EditorSession) => void,
): Promise<EditorSession> {
  let session = initial;
  const deadline = Date.now() + SESSION_TIMEOUT_MS;
  while (true) {
    if (signal.aborted) throw new Error('Editor operation cancelled.');
    onUpdate(session);
    if (session.state === 'failed') throw new Error(session.error || 'The editor service could not process this video.');
    if (session.state === target || (target === 'ready' && session.state === 'rendered')) return session;
    if (Date.now() >= deadline) throw new Error('The editor service took too long. Try again later.');
    await wait(POLL_MS, signal);
    session = await jsonRequest(config, endpoint(config, `/editor/sessions/${session.id}`), {
      method: 'GET', signal,
    });
    if (session.id !== initial.id) throw new Error('Editor service returned a different session.');
  }
}

export async function createSession(
  config: EditorConfig,
  rawUrl: string,
  signal: AbortSignal,
  onUpdate: (session: EditorSession) => void,
): Promise<EditorSession> {
  const url = youtubeUrl(rawUrl);
  const created = await jsonRequest(config, endpoint(config, '/editor/sessions'), {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!['queued', 'fetching', 'ready'].includes(created.state)) {
    throw new Error('Editor service returned an unexpected session state.');
  }
  return pollEditorSession(config, created, signal, 'ready', onUpdate);
}

export async function renderSession(
  config: EditorConfig,
  session: EditorSession,
  startMs: number,
  endMs: number,
  signal: AbortSignal,
  onUpdate: (session: EditorSession) => void,
): Promise<EditorSession> {
  if (session.durationMs === null) throw new Error('The source duration is not available yet.');
  const [start, end] = validateRange(startMs, endMs, session.durationMs);
  const rendering = await jsonRequest(config, endpoint(config, `/editor/sessions/${session.id}/render`), {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startMs: start, endMs: end }),
  });
  if (rendering.id !== session.id || !['rendering', 'rendered'].includes(rendering.state)) {
    throw new Error('Editor service returned an unexpected render state.');
  }
  return pollEditorSession(config, rendering, signal, 'rendered', onUpdate);
}

export function previewUrl(config: EditorConfig, session: EditorSession): string {
  return editorResourceUrl(config.base, session.previewPath, 'preview', session.id);
}

export function clipUrl(config: EditorConfig, session: EditorSession): string {
  return editorResourceUrl(config.base, session.clipPath, 'clip', session.id);
}

export async function deleteSession(config: EditorConfig, sessionId: string): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) return;
  const request = boundedSignal(undefined, 5000);
  try {
    const response = await fetch(endpoint(config, `/editor/sessions/${sessionId}`), {
      method: 'DELETE', headers: headers(config), signal: request.signal,
    });
    if (!response.ok && response.status !== 404) throw new Error(`Could not remove editor session (${response.status}).`);
  } finally {
    request.dispose();
  }
}
