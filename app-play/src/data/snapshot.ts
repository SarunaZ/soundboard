import { Directory, File, Paths } from 'expo-file-system';

export const PLAY_LIBRARY_DIRECTORY = new Directory(Paths.document, 'play-library');
const TRANSACTION_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'snapshot-transaction.json');
const SNAPSHOT_NAMES = ['boards.json', 'catalog.json', 'preferences.json', 'presentation.json', 'clip-playback.json'] as const;
const MAX_TRANSACTION_BYTES = 16 * 1024 * 1024;
const MAX_TRANSACTION_DELETES = 2_000;
const snapshotParsers = new Map<string, (value: unknown) => unknown>();

export function registerSnapshotParser<T>(name: typeof SNAPSHOT_NAMES[number], parse: (value: unknown) => T): void {
  snapshotParsers.set(name, parse);
}

export interface SnapshotTransactionChange<T = unknown> {
  name: typeof SNAPSHOT_NAMES[number];
  value: unknown;
  parse: (value: unknown) => T;
}

function checksum(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function snapshotFiles(name: string): [File, File, File] {
  if (!(SNAPSHOT_NAMES as readonly string[]).includes(name)) throw new Error('The pending snapshot transaction has an unsupported file.');
  const stem = name.slice(0, -'.json'.length);
  return [new File(PLAY_LIBRARY_DIRECTORY, name), new File(PLAY_LIBRARY_DIRECTORY, `${stem}.backup.json`), new File(PLAY_LIBRARY_DIRECTORY, `${stem}.next.json`)];
}

/** Replay an already validated transaction before any metadata snapshot is read. */
export function recoverSnapshotTransaction(): void {
  if (!TRANSACTION_FILE.exists) return;
  if ((TRANSACTION_FILE.size ?? 0) > MAX_TRANSACTION_BYTES) throw new Error('A pending Play data update is too large. Existing data was preserved.');
  let rows: unknown;
  try { rows = JSON.parse(TRANSACTION_FILE.textSync()); }
  catch (error) { throw new Error('A pending Play data update is damaged. Existing data was preserved.', { cause: error }); }
  if (!rows || typeof rows !== 'object' || (rows as Record<string, unknown>).version !== 1 || !Array.isArray((rows as Record<string, unknown>).entries)) {
    throw new Error('A pending Play data update is damaged. Existing data was preserved.');
  }
  const entries: Array<{ name: string; value: unknown }> = [];
  const deleteAfterCommit: string[] = [];
  const names = new Set<string>();
  try {
    for (const item of (rows as { entries: unknown[] }).entries) {
      if (!item || typeof item !== 'object') throw new Error('Invalid transaction row.');
      const row = item as Record<string, unknown>;
      if (typeof row.name !== 'string' || names.has(row.name) || typeof row.payload !== 'string' || typeof row.checksum !== 'string' || checksum(row.payload) !== row.checksum) throw new Error('Invalid transaction payload.');
      snapshotFiles(row.name);
      names.add(row.name);
      entries.push({ name: row.name, value: JSON.parse(row.payload) as unknown });
    }
    const requestedDeletes = (rows as Record<string, unknown>).deleteAfterCommit ?? [];
    if (!Array.isArray(requestedDeletes)) throw new Error('Invalid delete list.');
    for (const name of requestedDeletes) {
      if (typeof name !== 'string' || !/^(?:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:mp3|m4a|wav|aac)|artwork\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg)$/i.test(name)) throw new Error('Invalid delete path.');
      deleteAfterCommit.push(name);
    }
  } catch (error) {
    throw new Error('A pending Play data update is damaged. Existing data was preserved.', { cause: error });
  }
  // Validate the entire journal before changing any snapshot. The checksum
  // catches partial writes; the registered store parsers reject malformed
  // metadata before any current snapshot is replaced.
  const validatedEntries = entries.map(({ name, value }) => {
    const parse = snapshotParsers.get(name);
    if (!parse) throw new Error('A pending Play data update cannot be validated yet. Existing data was preserved.');
    try { return { name, value: parse(value) }; }
    catch (error) { throw new Error('A pending Play data update is invalid. Existing data was preserved.', { cause: error }); }
  });
  validateTransactionDeletes(deleteAfterCommit, validatedEntries);
  for (const { name, value } of validatedEntries) {
    const [primary, backup, next] = snapshotFiles(name);
    writeSnapshot(value, snapshotParsers.get(name)!, primary, backup, next);
  }
  // Once every primary has the new state, align recovery copies before any
  // media deletion so fallback metadata cannot refer to removed files.
  for (const { name } of validatedEntries) {
    const [primary, backup] = snapshotFiles(name);
    if (primary.exists) primary.copySync(backup, { overwrite: true });
  }
  for (const name of deleteAfterCommit) {
    const file = name.startsWith('artwork/')
      ? new File(new Directory(PLAY_LIBRARY_DIRECTORY, 'artwork'), name.slice('artwork/'.length))
      : new File(PLAY_LIBRARY_DIRECTORY, name);
    if (file.exists) file.delete();
  }
  TRANSACTION_FILE.delete();
}

export function hasPendingSnapshotTransaction(): boolean { return TRANSACTION_FILE.exists; }

/** Persist multiple metadata files as one roll-forward transaction. */
export function writeSnapshotTransaction(changes: SnapshotTransactionChange[], deleteAfterCommit: string[] = []): void {
  recoverSnapshotTransaction();
  if (!changes.length) return;
  const names = new Set<string>();
  if (changes.length > SNAPSHOT_NAMES.length || deleteAfterCommit.length > MAX_TRANSACTION_DELETES) throw new Error('The Play data update exceeds its safety limit.');
  const entries = changes.map(({ name, value, parse }) => {
    if (names.has(name)) throw new Error('A snapshot transaction contains duplicate files.');
    names.add(name);
    const validated = parse(value);
    const payload = JSON.stringify(validated);
    return { name, payload, checksum: checksum(payload) };
  });
  validateTransactionDeletes(deleteAfterCommit, entries.map(({ name, payload }) => ({ name, value: JSON.parse(payload) as unknown })));
  const journal = JSON.stringify({ version: 1, entries, deleteAfterCommit });
  if (new TextEncoder().encode(journal).length > MAX_TRANSACTION_BYTES) throw new Error('The Play data update exceeds its safety limit.');
  PLAY_LIBRARY_DIRECTORY.create({ intermediates: true, idempotent: true });
  // Expo move operations mutate the source File's URI. Keep this handle local
  // so a later transaction still stages at snapshot-transaction.next.json.
  const staged = new File(PLAY_LIBRARY_DIRECTORY, 'snapshot-transaction.next.json');
  staged.create({ overwrite: true });
  staged.write(journal);
  staged.moveSync(TRANSACTION_FILE, { overwrite: true });
  recoverSnapshotTransaction();
}

function validateTransactionDeletes(deletes: string[], entries: Array<{ name: string; value: unknown }>): void {
  if (deletes.length > MAX_TRANSACTION_DELETES || new Set(deletes).size !== deletes.length) throw new Error('The pending Play data update has an invalid delete list.');
  const byName = new Map(entries.map(({ name, value }) => [name, value]));
  for (const name of deletes) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:mp3|m4a|wav|aac)$/i.test(name)) {
      const catalog = byName.get('catalog.json') as { clips?: Array<{ id?: string; extension?: string }> } | undefined;
      if (!catalog || catalog.clips?.some((clip) => `${clip.id}.${clip.extension ?? 'm4a'}`.toLowerCase() === name.toLowerCase())) throw new Error('The pending Play data update still references media selected for deletion.');
    } else if (/^artwork\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i.test(name)) {
      const presentations = byName.get('presentation.json') as { clips?: Record<string, { artwork?: { fileName?: string } }> } | undefined;
      const fileName = name.slice('artwork/'.length).toLowerCase();
      if (!presentations || Object.values(presentations.clips ?? {}).some((entry) => entry.artwork?.fileName?.toLowerCase() === fileName)) throw new Error('The pending Play data update still references artwork selected for deletion.');
    } else throw new Error('The pending Play data update has an invalid delete path.');
  }
}

export function emptyOrRecoveredSnapshot<T>(
  primary: File,
  backup: File,
  empty: () => T,
  parse: (value: unknown) => T,
  pending?: File,
): T {
  recoverSnapshotTransaction();
  if (primary.exists) {
    try {
      return parse(JSON.parse(primary.textSync()) as unknown);
    } catch (primaryError) {
      if (backup.exists) {
        try {
          return parse(JSON.parse(backup.textSync()) as unknown);
        } catch {
          // Keep both damaged copies for recovery and report the primary failure.
        }
      }
      throw primaryError;
    }
  }
  if (backup.exists) return parse(JSON.parse(backup.textSync()) as unknown);
  // On a first-ever write there is no committed primary or recovery copy yet.
  // A process death after staging the complete JSON but before the final move
  // should not silently reset the user's first saved state.
  if (pending?.exists) return parse(JSON.parse(pending.textSync()) as unknown);
  return empty();
}

export function writeSnapshot<T>(
  value: unknown,
  parse: (value: unknown) => T,
  primary: File,
  backup: File,
  next: File,
): T {
  const validated = parse(value);
  PLAY_LIBRARY_DIRECTORY.create({ intermediates: true, idempotent: true });
  // Expo move operations mutate the source File's URI. Clone the handle so
  // callers may safely cache the staging path for subsequent writes.
  const staged = new File(next.uri);
  staged.create({ overwrite: true });
  staged.write(JSON.stringify(validated));
  // A valid primary becomes the recovery snapshot only after the staged value
  // has been fully written. Corrupt primary data never replaces a good backup.
  if (primary.exists) {
    let primaryIsValid = false;
    try {
      parse(JSON.parse(primary.textSync()) as unknown);
      primaryIsValid = true;
    } catch {
      // A damaged primary must not replace the previous backup.
    }
    if (primaryIsValid) primary.copySync(backup, { overwrite: true });
  }
  staged.moveSync(primary, { overwrite: true });
  return validated;
}
