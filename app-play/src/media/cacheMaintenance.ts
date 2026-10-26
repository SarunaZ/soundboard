import { Directory, File, Paths } from 'expo-file-system';

const CACHE_DIRECTORY = new Directory(Paths.cache);
const BACKUP_STAGING_DIRECTORY = new Directory(Paths.cache, 'play-backup-staging');
const ARTWORK_DRAFT_DIRECTORY = new Directory(Paths.cache, 'play-gallery-artwork');
const MAX_CACHE_ENTRIES = 2_048;
let startupCleanupComplete = false;

function boundedEntries(directory: Directory): Array<File | Directory> | null {
  try {
    if (!directory.exists) return [];
    const entries = directory.list();
    return entries.length <= MAX_CACHE_ENTRIES ? entries : null;
  } catch {
    return null;
  }
}

function cleanupBackupArchives(): void {
  const entries = boundedEntries(CACHE_DIRECTORY);
  if (!entries) return;
  for (const entry of entries) {
    if (!(entry instanceof File) || !/^Stimmyz-Play-backup-[0-9a-f]+-[0-9a-f]+\.zip$/i.test(entry.name)) continue;
    if (new File(CACHE_DIRECTORY, entry.name).uri !== entry.uri) continue;
    try { if (entry.exists) entry.delete(); } catch { /* cache cleanup is best effort */ }
  }
}

function cleanupStaleEditorDirectories(): void {
  const entries = boundedEntries(CACHE_DIRECTORY);
  if (!entries) return;
  for (const entry of entries) {
    if (!(entry instanceof Directory) || !/^soundboard-editor-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.name)) continue;
    if (new Directory(CACHE_DIRECTORY, entry.name).uri !== entry.uri) continue;
    try { if (entry.exists) entry.delete(); } catch { /* cache cleanup is best effort */ }
  }
}

function cleanupBackupStagingDirectories(): void {
  const entries = boundedEntries(BACKUP_STAGING_DIRECTORY);
  if (!entries) return;
  for (const entry of entries) {
    if (!(entry instanceof Directory) || !/^import-[a-z0-9]+-[a-z0-9]+$/i.test(entry.name)) continue;
    if (new Directory(BACKUP_STAGING_DIRECTORY, entry.name).uri !== entry.uri) continue;
    try { if (entry.exists) entry.delete(); } catch { /* cache cleanup is best effort */ }
  }
}

function cleanupArtworkDrafts(): void {
  const entries = boundedEntries(ARTWORK_DRAFT_DIRECTORY);
  if (!entries) return;
  for (const entry of entries) {
    if (!(entry instanceof File) || !/^draft-[a-z0-9]+-[a-z0-9]+\.jpg$/i.test(entry.name)) continue;
    if (new File(ARTWORK_DRAFT_DIRECTORY, entry.name).uri !== entry.uri) continue;
    try { if (entry.exists) entry.delete(); } catch { /* cache cleanup is best effort */ }
  }
}

/** Remove only abandoned Play backup and artwork cache entries, once before startup work begins. */
export function cleanupStalePlayCache(): void {
  if (startupCleanupComplete) return;
  startupCleanupComplete = true;
  cleanupBackupArchives();
  cleanupStaleEditorDirectories();
  cleanupBackupStagingDirectories();
  cleanupArtworkDrafts();
}
