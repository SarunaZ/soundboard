import { File } from 'expo-file-system';

import { PLAY_LIBRARY_DIRECTORY, emptyOrRecoveredSnapshot, writeSnapshot } from './snapshot.ts';
import {
  addClipToBoardModel,
  clearPadModel,
  createBoardModel,
  emptyBoardCollection,
  movePadModel,
  parseBoardCollection,
  removeClipAssignmentsModel,
  reorderPadModel,
  renamePadModel,
  selectBoardModel,
  type Board,
  type BoardCollection,
} from './boardModel.ts';

export type { Board, BoardCollection, BoardPad } from './boardModel';

const COLLECTION_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'boards.json');
const BACKUP_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'boards.backup.json');
function nextBoardsFile(): File {
  return new File(PLAY_LIBRARY_DIRECTORY, 'boards.next.json');
}

function readBoards(): BoardCollection {
  return emptyOrRecoveredSnapshot(COLLECTION_FILE, BACKUP_FILE, emptyBoardCollection, parseBoardCollection);
}

export function loadBoards(): BoardCollection {
  return readBoards();
}

export function saveBoards(collection: BoardCollection): BoardCollection {
  return writeSnapshot(collection, parseBoardCollection, COLLECTION_FILE, BACKUP_FILE, nextBoardsFile());
}

export function createBoard(name: string): Board {
  const next = createBoardModel(readBoards(), name);
  saveBoards(next);
  return next.boards.find(({ id }) => id === next.activeBoardId)!;
}

export function selectBoard(boardId: string): BoardCollection {
  return saveBoards(selectBoardModel(readBoards(), boardId));
}

export function addClipToBoard(clipId: string, boardId?: string, padId?: string): BoardCollection {
  const current = readBoards();
  return saveBoards(addClipToBoardModel(current, clipId, boardId ?? current.activeBoardId, padId));
}

export function clearPad(boardId: string, padId: string): BoardCollection {
  return saveBoards(clearPadModel(readBoards(), boardId, padId));
}

export function renamePad(boardId: string, padId: string, label?: string): BoardCollection {
  return saveBoards(renamePadModel(readBoards(), boardId, padId, label));
}

export function reorderPad(boardId: string, padId: string, targetPadId: string): BoardCollection {
  return saveBoards(reorderPadModel(readBoards(), boardId, padId, targetPadId));
}

export function movePad(fromBoardId: string, fromPadId: string, toBoardId: string, toPadId?: string): BoardCollection {
  return saveBoards(movePadModel(readBoards(), fromBoardId, fromPadId, toBoardId, toPadId));
}

export function removeClipAssignments(clipId: string, collection = readBoards()): BoardCollection {
  return removeClipAssignmentsModel(collection, clipId);
}

export type BoardPreferencePatch = Partial<Pick<Board, 'grid' | 'navigation' | 'allowOverlap'>>;

export function setBoardPreferences(boardId: string, patch: BoardPreferencePatch): BoardCollection {
  const current = readBoards();
  if (!current.boards.some((board) => board.id === boardId)) throw new Error('The selected board no longer exists.');
  return saveBoards({ ...current, boards: current.boards.map((board) => board.id === boardId ? { ...board, ...patch } : board) });
}
