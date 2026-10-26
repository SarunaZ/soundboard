import { generatedClipId, parseClipCatalog, type SavedClip } from '../data/catalog.ts';
import type { BoardCollection } from '../data/boardModel.ts';
import type { ClipPlaybackPreferences } from '../data/clipPlayback.ts';
import type { ClipPresentation } from '../data/presentation.ts';
import type { PlayPreferences } from '../data/preferences.ts';

export interface BackupMergeInput {
  clips: SavedClip[];
  boards: BoardCollection;
  presentations: Record<string, ClipPresentation>;
  playback: ClipPlaybackPreferences;
  preferences: PlayPreferences;
}
export interface BackupMergeResult extends BackupMergeInput { importedClipIds: string[] }

/** Merge by stable IDs. Existing clip data wins; conflicting board IDs are remapped. */
export function mergePlayBackup(existing: BackupMergeInput, backup: BackupMergeInput): BackupMergeResult {
  const currentIds = new Set(existing.clips.map(({ id }) => id));
  const imported = backup.clips.filter(({ id }) => !currentIds.has(id));
  const clips = parseClipCatalog({ version: 1, clips: [...existing.clips, ...imported] }).clips;
  const boardIds = new Set(existing.boards.boards.map(({ id }) => id));
  const fingerprint = (board: BoardCollection['boards'][number]) => JSON.stringify({ ...board, id: undefined });
  const newBoards = backup.boards.boards.flatMap((board) => {
    if (existing.boards.boards.some((current) => fingerprint(current) === fingerprint(board))) return [];
    if (!boardIds.has(board.id)) { boardIds.add(board.id); return [board]; }
    let id: string;
    do { id = generatedClipId(); } while (boardIds.has(id));
    boardIds.add(id);
    return [{ ...board, id }];
  });
  const boards: BoardCollection = { ...existing.boards, boards: [...existing.boards.boards, ...newBoards] };
  const presentations = { ...backup.presentations, ...existing.presentations };
  const playback = { ...backup.playback, ...existing.playback };
  return { clips, boards, presentations, playback, preferences: {
    ...backup.preferences,
    nextPadColorIndex: Math.max(existing.preferences.nextPadColorIndex, backup.preferences.nextPadColorIndex),
  }, importedClipIds: imported.map(({ id }) => id) };
}
