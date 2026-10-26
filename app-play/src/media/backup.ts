import { Directory, File, FileMode } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { Paths } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';

import { loadBoards } from '../data/boards.ts';
import { parseBoardCollection } from '../data/boardModel.ts';
import { loadClipPresentations, parsePresentations } from '../data/presentation.ts';
import { loadClipPlaybackPreferences, parseClipPlaybackPreferences } from '../data/clipPlayback.ts';
import { loadPlayPreferences, parsePlayPreferences } from '../data/preferences.ts';
import { loadLocalClips, prepareImportedClips } from '../data/library.ts';
import { padGradientForClipId } from '../data/padColors.ts';
import { parseClipCatalog } from '../data/catalog.ts';
import { hasPendingSnapshotTransaction, PLAY_LIBRARY_DIRECTORY, writeSnapshotTransaction } from '../data/snapshot.ts';
import { mergePlayBackup, parsePlayBackupManifest, MAX_BACKUP_MANIFEST_BYTES, MAX_BACKUP_FILE_BYTES, MAX_BACKUP_ARTWORK_BYTES, MAX_BACKUP_BYTES, MAX_BACKUP_FILES, type BackupFileEntry, type PlayBackupManifest } from './backupValidation.ts';

const BACKUP_MANIFEST_NAME = 'play-backup.json';
const ARTWORK_DIRECTORY = new Directory(PLAY_LIBRARY_DIRECTORY, 'artwork');
const STAGING_DIRECTORY = new Directory(Paths.cache, 'play-backup-staging');
const CHUNK_BYTES = 64 * 1024;

type Handle = { readBytes(length: number): Uint8Array; writeBytes(bytes: Uint8Array): void; close(): void };
type TransferFile = { uri: string; name: string; size: number; exists: boolean; text(): Promise<string>; create(): void; write(contents: string): void; open(mode?: FileMode): Handle; delete(): void };
type TransferDirectory = { uri: string; name: string; exists: boolean; list(): Array<TransferFile | TransferDirectory>; createDirectory(name: string): TransferDirectory; createFile(name: string, mimeType: string | null): TransferFile; delete(): void };

export interface PlayBackupExportResult { count: number; folderUri: string }
export interface PlayBackupImportResult { imported: number; skipped: number; boardsAdded: number }

function abort(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Play backup was canceled.');
  error.name = 'AbortError';
  throw error;
}

function pickerCanceled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: unknown; name?: unknown; message?: unknown };
  return ['ERR_PICKER_CANCELLED', 'ERR_PICKING_CANCELLED'].includes(String(value.code)) ||
    ['PickerCancelledException', 'FilePickingCancelledException', 'PickingCancelledException'].includes(String(value.name)) ||
    (typeof value.message === 'string' && /(?:the file picker|file picking) was cancelled by the user/i.test(value.message));
}

function isUnregisteredDirectoryPicker(error: unknown): boolean {
  return !!error && typeof error === 'object' &&
    typeof (error as { message?: unknown }).message === 'string' &&
    (error as { message: string }).message.includes('Attempting to launch an unregistered ActivityResultLauncher');
}

async function pickBackupDirectory(): Promise<Directory | null> {
  try {
    return await Directory.pickDirectoryAsync();
  } catch (error) {
    if (pickerCanceled(error)) return null;
    if (!isUnregisteredDirectoryPicker(error)) throw error;
  }

  let permission;
  try {
    permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  } catch (error) {
    if (pickerCanceled(error)) return null;
    throw error;
  }
  if (!permission.granted) return null;
  const parent = new Directory(permission.directoryUri);
  if (!parent.exists) throw new Error('The selected backup folder is no longer available.');
  return parent;
}

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let value = i;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  CRC_TABLE[i] = value >>> 0;
}
function crcUpdate(crc: number, bytes: Uint8Array): number {
  let result = crc;
  for (const byte of bytes) result = CRC_TABLE[(result ^ byte) & 0xff] ^ (result >>> 8);
  return result >>> 0;
}

function zipHeader(size: number, crc32: number, name: string, offset = 0, central = false): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const header = new Uint8Array(central ? 46 + nameBytes.length : 30 + nameBytes.length);
  const view = new DataView(header.buffer);
  if (!central) {
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true);
    view.setUint16(8, 0, true); view.setUint16(12, 0x21, true); view.setUint32(14, crc32, true); view.setUint32(18, size, true); view.setUint32(22, size, true);
    view.setUint16(26, nameBytes.length, true); view.setUint16(28, 0, true); header.set(nameBytes, 30);
  } else {
    view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true); view.setUint16(8, 0x0800, true);
    view.setUint16(10, 0, true); view.setUint16(14, 0x21, true); view.setUint32(16, crc32, true); view.setUint32(20, size, true); view.setUint32(24, size, true);
    view.setUint16(28, nameBytes.length, true); view.setUint16(30, 0, true); view.setUint16(32, 0, true); view.setUint16(34, 0, true);
    view.setUint32(38, 0, true); view.setUint32(42, offset, true); header.set(nameBytes, 46);
  }
  return header;
}

function zipEnd(entryCount: number, centralSize: number, centralOffset: number): Uint8Array {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, entryCount, true); view.setUint16(10, entryCount, true);
  view.setUint32(12, centralSize, true); view.setUint32(16, centralOffset, true);
  return bytes;
}

function safeZipName(name: string): boolean {
  return name === BACKUP_MANIFEST_NAME || /^[0-9a-f-]{36}\.(?:mp3|m4a|wav|aac|jpg)$/i.test(name);
}

function validateAudioHeader(name: string, bytes: Uint8Array): void {
  const text = (start: number, expected: string) => [...expected].every((char, i) => bytes[start + i] === char.charCodeAt(0));
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const valid = extension === 'wav'
    ? bytes.length >= 12 && text(0, 'RIFF') && text(8, 'WAVE')
    : extension === 'm4a'
      ? bytes.length >= 8 && text(4, 'ftyp')
      : extension === 'mp3'
        ? bytes.length >= 3 && (text(0, 'ID3') || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0))
        : extension === 'aac' && bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xf6) === 0xf0;
  if (!valid) throw new Error(`Backup audio ${name} does not have a valid ${extension.toUpperCase()} header.`);
}

function validateArtwork(bytes: Uint8Array): void {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Backup artwork is not a valid JPEG image.');
  let offset = 2;
  while (offset < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset++;
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++]!;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    const isFrame = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
    if (isFrame) {
      if (segmentLength < 7) break;
      const height = (bytes[offset + 3]! << 8) | bytes[offset + 4]!;
      const width = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      if (!width || !height || width > 512 || height > 512 || width * height > 512 * 512) throw new Error('Backup artwork exceeds the 512 px thumbnail limit.');
      return;
    }
    offset += segmentLength;
  }
  throw new Error('Backup artwork is a malformed JPEG or has no image dimensions.');
}

function validateMedia(name: string, prefix: Uint8Array, artworkChunks?: Uint8Array[], artworkLength = 0): void {
  if (name.endsWith('.jpg')) {
    if (artworkLength > MAX_BACKUP_ARTWORK_BYTES) throw new Error('Backup artwork exceeds the 1 MiB thumbnail limit.');
    const bytes = new Uint8Array(artworkLength);
    let offset = 0;
    for (const chunk of artworkChunks ?? []) { bytes.set(chunk, offset); offset += chunk.length; }
    validateArtwork(bytes);
  } else validateAudioHeader(name, prefix);
}

async function scanSource(file: File, name: string, signal?: AbortSignal): Promise<BackupFileEntry> {
  const maxSize = name.endsWith('.jpg') ? MAX_BACKUP_ARTWORK_BYTES : MAX_BACKUP_FILE_BYTES;
  if (!file.exists || file.size <= 0 || file.size > maxSize) throw new Error(`Backup file ${name} is missing or exceeds its size limit.`);
  const reader = file.open(FileMode.ReadOnly);
  let crc = 0xffffffff;
  let remaining = file.size;
  let prefix = new Uint8Array(0);
  const artworkChunks: Uint8Array[] = [];
  try {
    while (remaining > 0) {
      abort(signal);
      const chunk = reader.readBytes(Math.min(CHUNK_BYTES, remaining));
      if (!chunk.length || chunk.length > remaining) throw new Error(`Backup file ${name} changed while being read.`);
      if (prefix.length < 12) {
        const next = new Uint8Array(Math.min(12, prefix.length + chunk.length));
        next.set(prefix); next.set(chunk.subarray(0, next.length - prefix.length), prefix.length); prefix = next;
      }
      if (name.endsWith('.jpg')) artworkChunks.push(chunk);
      crc = crcUpdate(crc, chunk); remaining -= chunk.length;
      if (remaining > 0 && remaining % (CHUNK_BYTES * 8) === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (reader.readBytes(1).length) throw new Error(`Backup file ${name} changed while being read.`);
    validateMedia(name, prefix, artworkChunks, file.size);
  } finally { reader.close(); }
  return { name, sizeBytes: file.size, crc32: (crc ^ 0xffffffff) >>> 0, kind: name.endsWith('.jpg') ? 'artwork' : 'audio' };
}

async function writeZipEntry(writer: Handle, file: File, entry: BackupFileEntry, offset: number, signal?: AbortSignal): Promise<number> {
  writer.writeBytes(zipHeader(entry.sizeBytes, entry.crc32, entry.name));
  let reader = file.open(FileMode.ReadOnly);
  let remaining = entry.sizeBytes;
  let crc = 0xffffffff;
  try {
    while (remaining > 0) {
      abort(signal);
      const chunk = reader.readBytes(Math.min(CHUNK_BYTES, remaining));
      if (!chunk.length || chunk.length > remaining) throw new Error(`Backup file ${entry.name} changed while being copied.`);
      writer.writeBytes(chunk); crc = crcUpdate(crc, chunk); remaining -= chunk.length;
      if (remaining > 0 && remaining % (CHUNK_BYTES * 8) === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (reader.readBytes(1).length || (crc ^ 0xffffffff) >>> 0 !== entry.crc32) throw new Error(`Backup file ${entry.name} changed during export.`);
  } finally { reader.close(); }
  return offset + 30 + new TextEncoder().encode(entry.name).length + entry.sizeBytes;
}

async function copyVerified(source: File, destination: TransferFile, expected?: BackupFileEntry, signal?: AbortSignal): Promise<BackupFileEntry> {
  const maxSize = destination.name.endsWith('.jpg') ? MAX_BACKUP_ARTWORK_BYTES : MAX_BACKUP_FILE_BYTES;
  if (!source.exists || source.size <= 0 || source.size > maxSize) throw new Error(`Backup file ${destination.name} is missing or exceeds its size limit.`);
  if (destination.exists) throw new Error(`The backup destination already contains ${destination.name}.`);
  destination.create();
  let reader: Handle | undefined;
  let writer: Handle | undefined;
  let failure: unknown;
  let crc = 0xffffffff;
  let first = new Uint8Array(0);
  const artworkChunks: Uint8Array[] = [];
  try {
    reader = source.open(FileMode.ReadOnly);
    writer = destination.open(FileMode.WriteOnly);
    let remaining = source.size;
    while (remaining > 0) {
      abort(signal);
      const chunk = reader.readBytes(Math.min(CHUNK_BYTES, remaining));
      if (!chunk.length || chunk.length > remaining) throw new Error(`Backup file ${destination.name} changed while being copied.`);
      if (first.length < 12) {
        const joined = new Uint8Array(Math.min(12, first.length + chunk.length));
        joined.set(first);
        joined.set(chunk.subarray(0, joined.length - first.length), first.length);
        first = joined;
      }
      if (destination.name.endsWith('.jpg')) artworkChunks.push(chunk);
      writer.writeBytes(chunk);
      crc = crcUpdate(crc, chunk);
      remaining -= chunk.length;
      if (remaining > 0 && remaining % (CHUNK_BYTES * 8) === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (reader.readBytes(1).length) throw new Error(`Backup file ${destination.name} changed while being copied.`);
    validateMedia(destination.name, first, artworkChunks, source.size);
    reader.close(); reader = undefined;
    writer.close(); writer = undefined;
    const sizeBytes = source.size;
    const crc32 = (crc ^ 0xffffffff) >>> 0;
    if (!destination.exists || destination.size !== sizeBytes) throw new Error(`Backup file ${destination.name} was truncated.`);
    if (expected && (expected.sizeBytes !== sizeBytes || expected.crc32 !== crc32)) throw new Error(`Backup file ${destination.name} failed its integrity check.`);
    return { name: destination.name, sizeBytes, crc32, kind: destination.name.endsWith('.jpg') ? 'artwork' : 'audio' };
  } catch (error) { failure = error; }
  finally {
    try { reader?.close(); } catch (error) { failure ??= error; }
    try { writer?.close(); } catch (error) { failure ??= error; }
  }
  try { if (destination.exists) destination.delete(); } catch { /* keep the original failure */ }
  throw failure;
}

function sourceFile(name: string): File {
  if (name.endsWith('.jpg')) return new File(ARTWORK_DIRECTORY, name);
  return new File(PLAY_LIBRARY_DIRECTORY, name);
}

function makeManifest(files: BackupFileEntry[]): PlayBackupManifest {
  const clips = loadLocalClips();
  if (clips.some((clip) => clip.missing)) throw new Error('A saved clip is missing from this phone and cannot be backed up.');
  const presentations = { ...loadClipPresentations() };
  // Older clips may not have saved colors. Export their UUID-based fallback so a
  // restore preserves the same visible gradient instead of allocating a new one.
  for (const clip of clips) {
    if (presentations[clip.id]?.color) continue;
    const fallback = padGradientForClipId(clip.id);
    presentations[clip.id] = { ...presentations[clip.id], ...fallback };
  }
  const manifest = {
    format: 'stimmyz-play-backup', version: 1,
    clips: parseClipCatalog({ version: 1, clips }).clips,
    boards: loadBoards(), presentations,
    playback: loadClipPlaybackPreferences(), preferences: loadPlayPreferences(), files,
  };
  return parsePlayBackupManifest(manifest);
}

/** Stream a ZIP to app-private storage, then copy it to the selected folder with Expo's native copy path. */
export async function exportPlayBackup(signal?: AbortSignal): Promise<PlayBackupExportResult | null> {
  abort(signal);
  const clips = loadLocalClips();
  if (clips.some((clip) => clip.missing)) throw new Error('A saved clip is missing from this phone and cannot be backed up.');
  const expectedFiles: Array<{ name: string; file: File }> = clips.map((clip) => ({ name: `${clip.id}.${clip.extension}`, file: new File(clip.uri) }));
  const presentations = loadClipPresentations();
  const artworkNames = new Set<string>();
  for (const presentation of Object.values(presentations)) {
    if (!presentation.artwork || artworkNames.has(presentation.artwork.fileName)) continue;
    artworkNames.add(presentation.artwork.fileName);
    expectedFiles.push({ name: presentation.artwork.fileName, file: sourceFile(presentation.artwork.fileName) });
  }
  if (expectedFiles.length > 2_001) throw new Error('This Play backup contains too many files.');
  let total = 0;
  const files: BackupFileEntry[] = [];
  for (const { name, file } of expectedFiles) {
    const entry = await scanSource(file, name, signal);
    files.push(entry);
    total += entry.sizeBytes;
  }
  if (total > MAX_BACKUP_BYTES) throw new Error('This Play backup is larger than 512 MiB.');
  let parent: Directory;
  const selectedParent = await pickBackupDirectory();
  if (!selectedParent) return null;
  parent = selectedParent;
  abort(signal);
  // Re-read file sizes after the picker returns; the library may have changed while it was open.
  const checkedClips = loadLocalClips();
  if (checkedClips.length !== clips.length || checkedClips.some((clip, index) => clip.id !== clips[index]?.id || clip.uri !== clips[index]?.uri)) throw new Error('The Library changed while the backup folder picker was open. Try again.');
  const manifest = makeManifest(files);
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  if (manifestBytes.length > MAX_BACKUP_MANIFEST_BYTES) throw new Error('The Play backup manifest exceeds 8 MiB.');
  const manifestEntry: BackupFileEntry = { name: BACKUP_MANIFEST_NAME, sizeBytes: manifestBytes.length, crc32: (crcUpdate(0xffffffff, manifestBytes) ^ 0xffffffff) >>> 0, kind: 'audio' };
  const allEntries = [...files, manifestEntry];
  let zipName = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    zipName = `Stimmyz-Play-backup-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}.zip`;
    if (!parent.list().some((item) => item.name === zipName)) break;
    zipName = '';
  }
  // Expo's Android SAF FileHandle currently does not retain its ParcelFileDescriptor.
  // Long JS writes to a content:// handle can therefore fail when the descriptor is
  // finalized. Assemble through a regular cache file and let the native copy path
  // own SAF streams for the duration of the copy.
  if (!zipName) throw new Error('Could not create a unique backup archive. Try again.');
  const output = new File(Paths.cache, zipName);
  if (!output.exists) output.create();
  let writer: Handle | undefined;
  let destination: File | undefined;
  try {
    writer = output.open(FileMode.WriteOnly);
    const central: Array<{ entry: BackupFileEntry; offset: number }> = [];
    let offset = 0;
    for (let index = 0; index < files.length; index++) {
      abort(signal);
      const entry = files[index]!;
      const source = expectedFiles[index]!.file;
      central.push({ entry, offset });
      offset = await writeZipEntry(writer, source, entry, offset, signal);
    }
    central.push({ entry: manifestEntry, offset });
    writer.writeBytes(zipHeader(manifestEntry.sizeBytes, manifestEntry.crc32, BACKUP_MANIFEST_NAME));
    writer.writeBytes(manifestBytes);
    offset += 30 + new TextEncoder().encode(BACKUP_MANIFEST_NAME).length + manifestBytes.length;
    const centralOffset = offset;
    for (const entry of central) {
      abort(signal);
      const header = zipHeader(entry.entry.sizeBytes, entry.entry.crc32, entry.entry.name, entry.offset, true);
      writer.writeBytes(header); offset += header.length;
    }
    writer.writeBytes(zipEnd(central.length, offset - centralOffset, centralOffset));
    writer.close(); writer = undefined;
    abort(signal);
    if (!output.exists || output.size !== offset + 22) throw new Error('The Play backup archive was not written completely.');
    await output.copy(parent);
    abort(signal);
    destination = parent.list().find((item): item is File => item instanceof File && item.name === zipName);
    if (!destination) throw new Error('The Play backup could not be found in the selected folder after copying.');
    return { count: manifest.clips.length, folderUri: destination.uri };
  } catch (error) {
    try { writer?.close(); } catch { /* preserve the export error */ }
    try {
      destination ??= parent.list().find((item): item is File => item instanceof File && item.name === zipName);
      if (destination?.exists) destination.delete();
    } catch { /* preserve the export error */ }
    throw error;
  } finally {
    try { if (output.exists) output.delete(); } catch { /* cache cleanup is best-effort */ }
  }
}

function readExact(reader: Handle, length: number, label: string): Uint8Array {
  const output = new Uint8Array(length);
  let offset = 0;
  while (offset < length) {
    const bytes = reader.readBytes(length - offset);
    if (!bytes.length || bytes.length > length - offset) throw new Error(`The backup archive ended while reading ${label}.`);
    output.set(bytes, offset); offset += bytes.length;
  }
  return output;
}

function parseLocalHeader(bytes: Uint8Array): { flags: number; method: number; crc32: number; compressedSize: number; size: number; nameLength: number; extraLength: number } {
  if (bytes.length !== 30 || new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) !== 0x04034b50) throw new Error('The Play backup is not a valid stored ZIP archive.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { flags: view.getUint16(6, true), method: view.getUint16(8, true), crc32: view.getUint32(14, true), compressedSize: view.getUint32(18, true), size: view.getUint32(22, true), nameLength: view.getUint16(26, true), extraLength: view.getUint16(28, true) };
}

async function unpackZip(file: File, signal?: AbortSignal): Promise<{ manifest: PlayBackupManifest; staged: Map<string, File>; stage: Directory }> {
  if (!file.exists || file.size < 100 || file.size > MAX_BACKUP_BYTES + MAX_BACKUP_MANIFEST_BYTES + 2_000_000) throw new Error('Choose a Play backup archive that is smaller than 520 MiB.');
  STAGING_DIRECTORY.create({ intermediates: true, idempotent: true });
  const stage = new Directory(STAGING_DIRECTORY, `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  stage.create({ intermediates: true });
  const reader = file.open(FileMode.ReadOnly);
  const staged = new Map<string, File>();
  let offset = 0;
  let total = 0;
  let entryCount = 0;
  const localEntries: Array<{ name: string; size: number; crc32: number; offset: number }> = [];
  let manifestText: string | undefined;
  try {
    while (true) {
      abort(signal);
      const signatureBytes = readExact(reader, 4, 'entry signature'); offset += 4;
      const signature = new DataView(signatureBytes.buffer).getUint32(0, true);
      if (signature !== 0x04034b50) {
        if (signature !== 0x02014b50) throw new Error('The Play backup ZIP has an invalid directory table.');
        const centralOffset = offset - 4;
        const remaining = file.size - offset;
        if (remaining < 22 || remaining > 1_000_000) throw new Error('The Play backup ZIP directory is invalid.');
        const tail = readExact(reader, remaining, 'ZIP directory');
        const endOffset = tail.length - 22;
        const end = new DataView(tail.buffer, tail.byteOffset + endOffset, 22);
        const centralBytes = new Uint8Array(4 + endOffset);
        centralBytes.set(signatureBytes);
        centralBytes.set(tail.subarray(0, endOffset), 4);
        if (end.getUint32(0, true) !== 0x06054b50 || end.getUint16(4, true) !== 0 || end.getUint16(6, true) !== 0 ||
            end.getUint16(8, true) !== localEntries.length || end.getUint16(10, true) !== localEntries.length ||
            end.getUint32(12, true) !== centralBytes.length || end.getUint32(16, true) !== centralOffset || end.getUint16(20, true) !== 0) {
          throw new Error('The Play backup ZIP directory is incomplete.');
        }
        let cursor = 0;
        for (const local of localEntries) {
          if (cursor + 46 > centralBytes.length) throw new Error('The Play backup ZIP directory is truncated.');
          const central = new DataView(centralBytes.buffer, centralBytes.byteOffset + cursor, centralBytes.length - cursor);
          if (central.getUint32(0, true) !== 0x02014b50 || central.getUint16(8, true) !== 0x0800 || central.getUint16(10, true) !== 0 ||
              central.getUint32(16, true) !== local.crc32 || central.getUint32(20, true) !== local.size || central.getUint32(24, true) !== local.size ||
              central.getUint16(30, true) !== 0 || central.getUint16(32, true) !== 0 || central.getUint16(34, true) !== 0 || central.getUint32(42, true) !== local.offset) {
            throw new Error('The Play backup ZIP directory does not match its file data.');
          }
          const nameLength = central.getUint16(28, true);
          if (cursor + 46 + nameLength > centralBytes.length) throw new Error('The Play backup ZIP directory is truncated.');
          const name = new TextDecoder('utf-8', { fatal: true }).decode(centralBytes.subarray(cursor + 46, cursor + 46 + nameLength));
          if (name !== local.name) throw new Error('The Play backup ZIP directory does not match its file data.');
          cursor += 46 + nameLength;
        }
        if (cursor !== centralBytes.length) throw new Error('The Play backup ZIP directory has unexpected data.');
        break;
      }
      entryCount += 1;
      if (manifestText !== undefined) throw new Error('The Play backup manifest must be the last archive file.');
      const localOffset = offset - 4;
      const rest = readExact(reader, 26, 'local file header'); offset += 26;
      const header = parseLocalHeader(new Uint8Array([...signatureBytes, ...rest]));
      if (header.flags !== 0x0800 || header.method !== 0 || header.compressedSize !== header.size || header.extraLength !== 0 || !header.nameLength || header.nameLength > 80) throw new Error('Only safe, uncompressed Play backup archives are supported.');
      const name = new TextDecoder('utf-8', { fatal: true }).decode(readExact(reader, header.nameLength, 'file name'));
      offset += header.nameLength;
      const maxEntrySize = name.endsWith('.jpg') ? MAX_BACKUP_ARTWORK_BYTES : MAX_BACKUP_FILE_BYTES;
      if (!safeZipName(name) || staged.has(name) || (name === BACKUP_MANIFEST_NAME && (header.size < 1 || header.size > MAX_BACKUP_MANIFEST_BYTES)) || (name !== BACKUP_MANIFEST_NAME && (header.size < 1 || header.size > maxEntrySize))) throw new Error(`The Play backup contains an unsafe or oversized file: ${name}.`);
      if (entryCount > MAX_BACKUP_FILES + 1 || (name !== BACKUP_MANIFEST_NAME && staged.size >= MAX_BACKUP_FILES)) throw new Error('The Play backup contains too many files.');
      total += header.size;
      if (total > MAX_BACKUP_BYTES + MAX_BACKUP_MANIFEST_BYTES) throw new Error('The Play backup is larger than 520 MiB.');
      const target = new File(stage, name);
      target.create();
      const writer = target.open(FileMode.WriteOnly);
      let crc = 0xffffffff;
      let remaining = header.size;
      const manifestChunks: Uint8Array[] = [];
      try {
        while (remaining > 0) {
          abort(signal);
          const chunk = reader.readBytes(Math.min(CHUNK_BYTES, remaining));
          if (!chunk.length || chunk.length > remaining) throw new Error(`The backup archive ended inside ${name}.`);
          writer.writeBytes(chunk); crc = crcUpdate(crc, chunk);
          if (name === BACKUP_MANIFEST_NAME) manifestChunks.push(chunk);
          remaining -= chunk.length; offset += chunk.length;
          if (remaining > 0 && remaining % (CHUNK_BYTES * 8) === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      } finally { writer.close(); }
      if (((crc ^ 0xffffffff) >>> 0) !== header.crc32 || target.size !== header.size) throw new Error(`Backup file ${name} failed its ZIP checksum.`);
      localEntries.push({ name, size: header.size, crc32: header.crc32, offset: localOffset });
      if (name === BACKUP_MANIFEST_NAME) {
        const bytes = new Uint8Array(header.size);
        let position = 0;
        for (const chunk of manifestChunks) { bytes.set(chunk, position); position += chunk.length; }
        manifestText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } else staged.set(name, target);
    }
    if (manifestText === undefined) throw new Error('The Play backup archive is missing its manifest.');
    let raw: unknown;
    try { raw = JSON.parse(manifestText); }
    catch (error) { throw new Error('The Play backup manifest is unreadable.', { cause: error }); }
    const manifest = parsePlayBackupManifest(raw);
    if (manifest.files.length !== staged.size) throw new Error('The Play backup contains files that do not match its manifest.');
    for (const entry of manifest.files) {
      const local = staged.get(entry.name);
      if (!local || local.size !== entry.sizeBytes) throw new Error(`Backup file ${entry.name} is missing or incomplete.`);
      const actual = await scanSource(local, entry.name, signal);
      if (actual.crc32 !== entry.crc32) throw new Error(`Backup file ${entry.name} failed its manifest checksum.`);
    }
    if ([...staged.keys()].some((name) => !manifest.files.some((entry) => entry.name === name))) throw new Error('The Play backup contains an unlisted file.');
    return { manifest, staged, stage };
  } catch (error) {
    try { stage.delete(); } catch { /* preserve parse failure */ }
    throw error;
  } finally { reader.close(); }
}

function removeDocumentPickerCacheFile(uri: string): void {
  const prefix = `${Paths.cache.uri.replace(/\/+$/, '')}/DocumentPicker/`;
  if (typeof uri !== 'string' || !uri.startsWith(prefix)) return;
  const relativePath = uri.slice(prefix.length);
  if (!relativePath || relativePath.includes('?') || relativePath.includes('#') || relativePath.includes('/') || relativePath.includes('\\')) return;
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'file:' || parsed.hostname || parsed.search || parsed.hash || parsed.href !== uri) return;
    const decoded = decodeURIComponent(relativePath);
    if (!decoded || decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\') || /[\u0000-\u001f\u007f]/.test(decoded)) return;
    if (decodeURIComponent(decoded) !== decoded) return;
    const file = new File(uri);
    if (file.uri !== uri) return;
    if (file.exists) file.delete();
  } catch {
    // Only a canonical, single-name DocumentPicker cache URI is owned here.
  }
}

/** Pick, validate, and merge a complete Play ZIP backup without replacing existing clips or boards. */
export async function importPlayBackup(signal?: AbortSignal): Promise<PlayBackupImportResult | null> {
  abort(signal);
  let archive: File | undefined;
  let cacheUri: string | undefined;
  let stagedDirectory: Directory | undefined;
  try {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/x-zip-compressed'], multiple: false, copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) { abort(signal); return null; }
    cacheUri = picked.assets[0].uri;
    archive = new File(cacheUri);
    abort(signal);
    const { manifest, staged, stage } = await unpackZip(archive, signal);
    stagedDirectory = stage;
  const existingClips = loadLocalClips();
  const currentBoards = loadBoards();
  const currentPresentations = loadClipPresentations();
  const currentPlayback = loadClipPlaybackPreferences();
  const existing = {
    clips: parseClipCatalog({ version: 1, clips: existingClips }).clips,
    boards: currentBoards, presentations: currentPresentations, playback: currentPlayback,
    preferences: loadPlayPreferences(), importedClipIds: [],
  };
  const merged = mergePlayBackup(existing, manifest);
  const prepared = prepareImportedClips(merged.clips.filter((clip) => merged.importedClipIds.includes(clip.id)));
  const existingArtworkNames = new Set(Object.values(currentPresentations).map((entry) => entry.artwork?.fileName).filter((name): name is string => Boolean(name)));
  const copied: File[] = [];
  const copiedArtwork: File[] = [];
  try {
    PLAY_LIBRARY_DIRECTORY.create({ intermediates: true, idempotent: true });
    ARTWORK_DIRECTORY.create({ intermediates: true, idempotent: true });
    const neededNames = new Set<string>();
    for (const id of merged.importedClipIds) {
      const presentation = merged.presentations[id];
      if (presentation?.artwork && !existingArtworkNames.has(presentation.artwork.fileName)) neededNames.add(presentation.artwork.fileName);
    }
    const neededFiles = manifest.files.filter((entry) => (entry.kind === 'audio' && merged.importedClipIds.includes(entry.name.slice(0, 36))) || neededNames.has(entry.name));
    for (const entry of neededFiles) {
      abort(signal);
      const source = staged.get(entry.name);
      if (!source) throw new Error(`Backup file ${entry.name} is missing.`);
      const target = entry.kind === 'audio'
        ? new File(PLAY_LIBRARY_DIRECTORY, entry.name)
        : new File(ARTWORK_DIRECTORY, entry.name);
      if (target.exists) throw new Error(`A private file named ${entry.name} already exists. The import was stopped to protect it.`);
      await copyVerified(source, target as unknown as TransferFile, entry, signal);
      if (entry.kind === 'audio') copied.push(target); else copiedArtwork.push(target);
    }
    abort(signal);
    const nextCatalog = parseClipCatalog({ version: 1, clips: [...existing.clips, ...prepared.entries] });
    writeSnapshotTransaction([
      { name: 'boards.json', value: merged.boards, parse: parseBoardCollection },
      { name: 'presentation.json', value: { version: 1, clips: merged.presentations }, parse: parsePresentations },
      { name: 'clip-playback.json', value: { version: 1, clips: merged.playback }, parse: (value) => ({ version: 1, clips: parseClipPlaybackPreferences(value) }) },
      { name: 'preferences.json', value: merged.preferences, parse: parsePlayPreferences },
      { name: 'catalog.json', value: nextCatalog, parse: parseClipCatalog },
    ]);
    try { stage.delete(); } catch { /* cache cleanup does not affect a committed restore */ }
    return { imported: prepared.entries.length, skipped: manifest.clips.length - prepared.entries.length, boardsAdded: merged.boards.boards.length - currentBoards.boards.length };
  } catch (error) {
    // Once the transaction journal is durable, recovery owns these copied files
    // and will roll all metadata forward before any store can be read.
    if (!hasPendingSnapshotTransaction()) {
      for (const file of [...copied, ...copiedArtwork]) {
        try { if (file.exists) file.delete(); } catch { /* preserve the primary import error */ }
      }
    }
    throw error;
  }
  } catch (error) {
    throw error;
  } finally {
    try { if (stagedDirectory?.exists) stagedDirectory.delete(); } catch { /* cache cleanup must not mask restore results */ }
    if (cacheUri) removeDocumentPickerCacheFile(cacheUri);
  }
}
