import { File } from 'expo-file-system';

import { PLAY_LIBRARY_DIRECTORY, emptyOrRecoveredSnapshot, registerSnapshotParser, writeSnapshot } from './snapshot.ts';
import {
  addClipToBoardModel,
  clearPadModel,
  createBoardModel,
  deleteBoardModel,
  emptyBoardCollection,
  movePadModel,
  parseBoardCollection,
  removeClipAssignmentsModel,
  reorderPadModel,
  reorderBoardModel,
  renameBoardModel,
  renamePadModel,
  selectBoardModel,
  setBoardPreferencesModel,
  type Board,
  type BoardCollection,
  type BoardPreferencePatch,
} from './boardModel.ts';

export type { Board, BoardCollection, BoardPad, BoardPreferencePatch } from './boardModel';

const COLLECTION_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'boards.json');
const BACKUP_FILE = new File(PLAY_LIBRARY_DIRECTORY, 'boards.backup.json');
registerSnapshotParser('boards.json', parseBoardCollection);
function nextBoardsFile(): File {
  return new File(PLAY_LIBRARY_DIRECTORY, 'boards.next.json');
}

function readBoards(): BoardCollection {
  return emptyOrRecoveredSnapshot(COLLECTION_FILE, BACKUP_FILE, emptyBoardCollection, parseBoardCollection, nextBoardsFile());
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

export function renameBoard(boardId: string, name: string): BoardCollection {
  return saveBoards(renameBoardModel(readBoards(), boardId, name));
}

export function deleteBoard(boardId: string): BoardCollection {
  return saveBoards(deleteBoardModel(readBoards(), boardId));
}

export function reorderBoard(boardId: string, targetBoardId: string): BoardCollection {
  return saveBoards(reorderBoardModel(readBoards(), boardId, targetBoardId));
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

export function setBoardPreferences(boardId: string, patch: BoardPreferencePatch): BoardCollection {
  return saveBoards(setBoardPreferencesModel(readBoards(), boardId, patch));
}
