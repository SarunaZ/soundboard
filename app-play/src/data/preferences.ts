import { File } from 'expo-file-system';

import { PLAY_LIBRARY_DIRECTORY, emptyOrRecoveredSnapshot, recoverSnapshotTransaction, registerSnapshotParser, writeSnapshot } from './snapshot.ts';
export type PlayAppearance = 'Peach' | 'Mint' | 'Snow' | 'Ice' | 'Vanilla' | 'Chocolate' | 'Grape' | 'Nut' | 'Blackberry';
const themeNames: PlayAppearance[] = ['Peach', 'Mint', 'Snow', 'Ice', 'Vanilla', 'Chocolate', 'Grape', 'Nut', 'Blackberry'];
export type QuickAction = 'device-audio' | 'file' | 'library' | 'record';

export interface PlayPreferences {
  version: 5;
  appearance: PlayAppearance;
  quickAction: QuickAction;
  masterVolume: number;
  nextPadColorIndex: number;
}

const PREFERENCES_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'preferences.json');
const BACKUP_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'preferences.backup.json');
registerSnapshotParser('preferences.json', parsePlayPreferences);
function nextPreferencesFile(): File {
  return new File(PLAY_LIBRARY_DIRECTORY, 'preferences.next.json');
}

export function defaultPlayPreferences(deviceAudioSupported = false): PlayPreferences {
  return { version: 5, appearance: 'Vanilla', quickAction: deviceAudioSupported ? 'device-audio' : 'file', masterVolume: 1, nextPadColorIndex: 15 };
}

export function parsePlayPreferences(value: unknown): PlayPreferences {
  if (!value || typeof value !== 'object') throw new Error('Play preferences are unreadable.');
  const row = value as Record<string, unknown>;
  const validQuickAction = ['file', 'library', 'record', 'device-audio'].includes(String(row.quickAction));
  if (!validQuickAction) throw new Error('Play preferences have an unsupported format.');
  if (row.version === 1) {
    if (!['system', 'dark', 'light'].includes(String(row.appearance))) throw new Error('Play preferences have an unsupported format.');
    return { version: 5, appearance: row.appearance === 'dark' ? 'Chocolate' : 'Vanilla', quickAction: row.quickAction as QuickAction, masterVolume: 1, nextPadColorIndex: 15 };
  }
  if (![2, 3, 4, 5].includes(Number(row.version)) || !(themeNames.includes(row.appearance as PlayAppearance) || row.appearance === 'Coffee')) throw new Error('Play preferences have an unsupported format.');
  const masterVolume = row.masterVolume === undefined ? 1 : row.masterVolume;
  if (typeof masterVolume !== 'number' || !Number.isFinite(masterVolume) || masterVolume < 0 || masterVolume > 1) throw new Error('Play preferences have an invalid master volume.');
  const nextPadColorIndex = row.nextPadColorIndex === undefined ? 15 : row.nextPadColorIndex;
  if (typeof nextPadColorIndex !== 'number' || !Number.isSafeInteger(nextPadColorIndex) || nextPadColorIndex < 15 || nextPadColorIndex > 1_000_000) throw new Error('Play preferences have an invalid pad color cursor.');
  return { version: 5, appearance: row.appearance === 'Coffee' ? 'Chocolate' : row.appearance as PlayAppearance, quickAction: row.quickAction as QuickAction, masterVolume, nextPadColorIndex };
}

export function loadPlayPreferences(deviceAudioSupported = false): PlayPreferences {
  recoverSnapshotTransaction();
  if (!PREFERENCES_FILE.exists && !BACKUP_FILE.exists && !nextPreferencesFile().exists) {
    const initialized = defaultPlayPreferences(deviceAudioSupported);
    return writeSnapshot(initialized, parsePlayPreferences, PREFERENCES_FILE, BACKUP_FILE, nextPreferencesFile());
  }
  const result = emptyOrRecoveredSnapshot(PREFERENCES_FILE, BACKUP_FILE, () => defaultPlayPreferences(deviceAudioSupported), parsePlayPreferences, nextPreferencesFile());
  if (PREFERENCES_FILE.exists) {
    try {
      const raw = JSON.parse(PREFERENCES_FILE.textSync()) as Record<string, unknown>;
      if (raw.version !== 5 || raw.appearance === 'Coffee') writeSnapshot(result, parsePlayPreferences, PREFERENCES_FILE, BACKUP_FILE, nextPreferencesFile());
    } catch {
      // The snapshot reader already recovered from a valid backup or surfaced its error.
    }
  }
  return result;
}

/** Allocate a persistent monotonic identity for one newly created clip. */
export function allocateNextPadColorIndex(deviceAudioSupported = false): number {
  const current = loadPlayPreferences(deviceAudioSupported);
  const index = current.nextPadColorIndex;
  savePlayPreferences({ nextPadColorIndex: index + 1 }, deviceAudioSupported);
  return index;
}

export function savePlayPreferences(preferences: Partial<Pick<PlayPreferences, 'appearance' | 'quickAction' | 'masterVolume' | 'nextPadColorIndex'>>, deviceAudioSupported = false): PlayPreferences {
  const current = loadPlayPreferences(deviceAudioSupported);
  const next = parsePlayPreferences({ ...current, ...preferences });
  return writeSnapshot(next, parsePlayPreferences, PREFERENCES_FILE, BACKUP_FILE, nextPreferencesFile());
}
