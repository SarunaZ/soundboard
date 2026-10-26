import { File } from 'expo-file-system';

import { PLAY_LIBRARY_DIRECTORY, emptyOrRecoveredSnapshot, registerSnapshotParser, writeSnapshot } from './snapshot.ts';
import { isUuid } from './protocol.ts';

export interface ClipPresentation {
  icon?: string;
  color?: string;
  colorEnd?: string;
  colorIndex?: number;
  artwork?: ClipArtwork;
}

export interface ClipArtwork {
  fileName: string;
  source: 'imgflip' | 'gallery';
  sourceId?: string;
  sourceUrl?: string;
  title: string;
}

interface PresentationCatalog {
  version: 1;
  clips: Record<string, ClipPresentation>;
}

const PRESENTATION_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'presentation.json');
const BACKUP_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'presentation.backup.json');
registerSnapshotParser('presentation.json', parsePresentations);
function nextPresentationFile(): File {
  return new File(PLAY_LIBRARY_DIRECTORY, 'presentation.next.json');
}

function emptyPresentations(): PresentationCatalog {
  return { version: 1, clips: {} };
}

function parseArtwork(value: unknown): ClipArtwork {
  if (!value || typeof value !== 'object') throw new Error('The Play clip presentation data contains invalid artwork metadata.');
  const artwork = value as Record<string, unknown>;
  if (typeof artwork.fileName !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i.test(artwork.fileName) ||
      (artwork.source !== 'imgflip' && artwork.source !== 'gallery') ||
      typeof artwork.title !== 'string' || !artwork.title.trim() || artwork.title.length > 120) {
    throw new Error('The Play clip presentation data contains invalid artwork metadata.');
  }
  if (artwork.source === 'gallery') return { fileName: artwork.fileName, source: 'gallery', title: artwork.title };
  if (typeof artwork.sourceId !== 'string' || !/^\d{1,30}$/.test(artwork.sourceId) || typeof artwork.sourceUrl !== 'string' || artwork.sourceUrl.length > 2048) {
    throw new Error('The Play clip presentation data contains invalid artwork metadata.');
  }
  let url: URL;
  try { url = new URL(artwork.sourceUrl); } catch { throw new Error('The Play clip presentation data contains an invalid artwork URL.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'imgflip.com' || url.username || url.password || url.pathname !== `/memetemplate/${artwork.sourceId}` || url.search || url.hash) {
    throw new Error('The Play clip presentation data contains an invalid artwork URL.');
  }
  return { fileName: artwork.fileName, source: 'imgflip', sourceId: artwork.sourceId, sourceUrl: url.href, title: artwork.title };
}

export function parsePresentations(value: unknown): PresentationCatalog {
  if (!value || typeof value !== 'object') throw new Error('The Play clip presentation data is unreadable.');
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || !row.clips || typeof row.clips !== 'object' || Array.isArray(row.clips)) {
    throw new Error('The Play clip presentation data has an unsupported format.');
  }
  const clips: Record<string, ClipPresentation> = {};
  for (const [id, value] of Object.entries(row.clips as Record<string, unknown>)) {
    if (!isUuid(id) || !value || typeof value !== 'object') throw new Error('The Play clip presentation data contains an invalid entry.');
    const entry = value as Record<string, unknown>;
    if (entry.icon !== undefined && (typeof entry.icon !== 'string' || !/^[a-z0-9-]{1,40}$/i.test(entry.icon))) {
      throw new Error('The Play clip presentation data contains an invalid icon.');
    }
    if (entry.color !== undefined && (typeof entry.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(entry.color))) {
      throw new Error('The Play clip presentation data contains an invalid color.');
    }
    const artwork = entry.artwork === undefined ? undefined : parseArtwork(entry.artwork);
    if (entry.colorEnd !== undefined && (typeof entry.colorEnd !== 'string' || !/^#[0-9a-f]{6}$/i.test(entry.colorEnd))) throw new Error('The Play clip presentation data contains an invalid gradient color.');
    if (entry.colorIndex !== undefined && (typeof entry.colorIndex !== 'number' || !Number.isSafeInteger(entry.colorIndex) || entry.colorIndex < 0 || entry.colorIndex > 1_000_000)) throw new Error('The Play clip presentation data contains an invalid color identity.');
    if (entry.icon === undefined && entry.color === undefined && entry.colorEnd === undefined && entry.colorIndex === undefined && artwork === undefined) throw new Error('The Play clip presentation data contains an empty entry.');
    clips[id] = {
      ...(entry.icon === undefined ? {} : { icon: entry.icon as string }),
      ...(entry.color === undefined ? {} : { color: entry.color as string }),
      ...(entry.colorEnd === undefined ? {} : { colorEnd: entry.colorEnd as string }),
      ...(entry.colorIndex === undefined ? {} : { colorIndex: entry.colorIndex as number }),
      ...(artwork === undefined ? {} : { artwork }),
    };
  }
  return { version: 1, clips };
}

function readPresentations(): PresentationCatalog {
  return emptyOrRecoveredSnapshot(PRESENTATION_FILE, BACKUP_FILE, emptyPresentations, parsePresentations, nextPresentationFile());
}

function presentationRecoveryFiles(): File[] {
  return PRESENTATION_FILE.exists
    ? [PRESENTATION_FILE, BACKUP_FILE]
    : [BACKUP_FILE, nextPresentationFile()];
}

export function loadClipPresentations(): Record<string, ClipPresentation> {
  return readPresentations().clips;
}

export function setClipPresentation(id: string, presentation: ClipPresentation): void {
  if (!isUuid(id)) throw new Error('Invalid local clip ID.');
  const current = readPresentations();
  const clips = { ...current.clips };
  const icon = presentation.icon?.trim();
  const color = presentation.color?.trim();
  const colorEnd = presentation.colorEnd?.trim();
  const colorIndex = presentation.colorIndex;
  const artwork = presentation.artwork === undefined ? current.clips[id]?.artwork : parseArtwork(presentation.artwork);
  if (icon !== undefined && icon !== '' && !/^[a-z0-9-]{1,40}$/i.test(icon)) throw new Error('Choose a valid icon.');
  if (color !== undefined && color !== '' && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Choose a valid color.');
  if (colorEnd !== undefined && colorEnd !== '' && !/^#[0-9a-f]{6}$/i.test(colorEnd)) throw new Error('Choose a valid gradient color.');
  if (colorIndex !== undefined && (!Number.isSafeInteger(colorIndex) || colorIndex < 0 || colorIndex > 1_000_000)) throw new Error('Choose a valid color identity.');
  const next: ClipPresentation = {
    ...current.clips[id],
    ...(icon ? { icon } : {}),
    ...(color ? { color } : {}),
    ...(colorEnd ? { colorEnd } : {}),
    ...(colorIndex === undefined ? {} : { colorIndex }),
    ...(artwork ? { artwork } : {}),
  };
  if (Object.keys(next).length === 0) delete clips[id];
  else clips[id] = next;
  writeSnapshot({ version: 1, clips }, parsePresentations, PRESENTATION_FILE, BACKUP_FILE, nextPresentationFile());
}

export function setClipArtwork(id: string, artwork: ClipArtwork): void {
  if (!isUuid(id)) throw new Error('Invalid local clip ID.');
  const validated = parseArtwork(artwork);
  const current = readPresentations();
  writeSnapshot({ version: 1, clips: { ...current.clips, [id]: { ...current.clips[id], artwork: validated } } }, parsePresentations, PRESENTATION_FILE, BACKUP_FILE, nextPresentationFile());
}

/** Remove the artwork field while preserving the clip's icon and pad colors. */
export function clearClipArtwork(id: string): ClipArtwork | undefined {
  if (!isUuid(id)) throw new Error('Invalid local clip ID.');
  const current = readPresentations();
  const entry = current.clips[id];
  if (!entry?.artwork) return undefined;
  const { artwork, ...remaining } = entry;
  const clips = { ...current.clips };
  if (Object.keys(remaining).length === 0) delete clips[id];
  else clips[id] = remaining;
  writeSnapshot({ version: 1, clips }, parsePresentations, PRESENTATION_FILE, BACKUP_FILE, nextPresentationFile());
  return artwork;
}

/** Recovery snapshots can still point at a file, so artwork is retained while either copy references it. */
export function presentationReferencesArtwork(fileName: string): boolean {
  for (const file of presentationRecoveryFiles()) {
    if (!file.exists) continue;
    try {
      const catalog = parsePresentations(JSON.parse(file.textSync()) as unknown);
      if (Object.values(catalog.clips).some((entry) => entry.artwork?.fileName === fileName)) return true;
    } catch {
      // A damaged recovery copy may contain an unreadable reference; retain the file conservatively.
      return true;
    }
  }
  return false;
}

/** Read committed and first-write recovery snapshots once for a cleanup pass. */
export function createArtworkReferenceChecker(): (fileName: string) => boolean {
  const referenced = new Set<string>();
  let retainAll = false;
  for (const file of presentationRecoveryFiles()) {
    if (!file.exists) continue;
    try {
      const catalog = parsePresentations(JSON.parse(file.textSync()) as unknown);
      for (const entry of Object.values(catalog.clips)) {
        if (entry.artwork) referenced.add(entry.artwork.fileName);
      }
    } catch {
      // A damaged snapshot may contain a reference that cannot be inspected.
      retainAll = true;
    }
  }
  return (fileName) => retainAll || referenced.has(fileName);
}

export function removeClipPresentation(id: string): void {
  if (!isUuid(id)) throw new Error('Invalid local clip ID.');
  const current = readPresentations();
  if (!(id in current.clips)) return;
  const clips = { ...current.clips };
  delete clips[id];
  writeSnapshot({ version: 1, clips }, parsePresentations, PRESENTATION_FILE, BACKUP_FILE, nextPresentationFile());
}
