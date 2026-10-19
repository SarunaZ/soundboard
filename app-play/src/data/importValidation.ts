import { audioExtensionFromMetadata } from '../../../app-client/src/editor/importValidation.ts';
export { audioExtensionFromMetadata, importTitleFromFilename } from '../../../app-client/src/editor/importValidation.ts';

export type AudioSourceExtension = ReturnType<typeof audioSourceExtensionFromMetadata>;

/** MP4/MOV sources are staged with an MP4 suffix so the bundled FFmpeg audio decoder can extract their audio stream. */
export function audioSourceExtensionFromMetadata(fileName: string, mimeType: string | null | undefined): 'mp3' | 'm4a' | 'wav' | 'aac' | 'mp4' {
  const suffix = /\.([a-z0-9]+)$/i.exec(fileName.trim())?.[1]?.toLowerCase();
  if (suffix === 'mp4' || suffix === 'mov') return 'mp4';
  if (suffix) return audioExtensionFromMetadata(fileName, mimeType);
  const mime = mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  if (mime === 'video/mp4' || mime === 'video/quicktime') return 'mp4';
  return audioExtensionFromMetadata(fileName, mimeType);
}
