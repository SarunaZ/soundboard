import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { prepareGalleryArtwork, type DraftArtwork } from '../media/artwork';

/** Open Android's system photo picker and stage a compressed, app-cache thumbnail. */
export async function pickGalleryArtwork(): Promise<DraftArtwork | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    allowsMultipleSelection: false,
    quality: 1,
    legacy: false,
  });
  if (picked.canceled) return null;
  const asset = picked.assets[0];
  if (!asset) throw new Error('The selected image could not be read. Choose it again.');
  try {
    return await prepareGalleryArtwork(asset.uri, asset.fileName ?? 'Gallery image', {
      mimeType: asset.mimeType, width: asset.width, height: asset.height, fileSize: asset.fileSize,
    });
  } finally { removeOwnedImagePickerCacheFile(asset.uri); }
}

function removeOwnedImagePickerCacheFile(uri: string): void {
  const prefix = `${Paths.cache.uri.replace(/\/+$/, '')}/ImagePicker/`;
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'file:' || parsed.href !== uri) return;
    if (!uri.startsWith(prefix)) return;
    const relative = uri.slice(prefix.length);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpe?g|png|webp|gif|bmp)$/i.test(relative)) return;
    const file = new File(uri);
    if (file.uri === uri && file.exists) file.delete();
  } catch { /* Cleanup must not turn a usable draft into a failed selection. */ }
}
