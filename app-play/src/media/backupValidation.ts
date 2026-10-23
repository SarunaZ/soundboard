import { parseBoardCollection, type BoardCollection } from '../data/boardModel.ts';
import { parseClipPlaybackPreferences, type ClipPlaybackPreferences } from '../data/clipPlayback.ts';
import { parseClipCatalog, type SavedClip } from '../data/catalog.ts';
import { parsePresentations, type ClipPresentation } from '../data/presentation.ts';
import { parsePlayPreferences, type PlayPreferences } from '../data/preferences.ts';
import { isUuid } from '../data/protocol.ts';
import { mergePlayBackup } from './backupMerge.ts';
export { mergePlayBackup } from './backupMerge.ts';

export const PLAY_BACKUP_FORMAT = 'stimmyz-play-backup';
export const PLAY_BACKUP_VERSION = 1;
export const MAX_BACKUP_FILES = 2_001;
export const MAX_BACKUP_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_BACKUP_ARTWORK_BYTES = 1024 * 1024;
export const MAX_BACKUP_BYTES = 512 * 1024 * 1024;
export const MAX_BACKUP_MANIFEST_BYTES = 8 * 1024 * 1024;
export type BackupExtension = 'mp3' | 'm4a' | 'wav' | 'aac';
export interface BackupFileEntry { name: string; sizeBytes: number; crc32: number; kind: 'audio' | 'artwork' }
export interface PlayBackupManifest {
  format: typeof PLAY_BACKUP_FORMAT;
  version: typeof PLAY_BACKUP_VERSION;
  clips: SavedClip[];
  boards: BoardCollection;
  presentations: Record<string, ClipPresentation>;
  playback: ClipPlaybackPreferences;
  preferences: PlayPreferences;
  files: BackupFileEntry[];
}

const extensions = new Set<BackupExtension>(['mp3', 'm4a', 'wav', 'aac']);

export function parsePlayBackupManifest(value: unknown): PlayBackupManifest {
  if (!value || typeof value !== 'object') throw new Error('The selected folder does not contain a valid Play backup.');
  const raw = value as Record<string, unknown>;
  if (raw.format !== PLAY_BACKUP_FORMAT || raw.version !== PLAY_BACKUP_VERSION || !Array.isArray(raw.clips) || !Array.isArray(raw.files)) {
    throw new Error('The selected folder does not contain a supported Play backup.');
  }
  if (raw.clips.length > 1_000 || raw.files.length > MAX_BACKUP_FILES) throw new Error('This backup contains too many files.');
  const clips = parseClipCatalog({ version: 1, clips: raw.clips }).clips;
  const boards = parseBoardCollection(raw.boards);
  const presentations = parsePresentations({ version: 1, clips: raw.presentations ?? {} }).clips;
  const playback = parseClipPlaybackPreferences({ version: 1, clips: raw.playback ?? {} });
  const preferences = parsePlayPreferences(raw.preferences);
  const clipIds = new Set(clips.map(({ id }) => id));
  for (const id of [...Object.keys(presentations), ...Object.keys(playback)]) {
    if (!clipIds.has(id)) throw new Error(`The Play backup contains settings for missing clip ${id}.`);
  }
  for (const board of boards.boards) {
    if (board.pads.some((pad) => pad.clipId !== null && !clipIds.has(pad.clipId))) throw new Error(`Board “${board.name}” references a clip missing from the backup.`);
  }
  const files: BackupFileEntry[] = [];
  const names = new Set<string>();
  let total = 0;
  for (const [index, candidate] of raw.files.entries()) {
    if (!candidate || typeof candidate !== 'object') throw new Error(`Backup file ${index + 1} is invalid.`);
    const item = candidate as Record<string, unknown>;
    if (typeof item.name !== 'string' || !/^[0-9a-f-]{36}\.(?:mp3|m4a|wav|aac|jpg)$/i.test(item.name) ||
        !isUuid(item.name.slice(0, 36))) throw new Error(`Backup file ${index + 1} has an unsafe name.`);
    if (names.has(item.name)) throw new Error('The backup contains duplicate filenames.');
    names.add(item.name);
    const kind = item.name.endsWith('.jpg') ? 'artwork' : 'audio';
    const maxSize = kind === 'artwork' ? MAX_BACKUP_ARTWORK_BYTES : MAX_BACKUP_FILE_BYTES;
    if (item.kind !== kind || typeof item.sizeBytes !== 'number' || !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes < 1 || item.sizeBytes > maxSize ||
        typeof item.crc32 !== 'number' || !Number.isInteger(item.crc32) || item.crc32 < 0 || item.crc32 > 0xffffffff) {
      throw new Error(`Backup file ${index + 1} has invalid metadata.`);
    }
    if (kind === 'audio') {
      const [id, ext] = item.name.split('.') as [string, string];
      const clip = clips.find((entry) => entry.id === id);
      if (!extensions.has(ext as BackupExtension) || !clip || (clip.extension ?? 'm4a') !== ext) throw new Error(`Backup audio ${item.name} does not match the clip catalog.`);
    } else if (!Object.values(presentations).some((entry) => entry.artwork?.fileName === item.name)) {
      throw new Error(`Backup artwork ${item.name} is not referenced by a clip.`);
    }
    total += item.sizeBytes;
    if (total > MAX_BACKUP_BYTES) throw new Error('This backup is larger than 512 MiB.');
    files.push({ name: item.name, sizeBytes: item.sizeBytes, crc32: item.crc32, kind });
  }
  if (clips.some((clip) => !files.some((file) => file.kind === 'audio' && file.name === `${clip.id}.${clip.extension ?? 'm4a'}`))) {
    throw new Error('The backup is missing one or more clip files.');
  }
  for (const [id, presentation] of Object.entries(presentations)) {
    if (presentation.artwork && !files.some((file) => file.name === presentation.artwork!.fileName)) throw new Error(`The backup is missing artwork for clip ${id}.`);
  }
  return { format: PLAY_BACKUP_FORMAT, version: PLAY_BACKUP_VERSION, clips, boards, presentations, playback, preferences, files };
}

