import { MAX_SOUNDBITES } from '../../../app-client/src/limits.ts';
import { generatedClipId, normalizeClipTitle } from './catalog.ts';
import { isUuid } from './protocol.ts';

export const MAX_PLAY_BOARDS = 100;
export const MAX_BOARD_NAME_LENGTH = 40;
const EMPTY_BOARD_ID = '00000000-0000-4000-8000-000000000001';

export interface BoardPad {
  id: string;
  clipId: string | null;
  label?: string;
  color?: string;
}

export interface Board {
  id: string;
  name: string;
  pads: BoardPad[];
  grid: '3x4' | '4x4';
  navigation: 'pages' | 'scroll';
  allowOverlap: boolean;
}

export interface BoardCollection {
  version: 1;
  activeBoardId: string;
  boards: Board[];
}

function initialPads(count = 16): BoardPad[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    clipId: null,
  }));
}

export function emptyBoardCollection(): BoardCollection {
  const board: Board = { id: EMPTY_BOARD_ID, name: 'Main', pads: initialPads(), grid: '4x4', navigation: 'pages', allowOverlap: false };
  return { version: 1, activeBoardId: board.id, boards: [board] };
}

function cleanBoardName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Board names must be text.');
  const name = value.trim();
  if (!name) throw new Error('Give this board a name.');
  if (name.length > MAX_BOARD_NAME_LENGTH) throw new Error(`Board names must be ${MAX_BOARD_NAME_LENGTH} characters or fewer.`);
  return name;
}

function parsePad(value: unknown, boardIndex: number, padIndex: number): BoardPad {
  if (!value || typeof value !== 'object') throw new Error(`Board ${boardIndex + 1}, pad ${padIndex + 1} is invalid.`);
  const row = value as Record<string, unknown>;
  if (!isUuid(row.id) || (row.clipId !== null && !isUuid(row.clipId))) {
    throw new Error(`Board ${boardIndex + 1}, pad ${padIndex + 1} has an invalid ID.`);
  }
  if (row.label !== undefined && (typeof row.label !== 'string' || !row.label.trim() || row.label.length > 100)) {
    throw new Error(`Board ${boardIndex + 1}, pad ${padIndex + 1} has an invalid label.`);
  }
  if (row.color !== undefined && (typeof row.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(row.color))) {
    throw new Error(`Board ${boardIndex + 1}, pad ${padIndex + 1} has an invalid color.`);
  }
  return {
    id: row.id,
    clipId: row.clipId,
    ...(row.label === undefined ? {} : { label: row.label }),
    ...(row.color === undefined ? {} : { color: row.color }),
  } as BoardPad;
}

export function parseBoardCollection(value: unknown): BoardCollection {
  if (!value || typeof value !== 'object') throw new Error('The Play board collection is unreadable.');
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || !Array.isArray(row.boards) || row.boards.length < 1 || row.boards.length > MAX_PLAY_BOARDS) {
    throw new Error('The Play board collection has an unsupported format.');
  }
  const boards = row.boards.map((value, boardIndex): Board => {
    if (!value || typeof value !== 'object') throw new Error(`Board ${boardIndex + 1} is invalid.`);
    const board = value as Record<string, unknown>;
    if (!isUuid(board.id) || typeof board.name !== 'string' || !board.name.trim() || board.name.length > MAX_BOARD_NAME_LENGTH ||
        !Array.isArray(board.pads) || board.pads.length > MAX_SOUNDBITES) {
      throw new Error(`Board ${boardIndex + 1} is invalid.`);
    }
    const pads = board.pads.map((pad, padIndex) => parsePad(pad, boardIndex, padIndex));
    if (new Set(pads.map(({ id }) => id)).size !== pads.length) throw new Error(`Board ${boardIndex + 1} has duplicate pad IDs.`);
    const grid = board.grid === undefined ? '4x4' : board.grid;
    const navigation = board.navigation === undefined ? 'pages' : board.navigation;
    const allowOverlap = board.allowOverlap === undefined ? false : board.allowOverlap;
    if (grid !== '3x4' && grid !== '4x4') throw new Error(`Board ${boardIndex + 1} has an invalid grid size.`);
    if (navigation !== 'pages' && navigation !== 'scroll') throw new Error(`Board ${boardIndex + 1} has an invalid navigation mode.`);
    if (typeof allowOverlap !== 'boolean') throw new Error(`Board ${boardIndex + 1} has an invalid overlap preference.`);
    return { id: board.id, name: board.name, pads, grid, navigation, allowOverlap };
  });
  if (new Set(boards.map(({ id }) => id)).size !== boards.length) throw new Error('The Play board collection has duplicate board IDs.');
  if (typeof row.activeBoardId !== 'string' || !boards.some(({ id }) => id === row.activeBoardId)) {
    throw new Error('The Play board collection has an invalid active board.');
  }
  return { version: 1, activeBoardId: row.activeBoardId, boards };
}

export function createBoardModel(collection: BoardCollection, name: string): BoardCollection {
  const state = parseBoardCollection(collection);
  if (state.boards.length >= MAX_PLAY_BOARDS) throw new Error(`You can create up to ${MAX_PLAY_BOARDS} boards.`);
  const cleanName = cleanBoardName(name);
  const board = { id: generatedClipId(), name: cleanName, pads: initialPads(), grid: '4x4' as const, navigation: 'pages' as const, allowOverlap: false };
  return parseBoardCollection({ ...state, activeBoardId: board.id, boards: [...state.boards, board] });
}

export function selectBoardModel(collection: BoardCollection, boardId: string): BoardCollection {
  const state = parseBoardCollection(collection);
  if (!state.boards.some(({ id }) => id === boardId)) throw new Error('The selected board no longer exists.');
  return { ...state, activeBoardId: boardId };
}

function getBoard(state: BoardCollection, boardId: string): Board {
  const board = state.boards.find(({ id }) => id === boardId);
  if (!board) throw new Error('The selected board no longer exists.');
  return board;
}

export function addClipToBoardModel(collection: BoardCollection, clipId: string, boardId = collection.activeBoardId, padId?: string): BoardCollection {
  const state = parseBoardCollection(collection);
  if (!isUuid(clipId)) throw new Error('Invalid local clip ID.');
  const board = getBoard(state, boardId);
  let pads = board.pads;
  if (padId !== undefined) {
    if (!isUuid(padId) || !pads.some((pad) => pad.id === padId)) throw new Error('The selected pad no longer exists.');
    pads = pads.map((pad) => pad.id === padId ? { ...pad, clipId } : pad);
  } else {
    const emptyIndex = pads.findIndex((pad) => pad.clipId === null);
    if (emptyIndex >= 0) pads = pads.map((pad, index) => index === emptyIndex ? { ...pad, clipId } : pad);
    else {
      if (pads.length >= MAX_SOUNDBITES) throw new Error(`The board is full. It can hold up to ${MAX_SOUNDBITES} soundbites.`);
      pads = [...pads, { id: generatedClipId(), clipId }];
    }
  }
  return parseBoardCollection({ ...state, boards: state.boards.map((candidate) => candidate.id === boardId ? { ...candidate, pads } : candidate) });
}

export function clearPadModel(collection: BoardCollection, boardId: string, padId: string): BoardCollection {
  const state = parseBoardCollection(collection);
  const board = getBoard(state, boardId);
  if (!board.pads.some((pad) => pad.id === padId)) return state;
  const pads = board.pads.map((pad) => pad.id === padId ? { ...pad, clipId: null, label: undefined } : pad);
  return parseBoardCollection({ ...state, boards: state.boards.map((candidate) => candidate.id === boardId ? { ...candidate, pads } : candidate) });
}

export function renamePadModel(collection: BoardCollection, boardId: string, padId: string, label?: string): BoardCollection {
  const state = parseBoardCollection(collection);
  const board = getBoard(state, boardId);
  if (!board.pads.some((pad) => pad.id === padId)) throw new Error('The selected pad no longer exists.');
  let cleanLabel: string | undefined;
  if (label !== undefined) {
    cleanLabel = normalizeClipTitle(label);
    if (cleanLabel.length > 100) throw new Error('Pad names must be 100 characters or fewer.');
  }
  const pads = board.pads.map((pad) => {
    if (pad.id !== padId) return pad;
    const { label: _oldLabel, ...rest } = pad;
    return cleanLabel === undefined ? rest : { ...rest, label: cleanLabel };
  });
  return parseBoardCollection({ ...state, boards: state.boards.map((candidate) => candidate.id === boardId ? { ...candidate, pads } : candidate) });
}

export function reorderPadModel(collection: BoardCollection, boardId: string, padId: string, targetPadId: string): BoardCollection {
  const state = parseBoardCollection(collection);
  const board = getBoard(state, boardId);
  const sourceIndex = board.pads.findIndex((pad) => pad.id === padId);
  if (sourceIndex < 0) throw new Error('The selected pad no longer exists.');
  const targetIndex = board.pads.findIndex((pad) => pad.id === targetPadId);
  if (targetIndex < 0) throw new Error('The destination pad no longer exists.');
  if (sourceIndex === targetIndex) return state;

  const pads = [...board.pads];
  const [source] = pads.splice(sourceIndex, 1);
  pads.splice(targetIndex, 0, source!);
  return parseBoardCollection({
    ...state,
    boards: state.boards.map((candidate) => candidate.id === boardId ? { ...candidate, pads } : candidate),
  });
}

export function movePadModel(collection: BoardCollection, fromBoardId: string, fromPadId: string, toBoardId: string, toPadId?: string): BoardCollection {
  const state = parseBoardCollection(collection);
  const sourceBoard = getBoard(state, fromBoardId);
  const source = sourceBoard.pads.find((pad) => pad.id === fromPadId);
  if (!source) throw new Error('The source pad no longer exists.');
  if (source.clipId === null) throw new Error('The source pad is empty.');
  const destinationBoard = getBoard(state, toBoardId);
  let targetIndex = toPadId === undefined ? destinationBoard.pads.findIndex((pad) => pad.clipId === null) : destinationBoard.pads.findIndex((pad) => pad.id === toPadId);
  if (toPadId !== undefined && targetIndex < 0) throw new Error('The destination pad no longer exists.');
  let destinationPads = destinationBoard.pads;
  if (targetIndex < 0) {
    if (destinationPads.length >= MAX_SOUNDBITES) throw new Error(`The destination board is full. It can hold up to ${MAX_SOUNDBITES} soundbites.`);
    targetIndex = destinationPads.length;
    destinationPads = [...destinationPads, { id: generatedClipId(), clipId: null }];
  }
  if (destinationPads[targetIndex]!.clipId !== null) throw new Error('The destination pad is occupied.');
  const targetPadId = destinationPads[targetIndex]!.id;
  destinationPads = destinationPads.map((pad) => pad.id === targetPadId ? { ...source, id: targetPadId } : pad);
  const sourcePads = sourceBoard.pads.map((pad) => pad.id === fromPadId ? { ...pad, clipId: null, label: undefined } : pad);
  const boards = state.boards.map((board) => {
    if (fromBoardId === toBoardId && board.id === fromBoardId) {
      const sameBoardPads = destinationPads.map((pad) => {
        if (pad.id === fromPadId) return { ...pad, clipId: null, label: undefined };
        return pad.id === targetPadId ? { ...source, id: targetPadId } : pad;
      });
      return { ...board, pads: sameBoardPads };
    }
    if (board.id === fromBoardId) return { ...board, pads: sourcePads };
    if (board.id === toBoardId) return { ...board, pads: destinationPads };
    return board;
  });
  return parseBoardCollection({ ...state, boards });
}

export function removeClipAssignmentsModel(collection: BoardCollection, clipId: string): BoardCollection {
  const state = parseBoardCollection(collection);
  if (!isUuid(clipId)) throw new Error('Invalid local clip ID.');
  return parseBoardCollection({
    ...state,
    boards: state.boards.map((board) => ({
      ...board,
      pads: board.pads.map((pad) => pad.clipId === clipId ? { ...pad, clipId: null, label: undefined } : pad),
    })),
  });
}
