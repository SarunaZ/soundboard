// Reuse the proven, pure v1 catalog and title validation from Dev. Play passes
// a Play-local directory to its storage adapter, so this creates no data link.
export {
  appendClip,
  generatedClipId,
  normalizeClipTitle,
  parseClipCatalog,
  removeClip,
  renameClip,
} from '../../../app-client/src/editor/catalog.ts';
export type { AudioExtension, ClipCatalog, SavedClip } from '../../../app-client/src/editor/catalog.ts';
