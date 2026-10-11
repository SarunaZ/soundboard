import { MAX_SOUNDBITES } from '../limits.ts';

const MAX_CLIP_MS = 60_000;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export interface SavedClip {
  id: string;
  title: string;
  durationMs: number;
  createdAt: string;
  /** Legacy catalog entries omit this and are interpreted as AAC in an M4A container. */
  extension?: AudioExtension;
}

export type AudioExtension = 'mp3' | 'm4a' | 'wav' | 'aac';

const AUDIO_EXTENSIONS = new Set<AudioExtension>(['mp3', 'm4a', 'wav', 'aac']);

export interface ClipCatalog {
  version: 1;
  clips: SavedClip[];
}

export function parseClipCatalog(value: unknown): ClipCatalog {
  if (!value || typeof value !== 'object') throw new Error('The on-device clip catalog is unreadable.');
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || !Array.isArray(row.clips)) throw new Error('The on-device clip catalog has an unsupported format.');
  const clips = row.clips.map((entry, index): SavedClip => {
    if (!entry || typeof entry !== 'object') throw new Error(`The on-device clip catalog entry ${index + 1} is invalid.`);
    const clip = entry as Record<string, unknown>;
    if (!isUuid(clip.id) || typeof clip.title !== 'string' || !clip.title.trim() || clip.title.length > 100 ||
        typeof clip.durationMs !== 'number' || !Number.isInteger(clip.durationMs) || clip.durationMs <= 0 || clip.durationMs > MAX_CLIP_MS ||
        typeof clip.createdAt !== 'string' || !Number.isFinite(Date.parse(clip.createdAt)) ||
        (clip.extension !== undefined && (typeof clip.extension !== 'string' || !AUDIO_EXTENSIONS.has(clip.extension as AudioExtension)))) {
      throw new Error(`The on-device clip catalog entry ${index + 1} is invalid.`);
    }
    return {
      id: clip.id,
      title: clip.title,
      durationMs: clip.durationMs,
      createdAt: clip.createdAt,
      extension: (clip.extension as AudioExtension | undefined) ?? 'm4a',
    };
  });
  if (new Set(clips.map((clip) => clip.id)).size !== clips.length) throw new Error('The on-device clip catalog has duplicate IDs.');
  return { version: 1, clips };
}

export function appendClip(catalog: ClipCatalog, clip: SavedClip): ClipCatalog {
  const validated = parseClipCatalog(catalog);
  if (validated.clips.length >= MAX_SOUNDBITES) {
    throw new Error(`The library is full. It can hold up to ${MAX_SOUNDBITES} soundbites.`);
  }
  return parseClipCatalog({ version: 1, clips: [clip, ...validated.clips] });
}

export function normalizeClipTitle(title: string): string {
  const normalized = title.trim();
  if (!normalized) throw new Error('Give this clip a name before saving.');
  if (normalized.length > 100) throw new Error('Clip names must be 100 characters or fewer.');
  return normalized;
}

export function renameClip(catalog: ClipCatalog, id: string, title: string): ClipCatalog {
  if (!isUuid(id)) throw new Error('Invalid local clip ID.');
  const validated = parseClipCatalog(catalog);
  if (!validated.clips.some((clip) => clip.id === id)) throw new Error('The selected library clip no longer exists.');
  const normalized = normalizeClipTitle(title);
  return {
    version: 1,
    clips: validated.clips.map((clip) => clip.id === id ? { ...clip, title: normalized } : clip),
  };
}

export function removeClip(catalog: ClipCatalog, id: string): ClipCatalog {
  if (!isUuid(id)) throw new Error('Invalid local clip ID.');
  return { version: 1, clips: catalog.clips.filter((clip) => clip.id !== id) };
}

export function generatedClipId(random: () => number = Math.random): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const r = Math.floor(random() * 16);
    return (char === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
