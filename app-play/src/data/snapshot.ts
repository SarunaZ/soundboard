import { Directory, File, Paths } from 'expo-file-system';

export const PLAY_LIBRARY_DIRECTORY = new Directory(Paths.document, 'play-library');

export function emptyOrRecoveredSnapshot<T>(
  primary: File,
  backup: File,
  empty: () => T,
  parse: (value: unknown) => T,
): T {
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
