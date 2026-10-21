import { Directory, File, FileMode } from 'expo-file-system';
type AudioExtension = 'mp3' | 'm4a' | 'wav' | 'aac';
type SavedClip = { id: string; title: string; durationMs: number; createdAt: string; extension?: AudioExtension };

export const TRANSFER_MANIFEST_NAME = 'manifest.json';
export const MAX_TRANSFER_CLIPS = 1_000;
export const MAX_TRANSFER_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_TRANSFER_BYTES = 512 * 1024 * 1024;
export const MAX_TRANSFER_MANIFEST_BYTES = 1024 * 1024;
export const TRANSFER_CHUNK_BYTES = 64 * 1024;

const EXTENSIONS = new Set<AudioExtension>(['mp3', 'm4a', 'wav', 'aac']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CRC = new Uint32Array(256);
for (let i = 0; i < CRC.length; i++) {
  let n = i;
  for (let bit = 0; bit < 8; bit++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  CRC[i] = n >>> 0;
}

export type TransferClip = SavedClip & { uri: string; missing: boolean };
export type TransferManifestEntry = SavedClip & { extension: AudioExtension; sizeBytes: number; crc32: number };
export interface TransferManifest { format: 'soundboard-transfer'; version: 1; clips: TransferManifestEntry[] }
export interface TransferSource { directory: Directory; manifest: TransferManifest }

type Handle = { readBytes(length: number): Uint8Array; writeBytes(bytes: Uint8Array): void; close(): void };
type TransferFile = {
  uri: string; name: string; size: number; exists: boolean;
  text(): Promise<string>; write(contents: string | Uint8Array): void;
  create(): void; delete(): void; open(mode?: FileMode): Handle;
};
type TransferDirectory = {
  uri: string; name: string; exists: boolean;
  list(): Array<TransferFile | TransferDirectory>;
  createDirectory(name: string): TransferDirectory;
  createFile(name: string, mimeType: string | null): TransferFile;
  delete(): void;
};

function assertNotAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Folder transfer was cancelled.');
  error.name = 'AbortError';
  throw error;
}

function isPickerCancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { name?: unknown; code?: unknown; message?: unknown };
  if (value.code === 'ERR_PICKER_CANCELLED' || value.code === 'ERR_PICKING_CANCELLED' ||
      value.name === 'PickerCancelledException' || value.name === 'FilePickingCancelledException' || value.name === 'PickingCancelledException') return true;
  return typeof value.message === 'string' &&
    /(?:the file picker|file picking) was cancelled by the user/i.test(value.message);
}

function crcUpdate(crc: number, bytes: Uint8Array): number {
  let value = crc;
  for (const byte of bytes) value = CRC[(value ^ byte) & 0xff] ^ (value >>> 8);
  return value >>> 0;
}

function hasHeader(extension: AudioExtension, b: Uint8Array): boolean {
  const text = (start: number, expected: string) => expected.split('').every((char, index) => b[start + index] === char.charCodeAt(0));
  if (extension === 'wav') return b.length >= 12 && text(0, 'RIFF') && text(8, 'WAVE');
  if (extension === 'm4a') return b.length >= 8 && text(4, 'ftyp');
  if (extension === 'mp3') return b.length >= 3 && (text(0, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0));
  return b.length >= 2 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0;
}

function assertExtension(value: unknown): asserts value is AudioExtension {
  if (typeof value !== 'string' || !EXTENSIONS.has(value as AudioExtension)) throw new Error('The transfer manifest contains an unsupported audio extension.');
}

function validateSavedClips(clips: unknown[]): SavedClip[] {
  const ids = new Set<string>();
  return clips.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`Transfer clip ${index + 1} is invalid.`);
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== 'string' || !UUID.test(item.id)) throw new Error(`Transfer clip ${index + 1} has an invalid ID.`);
    if (ids.has(item.id)) throw new Error('The transfer manifest contains duplicate IDs.');
    ids.add(item.id);
    if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 100 ||
        typeof item.durationMs !== 'number' || !Number.isInteger(item.durationMs) || item.durationMs <= 0 || item.durationMs > 60_000 ||
        typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt))) {
      throw new Error(`Transfer clip ${index + 1} has invalid metadata.`);
    }
    const extension = item.extension === undefined ? 'm4a' : item.extension;
    assertExtension(extension);
    return { id: item.id, title: item.title, durationMs: item.durationMs, createdAt: item.createdAt, extension };
  });
}

function assertFileSize(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > MAX_TRANSFER_FILE_BYTES) {
    throw new Error(`${label} must be between 1 byte and 32 MiB.`);
  }
  return value;
}

function validateManifest(value: unknown): TransferManifest {
  if (!value || typeof value !== 'object') throw new Error('The transfer manifest is unreadable.');
  const row = value as Record<string, unknown>;
  if (row.format !== 'soundboard-transfer' || row.version !== 1 || !Array.isArray(row.clips)) throw new Error('The selected folder does not contain a supported Soundboard transfer.');
  if (row.clips.length === 0) throw new Error('The selected Soundboard transfer is empty.');
  if (row.clips.length > MAX_TRANSFER_CLIPS) throw new Error(`Transfers can contain up to ${MAX_TRANSFER_CLIPS} clips.`);
  const entries: TransferManifestEntry[] = [];
  let total = 0;
  for (const [index, raw] of row.clips.entries()) {
    if (!raw || typeof raw !== 'object') throw new Error(`Transfer clip ${index + 1} is invalid.`);
    const item = raw as Record<string, unknown>;
    assertExtension(item.extension);
    if (typeof item.id !== 'string' || !UUID.test(item.id)) throw new Error(`Transfer clip ${index + 1} has an invalid ID.`);
    const sizeBytes = assertFileSize(item.sizeBytes, `Transfer clip ${index + 1}`);
    if (typeof item.crc32 !== 'number' || !Number.isInteger(item.crc32) || item.crc32 < 0 || item.crc32 > 0xffffffff) throw new Error(`Transfer clip ${index + 1} has an invalid checksum.`);
    total += sizeBytes;
    if (total > MAX_TRANSFER_BYTES) throw new Error('The transfer is larger than 512 MiB.');
    entries.push({ id: item.id, title: item.title as string, durationMs: item.durationMs as number, createdAt: item.createdAt as string, extension: item.extension, sizeBytes, crc32: item.crc32 });
  }
  const metadata = validateSavedClips(entries);
  return { format: 'soundboard-transfer', version: 1, clips: metadata.map((clip, i) => ({ ...clip, extension: entries[i].extension, sizeBytes: entries[i].sizeBytes, crc32: entries[i].crc32 })) };
}

function fileIn(directory: TransferDirectory, name: string): TransferFile | undefined {
  const files = directory.list().filter((item) => item.name === name && !('list' in item));
  if (files.length > 1) throw new Error(`The selected folder contains duplicate files named ${name}.`);
  return files[0] as TransferFile | undefined;
}

function createExportFolder(parent: TransferDirectory): TransferDirectory {
  for (let tries = 0; tries < 5; tries++) {
    const name = `Soundboard-transfer-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
    // SAF providers can have their own collision behavior. Skip names already
    // visible in the selected folder before asking the provider to create one.
    if (parent.list().some((item) => item.name === name)) continue;
    try { return parent.createDirectory(name); }
    catch (error) {
      if (!parent.list().some((item) => item.name === name && 'list' in item)) throw error;
    }
  }
  throw new Error('Could not create a unique transfer folder. Try again.');
}

async function copyAndVerify(source: TransferFile, destination: TransferFile, expectedSize: number, expectedCrc?: number, signal?: AbortSignal, destinationCreated = false): Promise<number> {
  if (!source.exists || source.size !== expectedSize) throw new Error('A transfer audio file is missing or has changed size.');
  if (destinationCreated ? !destination.exists : destination.exists) throw new Error('A transfer destination file already exists or could not be created.');
  if (!destinationCreated) destination.create();
  let reader: Handle | undefined;
  let writer: Handle | undefined;
  let failure: unknown;
  let actualCrc = 0;
  try {
    reader = source.open(FileMode.ReadOnly);
    writer = destination.open(FileMode.WriteOnly);
    let remaining = expectedSize;
    let crc = 0xffffffff;
    let prefix = new Uint8Array(0);
    let chunks = 0;
    while (remaining > 0) {
      assertNotAborted(signal);
      const chunk = reader.readBytes(Math.min(TRANSFER_CHUNK_BYTES, remaining));
      if (chunk.length === 0) throw new Error('The audio copy ended before the complete file was written.');
      if (chunk.length > remaining) throw new Error('The audio file changed while it was being copied.');
      if (prefix.length < 12) {
        const combined = new Uint8Array(Math.min(12, prefix.length + chunk.length));
        combined.set(prefix);
        combined.set(chunk.subarray(0, combined.length - prefix.length), prefix.length);
        prefix = combined;
      }
      writer.writeBytes(chunk);
      crc = crcUpdate(crc, chunk);
      remaining -= chunk.length;
      // Yield often enough for cancellation and app lifecycle events to run
      // during a single large audio file.
      chunks += 1;
      if (chunks % 16 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    assertNotAborted(signal);
    const extension = destination.name.slice(destination.name.lastIndexOf('.') + 1) as AudioExtension;
    if (!hasHeader(extension, prefix)) throw new Error(`The audio file header does not match .${extension}.`);
    if (reader.readBytes(1).length !== 0) throw new Error('The audio file changed while it was being copied.');
    actualCrc = (crc ^ 0xffffffff) >>> 0;
    reader.close();
    reader = undefined;
    writer.close();
    writer = undefined;
    if (expectedCrc !== undefined && actualCrc !== expectedCrc) throw new Error('The audio file checksum does not match the transfer manifest.');
    if (!destination.exists || destination.size !== expectedSize) throw new Error('The audio copy was truncated or incomplete.');
  } catch (error) {
    failure = error;
  } finally {
    try { reader?.close(); } catch (error) { failure ??= error; }
    try { writer?.close(); } catch (error) { failure ??= error; }
  }
  if (failure !== undefined) {
    if (destination.exists) {
      try { destination.delete(); } catch { /* Keep the copy error as the useful failure. */ }
    }
    throw failure;
  }
  return actualCrc;
}

function preflight(clips: TransferClip[]): Array<{ clip: TransferClip; file: File; sizeBytes: number }> {
  if (!Array.isArray(clips) || clips.length === 0) throw new Error('There are no saved clips to transfer.');
  if (clips.length > MAX_TRANSFER_CLIPS) throw new Error(`Transfers can contain up to ${MAX_TRANSFER_CLIPS} clips.`);
  const metadata = validateSavedClips(clips);
  let total = 0;
  return clips.map((clip, index) => {
    if (clip.missing) throw new Error(`“${clip.title}” is missing from this phone and cannot be transferred.`);
    const file = new File(clip.uri);
    if (!file.exists) throw new Error(`“${clip.title}” is missing from this phone and cannot be transferred.`);
    const sizeBytes = assertFileSize(file.size, `Clip ${index + 1}`);
    total += sizeBytes;
    if (total > MAX_TRANSFER_BYTES) throw new Error('The library selection is larger than 512 MiB.');
    return { clip: { ...metadata[index], ...clip }, file, sizeBytes };
  });
}

/** Export all saved clips into one new child folder under a user-selected parent. */
export async function exportClipsToFolder(clips: TransferClip[], signal?: AbortSignal): Promise<{ count: number; folderUri: string } | null> {
  assertNotAborted(signal);
  const firstCheck = preflight(clips);
  let parent: Directory;
  try { parent = await Directory.pickDirectoryAsync(); }
  catch (error) { if (isPickerCancelled(error)) return null; throw error; }
  assertNotAborted(signal);
  const prepared = preflight(clips);
  if (prepared.some((item, index) => item.sizeBytes !== firstCheck[index].sizeBytes || item.file.uri !== firstCheck[index].file.uri)) throw new Error('The Library changed while the folder picker was open. Try again.');
  const folder = createExportFolder(parent as unknown as TransferDirectory);
  try {
    const entries: TransferManifestEntry[] = [];
    for (const { clip, file, sizeBytes } of prepared) {
      assertNotAborted(signal);
      const extension = (clip.extension ?? 'm4a') as AudioExtension;
      const output = (folder as unknown as TransferDirectory).createFile(`${clip.id}.${extension}`, 'application/octet-stream');
      const crc32 = await copyAndVerify(file as unknown as TransferFile, output, sizeBytes, undefined, signal, true);
      entries.push({ id: clip.id, title: clip.title, durationMs: clip.durationMs, createdAt: clip.createdAt, extension, sizeBytes, crc32 });
    }
    assertNotAborted(signal);
    const manifest: TransferManifest = { format: 'soundboard-transfer', version: 1, clips: entries };
    const json = JSON.stringify(manifest);
    if (new TextEncoder().encode(json).length > MAX_TRANSFER_MANIFEST_BYTES) throw new Error('The transfer manifest is larger than 1 MiB.');
    (folder as unknown as TransferDirectory).createFile(TRANSFER_MANIFEST_NAME, 'application/json').write(json);
    return { count: entries.length, folderUri: folder.uri };
  } catch (error) {
    if (folder.exists) folder.delete();
    throw error;
  }
}

/** Pick and validate exactly one folder selected by the user. */
export async function pickTransferFolder(signal?: AbortSignal): Promise<TransferSource | null> {
  assertNotAborted(signal);
  let directory: Directory;
  try { directory = await Directory.pickDirectoryAsync(); }
  catch (error) { if (isPickerCancelled(error)) return null; throw error; }
  assertNotAborted(signal);
  const root = directory as unknown as TransferDirectory;
  const manifestFile = fileIn(root, TRANSFER_MANIFEST_NAME);
  if (!manifestFile?.exists) throw new Error('This folder does not contain a complete Soundboard transfer.');
  if (manifestFile.size <= 0 || manifestFile.size > MAX_TRANSFER_MANIFEST_BYTES) throw new Error('The transfer manifest is empty or larger than 1 MiB.');
  let raw: unknown;
  try { raw = JSON.parse(await manifestFile.text()); }
  catch (error) { throw new Error('The transfer manifest is unreadable or incomplete.', { cause: error }); }
  const manifest = validateManifest(raw);
  const byName = new Map<string, TransferFile>();
  for (const item of root.list()) {
    if ('list' in item) continue;
    if (byName.has(item.name)) throw new Error(`The selected folder contains duplicate files named ${item.name}.`);
    byName.set(item.name, item as TransferFile);
  }
  for (const entry of manifest.clips) {
    assertNotAborted(signal);
    const name = `${entry.id}.${entry.extension}`;
    const file = byName.get(name);
    if (!file?.exists || file.size !== entry.sizeBytes) throw new Error(`Transfer audio file ${name} is missing or incomplete.`);
  }
  return { directory, manifest };
}

/** Copy one picked entry into a new app-private destination file and verify it. */
export async function copyTransferEntry(source: TransferSource, entry: TransferManifestEntry, destination: File, signal?: AbortSignal): Promise<void> {
  assertNotAborted(signal);
  if (!source?.directory || !source.manifest?.clips.some((item) => item.id === entry.id && item.extension === entry.extension && item.crc32 === entry.crc32 && item.sizeBytes === entry.sizeBytes)) throw new Error('The selected clip does not belong to this transfer folder.');
  const input = fileIn(source.directory as unknown as TransferDirectory, `${entry.id}.${entry.extension}`);
  if (!input) throw new Error(`Transfer audio file ${entry.id}.${entry.extension} is missing.`);
  await copyAndVerify(input, destination as unknown as TransferFile, entry.sizeBytes, entry.crc32, signal);
}
