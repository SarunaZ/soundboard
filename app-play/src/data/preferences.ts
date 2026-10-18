import { File } from 'expo-file-system';

import { PLAY_LIBRARY_DIRECTORY, emptyOrRecoveredSnapshot, writeSnapshot } from './snapshot.ts';

export type PlayAppearance = 'system' | 'dark' | 'light';
export type QuickAction = 'file' | 'library';

export interface PlayPreferences {
  version: 1;
  appearance: PlayAppearance;
  quickAction: QuickAction;
}

const PREFERENCES_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'preferences.json');
const BACKUP_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'preferences.backup.json');
function nextPreferencesFile(): File {
  return new File(PLAY_LIBRARY_DIRECTORY, 'preferences.next.json');
}

export function defaultPlayPreferences(): PlayPreferences {
  return { version: 1, appearance: 'system', quickAction: 'file' };
}

export function parsePlayPreferences(value: unknown): PlayPreferences {
  if (!value || typeof value !== 'object') throw new Error('Play preferences are unreadable.');
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || !['system', 'dark', 'light'].includes(String(row.appearance)) || !['file', 'library'].includes(String(row.quickAction))) {
    throw new Error('Play preferences have an unsupported format.');
  }
  return { version: 1, appearance: row.appearance as PlayAppearance, quickAction: row.quickAction as QuickAction };
}

export function loadPlayPreferences(): PlayPreferences {
  return emptyOrRecoveredSnapshot(PREFERENCES_FILE, BACKUP_FILE, defaultPlayPreferences, parsePlayPreferences);
}

export function savePlayPreferences(preferences: Pick<PlayPreferences, 'appearance' | 'quickAction'>): PlayPreferences {
  const current = loadPlayPreferences();
  const next = parsePlayPreferences({ ...current, ...preferences });
  return writeSnapshot(next, parsePlayPreferences, PREFERENCES_FILE, BACKUP_FILE, nextPreferencesFile());
}
