export interface EditorSessionResponse {
  id: string; sourceUrl: string; title: string | null; durationMs: number | null;
  state: 'queued' | 'fetching' | 'ready' | 'rendering' | 'rendered' | 'failed';
  previewPath: string | null; clipPath: string | null; peaks: number[]; expiresAt: string;
  error: string | null; trimStartMs: number | null; trimEndMs: number | null;
}

export const MAX_SOURCE_DURATION_MS = 20 * 60 * 1000;
export const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
export const MAX_CLIP_DURATION_MS = 60 * 1000;
export const MIN_CLIP_DURATION_MS = 100;
export const SESSION_TTL_MS = 60 * 60 * 1000;
export const MAX_QUEUED_SESSIONS = 8;
export const MAX_TOTAL_SESSIONS = 12;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Accept only the supported public YouTube URL forms, and remove tracking parameters. */
export function canonicalizeYouTubeUrl(input: unknown): string {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('Enter a valid YouTube URL.');
  const trimmed = input.trim();
  const authority = /^https?:\/\/([^/?#]+)/i.exec(trimmed)?.[1];
  if (!authority) throw new Error('Enter a valid YouTube URL.');
  let url: URL;
  try { url = new URL(trimmed); } catch { throw new Error('Enter a valid YouTube URL.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port || authority.includes(':')) throw new Error('Enter a valid YouTube URL.');

  let id: string | null = null;
  if (url.hostname === 'youtube.com' || url.hostname === 'www.youtube.com') {
    if (url.pathname === '/watch') {
      const ids = url.searchParams.getAll('v');
      if (ids.length === 1) id = ids[0] ?? null;
    } else {
      const match = /^\/shorts\/([^/]+)\/?$/.exec(url.pathname);
      id = match?.[1] ?? null;
    }
  } else if (url.hostname === 'youtu.be') {
    const match = /^\/([^/]+)\/?$/.exec(url.pathname);
    id = match?.[1] ?? null;
  }
  if (!id || !VIDEO_ID.test(id)) throw new Error('Enter a single YouTube video URL.');
  return `https://www.youtube.com/watch?v=${id}`;
}

export function validateTrim(startMs: unknown, endMs: unknown, durationMs: number): { startMs: number; endMs: number } {
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs)) throw new Error('Trim points must be whole milliseconds.');
  const start = startMs as number;
  const end = endMs as number;
  if (start < 0 || end > durationMs || end - start < MIN_CLIP_DURATION_MS || end - start > MAX_CLIP_DURATION_MS) {
    throw new Error('Choose a range from 100 ms to 60 seconds within the source.');
  }
  return { startMs: start, endMs: end };
}

export function publicSession(row: any): EditorSessionResponse {
  const id = row.id as string;
  return {
    id,
    sourceUrl: row.source_url,
    title: row.title,
    durationMs: row.duration_ms,
    state: row.state,
    previewPath: row.preview_path ? `/editor/sessions/${id}/preview` : null,
    clipPath: row.state === 'rendered' && row.clip_path ? `/editor/sessions/${id}/clip` : null,
    peaks: JSON.parse(row.peaks_json || '[]') as number[],
    expiresAt: row.expires_at,
    error: row.error,
    trimStartMs: row.trim_start_ms,
    trimEndMs: row.trim_end_ms,
  };
}
