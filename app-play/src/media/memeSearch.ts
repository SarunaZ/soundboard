export interface MemeImage {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  pageUrl: string;
}

const IMGFLIP_MEMES_URL = 'https://api.imgflip.com/get_memes';
const IMGFLIP_IMAGE_HOST = 'i.imgflip.com';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_MEMES = 200;
const MAX_IMAGE_DIMENSION = 20_000;
const MAX_IMAGE_PIXELS = 100_000_000;
const MAX_NAME_LENGTH = 120;

function abortError(): Error {
  const error = new Error('Loading meme templates was cancelled.');
  error.name = 'AbortError';
  return error;
}

function validId(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const id = String(value);
  if (!/^\d{1,30}$/.test(id)) return null;
  return id;
}

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH).trim();
  return name || null;
}

function validImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== IMGFLIP_IMAGE_HOST || url.username || url.password) return null;
    if (!/\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function validDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_IMAGE_DIMENSION;
}

function parseMeme(value: unknown): MemeImage | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = validId(record.id);
  const name = cleanName(record.name);
  const url = validImageUrl(record.url);
  const width = record.width;
  const height = record.height;
  if (!id || !name || !url || !validDimension(width) || !validDimension(height) || width * height > MAX_IMAGE_PIXELS) return null;
  return { id, name, url, width, height, pageUrl: `https://imgflip.com/memetemplate/${id}` };
}

/** Load Imgflip's free popular-template list. Full text search is a paid API feature. */
export async function loadPopularMemes(signal?: AbortSignal): Promise<MemeImage[]> {
  if (signal?.aborted) throw abortError();

  const controller = new AbortController();
  let timedOut = false;
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      const error = new Error('Imgflip took too long to respond. Check your connection and try again.');
      error.name = 'TimeoutError';
      reject(error);
    }, REQUEST_TIMEOUT_MS);
  });

  try {
    const request = fetch(IMGFLIP_MEMES_URL, { method: 'GET', signal: controller.signal });
    let response: Response;
    try {
      response = await Promise.race([request, timeoutPromise]);
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (timedOut) throw error;
      throw new Error('Could not load meme templates. Check your internet connection and try again.');
    }

    if (response.status === 429) throw new Error('Imgflip is rate limiting requests. Please wait a moment and try again.');
    if (!response.ok) throw new Error(`Imgflip could not load meme templates (HTTP ${response.status}). Try again later.`);

    let payload: unknown;
    try {
      payload = await Promise.race([response.json(), timeoutPromise]);
    } catch {
      if (signal?.aborted) throw abortError();
      if (timedOut) {
        const error = new Error('Imgflip took too long to respond. Check your connection and try again.');
        error.name = 'TimeoutError';
        throw error;
      }
      throw new Error('Imgflip returned an unreadable response. Please try again later.');
    }

    if (!payload || typeof payload !== 'object') throw new Error('Imgflip returned an invalid meme list. Please try again later.');
    const envelope = payload as Record<string, unknown>;
    const data = envelope.data;
    if (envelope.success !== true || !data || typeof data !== 'object' || !Array.isArray((data as Record<string, unknown>).memes)) {
      throw new Error('Imgflip returned an invalid meme list. Please try again later.');
    }
    const memes = (data as { memes: unknown[] }).memes;
    if (memes.length > MAX_MEMES) throw new Error('Imgflip returned too many meme templates. Please try again later.');
    return memes.map(parseMeme).filter((meme): meme is MemeImage => meme !== null);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

/** Filter the already loaded popular list by template name, preserving provider order. */
export function filterMemes(items: MemeImage[], query: string): MemeImage[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return items;
  return items.filter((item) => item.name.toLowerCase().includes(normalizedQuery));
}
