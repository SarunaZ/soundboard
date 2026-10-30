export interface AnalyticsStorage {
  readConsent(): Promise<unknown | null>;
  writeConsent(value: { version: 2; enabled: boolean }): Promise<void>;
  deleteConsent(): Promise<void>;
  readIdentity(): Promise<unknown | null>;
  writeIdentity(value: { version: 1; installId: string }): Promise<void>;
  deleteIdentity(): Promise<void>;
  readLastSummaryAt(): Promise<unknown | null>;
  writeLastSummaryAt(value: { version: 1; at: number }): Promise<void>;
}

/** Loaded only on a consent lifecycle operation; files are outside play-library and ZIP backups. */
export async function createDeviceAnalyticsStorage(): Promise<AnalyticsStorage> {
  const { Directory, File, Paths } = await import('expo-file-system');
  const directory = new Directory(Paths.document, 'play-analytics');
  const consentFile = new File(directory, 'consent.json');
  const identityFile = new File(directory, 'identity.json');
  const summaryFile = new File(directory, 'summary.json');
  const ensureDirectory = () => { if (!directory.exists) directory.create({ intermediates: true, idempotent: true }); };
  const read = (file: InstanceType<typeof File>): unknown | null => {
    if (!file.exists) return null;
    return JSON.parse(file.textSync()) as unknown;
  };
  const write = (file: InstanceType<typeof File>, value: unknown) => {
    ensureDirectory();
    const staged = new File(directory, `${file.name}.next`);
    staged.create({ overwrite: true });
    staged.write(JSON.stringify(value));
    staged.moveSync(file, { overwrite: true });
  };
  return {
    async readConsent() { return read(consentFile); },
    async writeConsent(value) { write(consentFile, value); },
    async deleteConsent() { if (consentFile.exists) consentFile.delete(); const staged = new File(directory, `${consentFile.name}.next`); if (staged.exists) staged.delete(); },
    async readIdentity() { return read(identityFile); },
    async writeIdentity(value) { write(identityFile, value); },
    async deleteIdentity() { if (identityFile.exists) identityFile.delete(); },
    async readLastSummaryAt() { return read(summaryFile); },
    async writeLastSummaryAt(value) { write(summaryFile, value); },
  };
}
