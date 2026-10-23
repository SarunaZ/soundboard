import { File } from 'expo-file-system';

import { PLAY_LIBRARY_DIRECTORY, emptyOrRecoveredSnapshot, writeSnapshot } from './snapshot.ts';
export type PlayAppearance = 'Peach' | 'Mint' | 'Snow' | 'Ice' | 'Vanilla' | 'Coffee';
const themeNames: PlayAppearance[] = ['Peach', 'Mint', 'Snow', 'Ice', 'Vanilla', 'Coffee'];
export type QuickAction = 'device-audio' | 'file' | 'library' | 'record';

export interface PlayPreferences {
  version: 4;
  appearance: PlayAppearance;
  quickAction: QuickAction;
  masterVolume: number;
}

const PREFERENCES_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'preferences.json');
const BACKUP_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'preferences.backup.json');
function nextPreferencesFile(): File {
  return new File(PLAY_LIBRARY_DIRECTORY, 'preferences.next.json');
}

export function defaultPlayPreferences(deviceAudioSupported = false): PlayPreferences {
  return { version: 4, appearance: 'Vanilla', quickAction: deviceAudioSupported ? 'device-audio' : 'file', masterVolume: 1 };
}

export function parsePlayPreferences(value: unknown): PlayPreferences {
  if (!value || typeof value !== 'object') throw new Error('Play preferences are unreadable.');
  const row = value as Record<string, unknown>;
  const validQuickAction = ['file', 'library', 'record', 'device-audio'].includes(String(row.quickAction));
  if (!validQuickAction) throw new Error('Play preferences have an unsupported format.');
  if (row.version === 1) {
    if (!['system', 'dark', 'light'].includes(String(row.appearance))) throw new Error('Play preferences have an unsupported format.');
    return { version: 4, appearance: row.appearance === 'dark' ? 'Coffee' : 'Vanilla', quickAction: row.quickAction as QuickAction, masterVolume: 1 };
  }
  if (![2, 3, 4].includes(Number(row.version)) || !themeNames.includes(row.appearance as PlayAppearance)) throw new Error('Play preferences have an unsupported format.');
  const masterVolume = row.masterVolume === undefined ? 1 : row.masterVolume;
  if (typeof masterVolume !== 'number' || !Number.isFinite(masterVolume) || masterVolume < 0 || masterVolume > 1) throw new Error('Play preferences have an invalid master volume.');
  return { version: 4, appearance: row.appearance as PlayAppearance, quickAction: row.quickAction as QuickAction, masterVolume };
}

export function loadPlayPreferences(deviceAudioSupported = false): PlayPreferences {
  if (!PREFERENCES_FILE.exists && !BACKUP_FILE.exists) {
    const initialized = defaultPlayPreferences(deviceAudioSupported);
    return writeSnapshot(initialized, parsePlayPreferences, PREFERENCES_FILE, BACKUP_FILE, nextPreferencesFile());
  }
  const result = emptyOrRecoveredSnapshot(PREFERENCES_FILE, BACKUP_FILE, () => defaultPlayPreferences(deviceAudioSupported), parsePlayPreferences);
  if (PREFERENCES_FILE.exists) {
    try {
      const raw = JSON.parse(PREFERENCES_FILE.textSync()) as Record<string, unknown>;
      if (raw.version === 1 || raw.version === 2 || raw.version === 3) writeSnapshot(result, parsePlayPreferences, PREFERENCES_FILE, BACKUP_FILE, nextPreferencesFile());
    } catch {
      // The snapshot reader already recovered from a valid backup or surfaced its error.
    }
  }
  return result;
}

export function savePlayPreferences(preferences: Partial<Pick<PlayPreferences, 'appearance' | 'quickAction' | 'masterVolume'>>, deviceAudioSupported = false): PlayPreferences {
  const current = loadPlayPreferences(deviceAudioSupported);
  const next = parsePlayPreferences({ ...current, ...preferences });
  return writeSnapshot(next, parsePlayPreferences, PREFERENCES_FILE, BACKUP_FILE, nextPreferencesFile());
}
