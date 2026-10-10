export const MAX_SOURCE_MS = 20 * 60 * 1000;
export const MAX_CLIP_MS = 60 * 1000;

export type EditorState =
  | 'queued'
  | 'fetching'
  | 'ready'
  | 'rendering'
  | 'rendered'
  | 'failed';

export interface EditorSession {
  id: string;
  sourceUrl: string;
  title: string | null;
  durationMs: number | null;
  state: EditorState;
  previewPath: string | null;
  clipPath: string | null;
  peaks: number[];
  expiresAt: string;
  error: string | null;
  trimStartMs: number | null;
  trimEndMs: number | null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeEditorBase(raw: string | undefined): URL {
  if (!raw?.trim()) throw new Error('Set EXPO_PUBLIC_EDITOR_API_URL to enable the editor.');
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('Editor API URL must be a valid absolute URL.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Editor API URL cannot include credentials, query parameters, or a fragment.');
  }
  const host = url.hostname.toLowerCase();
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const octets = host.split('.');
  const ipv4 = octets.length === 4 && octets.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
    ? octets.map(Number)
    : null;
  const privateIpv4 = ipv4 !== null && (
    ipv4[0] === 10 ||
    (ipv4[0] === 192 && ipv4[1] === 168) ||
    (ipv4[0] === 172 && ipv4[1] !== undefined && ipv4[1] >= 16 && ipv4[1] <= 31)
  );
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (loopback || privateIpv4))) {
    throw new Error('Editor API must use HTTPS, or HTTP on a configured local network address.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

export function youtubeUrl(raw: string): string {
  const trimmed = raw.trim();
  const authority = /^https?:\/\/([^/?#]+)/i.exec(trimmed)?.[1];
  if (!authority) throw new Error('Paste a complete YouTube link.');
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Paste a complete YouTube link.');
  }
  const host = url.hostname.toLowerCase();
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port || authority.includes(':')) {
    throw new Error('YouTube links must use HTTP or HTTPS without credentials or a custom port.');
  }
  if (!['youtube.com', 'www.youtube.com', 'youtu.be'].includes(host)) {
    throw new Error('This editor accepts YouTube links only.');
  }
  let videoId: string | null = null;
  if (host === 'youtu.be') {
    const match = /^\/([^/]+)\/?$/.exec(url.pathname);
    videoId = match?.[1] ?? null;
  } else if (url.pathname === '/watch') {
    const ids = url.searchParams.getAll('v');
    if (ids.length === 1) videoId = ids[0] ?? null;
  } else {
    videoId = /^\/shorts\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  }
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new Error('Enter a single YouTube video link.');
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function validOptionalTime(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid editor session: ${field} must be a nonnegative whole number or null.`);
  }
  return value;
}

export function parseEditorSession(value: unknown): EditorSession {
  if (!value || typeof value !== 'object') throw new Error('Invalid editor session response.');
  const row = value as Record<string, unknown>;
  const states: EditorState[] = ['queued', 'fetching', 'ready', 'rendering', 'rendered', 'failed'];
  if (!isUuid(row.id)) throw new Error('Invalid editor session: id is not a UUID.');
  if (typeof row.sourceUrl !== 'string' || row.sourceUrl.length > 2048) throw new Error('Invalid editor session: sourceUrl.');
  if (row.title !== null && typeof row.title !== 'string') throw new Error('Invalid editor session: title.');
  if (row.durationMs !== null && (typeof row.durationMs !== 'number' || !Number.isSafeInteger(row.durationMs) || row.durationMs < 100 || row.durationMs > MAX_SOURCE_MS)) {
    throw new Error('Invalid editor session: durationMs must be a whole duration from 100 ms to 20 minutes.');
  }
  if (typeof row.state !== 'string' || !states.includes(row.state as EditorState)) throw new Error('Invalid editor session: state.');
  for (const path of ['previewPath', 'clipPath'] as const) {
    if (row[path] !== null && (typeof row[path] !== 'string' || row[path].length > 2048)) {
      throw new Error(`Invalid editor session: ${path}.`);
    }
  }
  if (!Array.isArray(row.peaks) || row.peaks.length > 4096 || row.peaks.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1)) {
    throw new Error('Invalid editor session: peaks.');
  }
  if (typeof row.expiresAt !== 'string' || !Number.isFinite(Date.parse(row.expiresAt))) throw new Error('Invalid editor session: expiresAt.');
  if (row.error !== null && typeof row.error !== 'string') throw new Error('Invalid editor session: error.');
  const trimStartMs = validOptionalTime(row.trimStartMs, 'trimStartMs');
  const trimEndMs = validOptionalTime(row.trimEndMs, 'trimEndMs');
  if ((trimStartMs === null) !== (trimEndMs === null)) throw new Error('Invalid editor session: trim range is incomplete.');
  if (trimStartMs !== null && trimEndMs !== null && (trimEndMs - trimStartMs < 100 || trimEndMs - trimStartMs > MAX_CLIP_MS)) {
    throw new Error('Invalid editor session: trim range must be 100 ms to 60 seconds.');
  }
  if (trimEndMs !== null && row.durationMs === null) throw new Error('Invalid editor session: trim range has no source duration.');
  if (trimEndMs !== null && row.durationMs !== null && trimEndMs > row.durationMs) {
    throw new Error('Invalid editor session: trim range exceeds the source duration.');
  }
  return row as unknown as EditorSession;
}

export function editorResourceUrl(base: URL, path: string | null, resource: 'preview' | 'clip', sessionId: string): string {
  if (!path || !path.trim() || path.startsWith('//')) throw new Error('The editor service did not provide a valid audio path.');
  if (!isUuid(sessionId)) throw new Error('Invalid editor session ID.');
  const basePath = base.pathname === '/' ? '' : base.pathname.replace(/\/+$/, '');
  const resolved = new URL(path, `${base.origin}${basePath}/`);
  const expectedPath = `${basePath}/editor/sessions/${sessionId}/${resource}`;
  if (resolved.origin !== base.origin || resolved.username || resolved.password || resolved.search || resolved.hash || resolved.pathname.toLowerCase() !== expectedPath.toLowerCase()) {
    throw new Error('The editor service returned an audio path outside its configured origin.');
  }
  return resolved.toString();
}

export function clampRange(startMs: number, endMs: number, durationMs: number): [number, number] {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_SOURCE_MS) throw new Error('Source duration is outside the supported 20 minute limit.');
  const minLength = Math.min(100, durationMs);
  let start = Number.isFinite(startMs) ? Math.round(startMs) : 0;
  let end = Number.isFinite(endMs) ? Math.round(endMs) : minLength;
  start = Math.max(0, Math.min(durationMs - minLength, start));
  end = Math.max(start + minLength, Math.min(durationMs, end));
  if (end - start > MAX_CLIP_MS) end = start + MAX_CLIP_MS;
  return [start, end];
}

export function validateRange(startMs: number, endMs: number, durationMs: number): [number, number] {
  if (!Number.isInteger(startMs) || !Number.isInteger(endMs) || !Number.isFinite(durationMs) ||
      durationMs <= 0 || durationMs > MAX_SOURCE_MS || startMs < 0 || endMs <= startMs ||
      endMs > durationMs || endMs - startMs < 100 || endMs - startMs > MAX_CLIP_MS) {
    throw new Error('Choose a valid selection up to 60 seconds long.');
  }
  return [startMs, endMs];
}
