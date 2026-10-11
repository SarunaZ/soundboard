import type { AudioExtension } from './catalog';

export const MAX_DEVICE_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_DEVICE_IMPORT_MS = 60_000;

const EXTENSIONS = new Set<AudioExtension>(['mp3', 'm4a', 'wav', 'aac']);
const MIME_EXTENSIONS: Readonly<Record<string, AudioExtension>> = {
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/vnd.wave': 'wav',
  'audio/x-aac': 'aac',
};

export function audioExtensionFromMetadata(fileName: string, mimeType: string | null | undefined): AudioExtension {
  const suffix = /\.([a-z0-9]+)$/i.exec(fileName.trim())?.[1]?.toLowerCase();
  if (suffix) {
    if (EXTENSIONS.has(suffix as AudioExtension)) return suffix as AudioExtension;
    throw new Error('Choose an MP3, M4A, WAV, or AAC audio file.');
  }
  const mime = mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  const extension = mime ? MIME_EXTENSIONS[mime] : undefined;
  if (extension) return extension;
  throw new Error('Choose an MP3, M4A, WAV, or AAC audio file.');
}

export function validateDeviceImportSize(size: number | null | undefined): asserts size is number {
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) {
    throw new Error('The selected file has an unknown or empty size.');
  }
  if (size > MAX_DEVICE_IMPORT_BYTES) throw new Error('Audio files must be 10 MB or smaller.');
}

export function validateDeviceImportDuration(durationMs: number): number {
  if (!Number.isInteger(durationMs) || durationMs <= 0 || durationMs > MAX_DEVICE_IMPORT_MS) {
    throw new Error('Audio files must be longer than 0 and no more than 60 seconds.');
  }
  return durationMs;
}

export function importTitleFromFilename(fileName: string): string {
  const basename = fileName.split(/[\\/]/).at(-1)?.trim() ?? '';
  const withoutExtension = basename.replace(/\.[^.]+$/, '').trim();
  if (!withoutExtension || /^\d{1,12}$/.test(withoutExtension)) return 'Imported sound';
  return withoutExtension.slice(0, 100) || 'Imported sound';
}
