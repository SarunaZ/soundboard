export const ONBOARDING_COMPLETION_VERSION = 1;

export interface OnboardingStorage {
  readCompletion(): Promise<unknown | null>;
  writeCompletion(value: { version: 1; completed: true }): Promise<void>;
}

export function hasCompletedOnboarding(value: unknown): value is { version: 1; completed: true } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2 && record.version === ONBOARDING_COMPLETION_VERSION && record.completed === true;
}

export interface OnboardingFileSystem {
  Directory: new (parent: any, name: string) => { exists: boolean; create(options: { intermediates: boolean; idempotent: boolean }): void };
  File: new (parent: any, name: string) => {
    readonly name: string;
    readonly exists: boolean;
    textSync(): string;
    create(options: { overwrite: boolean }): void;
    write(contents: string): void;
    moveSync(target: unknown, options: { overwrite: boolean }): void;
  };
  Paths: { document: unknown };
}

/** Kept separate from play-library, preferences, backups and analytics consent. */
export function createOnboardingStorage(fileSystem: OnboardingFileSystem): OnboardingStorage {
  const { Directory, File, Paths } = fileSystem;
  const directory = new Directory(Paths.document, 'play-onboarding');
  const marker = new File(directory, 'completion.json');
  return {
    async readCompletion() {
      if (!marker.exists) return null;
      try { return JSON.parse(marker.textSync()) as unknown; } catch { return null; }
    },
    async writeCompletion(value) {
      if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
      const staged = new File(directory, 'completion.json.next');
      staged.create({ overwrite: true });
      staged.write(JSON.stringify(value));
      staged.moveSync(marker, { overwrite: true });
    },
  };
}

export async function createDeviceOnboardingStorage(): Promise<OnboardingStorage> {
  const fileSystem = await import('expo-file-system');
  return createOnboardingStorage(fileSystem);
}
