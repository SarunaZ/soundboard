import { File } from 'expo-file-system';

import { emptyOrRecoveredSnapshot, PLAY_LIBRARY_DIRECTORY, registerSnapshotParser, writeSnapshot } from './snapshot.ts';
import { isUuid } from './protocol.ts';

export type ClipRepeat = 'once' | 'loop' | 'three';
export interface ClipPlaybackPreference { gain: number; repeat: ClipRepeat }
export type ClipPlaybackPreferences = Record<string, ClipPlaybackPreference>;
interface ClipPlaybackSnapshot { version: 1; clips: ClipPlaybackPreferences }

const PREFERENCES_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'clip-playback.json');
const BACKUP_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'clip-playback.backup.json');
registerSnapshotParser('clip-playback.json', parseSnapshot);
const nextFile = () => new File(PLAY_LIBRARY_DIRECTORY, 'clip-playback.next.json');
const DEFAULT_PREFERENCE: ClipPlaybackPreference = { gain: 1, repeat: 'once' };

export function parseClipPlaybackPreferences(value: unknown): ClipPlaybackPreferences {
  if (!value || typeof value !== 'object' || (value as Record<string, unknown>).version !== 1) throw new Error('Clip playback preferences have an unsupported format.');
  const raw = (value as Record<string, unknown>).clips;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Clip playback preferences are unreadable.');
  const parsed: ClipPlaybackPreferences = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isUuid(id) || !value || typeof value !== 'object') throw new Error('Clip playback preferences contain an invalid clip.');
    const item = value as Record<string, unknown>;
    if (typeof item.gain !== 'number' || !Number.isFinite(item.gain) || item.gain < 0 || item.gain > 2 ||
        !['once', 'loop', 'three'].includes(String(item.repeat))) throw new Error('Clip playback preferences contain an invalid value.');
    parsed[id] = { gain: item.gain, repeat: item.repeat as ClipRepeat };
  }
  return parsed;
}

function readSnapshot(): ClipPlaybackSnapshot {
  const clips = emptyOrRecoveredSnapshot(PREFERENCES_FILE, BACKUP_FILE, () => ({}), (value) => parseClipPlaybackPreferences(value), nextFile());
  return { version: 1, clips };
}

export function loadClipPlaybackPreferences(): ClipPlaybackPreferences { return readSnapshot().clips; }

export function getClipPlaybackPreference(soundId: string): ClipPlaybackPreference {
  if (!isUuid(soundId)) throw new Error('Invalid local clip ID.');
  return loadClipPlaybackPreferences()[soundId] ?? { ...DEFAULT_PREFERENCE };
}

export function setClipPlaybackPreference(soundId: string, patch: Partial<ClipPlaybackPreference>): ClipPlaybackPreference {
  if (!isUuid(soundId)) throw new Error('Invalid local clip ID.');
  const clips = loadClipPlaybackPreferences();
  const preference = { ...(clips[soundId] ?? DEFAULT_PREFERENCE), ...patch };
  const validated = parseClipPlaybackPreferences({ version: 1, clips: { [soundId]: preference } })[soundId]!;
  writeSnapshot({ version: 1, clips: { ...clips, [soundId]: validated } }, parseSnapshot, PREFERENCES_FILE, BACKUP_FILE, nextFile());
  return validated;
}

export function removeClipPlaybackPreference(soundId: string): void {
  if (!isUuid(soundId)) throw new Error('Invalid local clip ID.');
  const clips = loadClipPlaybackPreferences();
  if (!(soundId in clips)) return;
  delete clips[soundId];
  writeSnapshot({ version: 1, clips }, parseSnapshot, PREFERENCES_FILE, BACKUP_FILE, nextFile());
}

function parseSnapshot(value: unknown): ClipPlaybackSnapshot {
  return { version: 1, clips: parseClipPlaybackPreferences(value) };
}
