import { File } from 'expo-file-system';

import { PLAY_LIBRARY_DIRECTORY, emptyOrRecoveredSnapshot, writeSnapshot } from './snapshot.ts';
export type PlayAppearance = 'Peach' | 'Mint' | 'Snow' | 'Ice' | 'Vanilla' | 'Coffee';
const themeNames: PlayAppearance[] = ['Peach', 'Mint', 'Snow', 'Ice', 'Vanilla', 'Coffee'];
export type QuickAction = 'file' | 'library' | 'record';

export interface PlayPreferences {
  version: 2;
  appearance: PlayAppearance;
  quickAction: QuickAction;
}

const PREFERENCES_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'preferences.json');
const BACKUP_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'preferences.backup.json');
function nextPreferencesFile(): File {
  return new File(PLAY_LIBRARY_DIRECTORY, 'preferences.next.json');
}

export function defaultPlayPreferences(): PlayPreferences {
  return { version: 2, appearance: 'Vanilla', quickAction: 'file' };
}

export function parsePlayPreferences(value: unknown): PlayPreferences {
  if (!value || typeof value !== 'object') throw new Error('Play preferences are unreadable.');
  const row = value as Record<string, unknown>;
  const validQuickAction = ['file', 'library', 'record'].includes(String(row.quickAction));
  if (!validQuickAction) throw new Error('Play preferences have an unsupported format.');
  if (row.version === 1) {
    if (!['system', 'dark', 'light'].includes(String(row.appearance))) throw new Error('Play preferences have an unsupported format.');
    return { version: 2, appearance: row.appearance === 'dark' ? 'Coffee' : 'Vanilla', quickAction: row.quickAction as QuickAction };
  }
  if (row.version !== 2 || !themeNames.includes(row.appearance as PlayAppearance)) throw new Error('Play preferences have an unsupported format.');
  return { version: 2, appearance: row.appearance as PlayAppearance, quickAction: row.quickAction as QuickAction };
}

export function loadPlayPreferences(): PlayPreferences {
  const result = emptyOrRecoveredSnapshot(PREFERENCES_FILE, BACKUP_FILE, defaultPlayPreferences, parsePlayPreferences);
  if (PREFERENCES_FILE.exists) {
    try {
      const raw = JSON.parse(PREFERENCES_FILE.textSync()) as Record<string, unknown>;
      if (raw.version === 1) writeSnapshot(result, parsePlayPreferences, PREFERENCES_FILE, BACKUP_FILE, nextPreferencesFile());
    } catch {
      // The snapshot reader already recovered from a valid backup or surfaced its error.
    }
  }
  return result;
}

export function savePlayPreferences(preferences: Pick<PlayPreferences, 'appearance' | 'quickAction'>): PlayPreferences {
  const current = loadPlayPreferences();
  const next = parsePlayPreferences({ ...current, ...preferences });
  return writeSnapshot(next, parsePlayPreferences, PREFERENCES_FILE, BACKUP_FILE, nextPreferencesFile());
}
