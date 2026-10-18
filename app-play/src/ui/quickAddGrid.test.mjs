import assert from 'node:assert/strict';
import test from 'node:test';
import { clearPadModel, addClipToBoardModel, emptyBoardCollection, reorderPadModel } from '../data/boardModel.ts';
import { gridIndexAtPoint } from '../../../app-client/src/board/reorderGeometry.ts';
import { gridIndexToPadIndex, gridItemCountWithQuickAdd } from './quickAddGrid.ts';

const clipId = (number) => `${String(number).padStart(8, '0')}-dddd-4ddd-8ddd-dddddddddddd`;
const makeFullBoard = (count = 20) => {
  let board = emptyBoardCollection();
  const boardId = board.activeBoardId;
  for (let number = 1; number <= count; number += 1) board = addClipToBoardModel(board, clipId(number), boardId);
  return board;
};

test('full-board Quick add appends without replacing saved pads and always retains its leading slot', () => {
  const full = makeFullBoard();
  const boardId = full.activeBoardId;
  const before = full.boards[0].pads;
  assert.equal(before.length, 20);
  const after = addClipToBoardModel(full, clipId(21), boardId);
  assert.equal(after.boards[0].pads.length, 21);
  assert.deepEqual(after.boards[0].pads.slice(0, 20), before, 'saved order, IDs, and assignments stay intact');
  assert.equal(after.boards[0].pads[20].clipId, clipId(21));
  assert.equal(gridItemCountWithQuickAdd(after.boards[0].pads.length), 22);
  assert.equal(gridIndexToPadIndex(0), null, 'the first rendered cell is the action, not a pad');
  assert.equal(gridIndexToPadIndex(1), 0, 'the next rendered cell maps to the first saved pad');
});

test('board-only Quick add fills a cleared hole without shifting other saved records', () => {
  const full = makeFullBoard();
  const boardId = full.activeBoardId;
  const holeId = full.boards[0].pads[7].id;
  const withHole = clearPadModel(full, boardId, holeId);
  const filled = addClipToBoardModel(withHole, clipId(21), boardId);
  assert.equal(filled.boards[0].pads.length, 20);
  assert.deepEqual(filled.boards[0].pads.map(({ id }) => id), withHole.boards[0].pads.map(({ id }) => id));
  assert.equal(filled.boards[0].pads[7].clipId, clipId(21));
});

test('reorder destinations include the leading action cell in grid geometry, then exclude it from pads', () => {
  const state = makeFullBoard(8);
  const board = state.boards[0];
  const reordered = reorderPadModel(state, board.id, board.pads[0].id, board.pads[4].id);
  const metrics = { width: 400, scrollOffset: 0, itemCount: gridItemCountWithQuickAdd(reordered.boards[0].pads.length), columns: 4, gap: 10, padding: 0, itemHeight: 90 };
  const actionGridIndex = gridIndexAtPoint({ x: 46, y: 45 }, metrics);
  const nextRowFirstPadGridIndex = gridIndexAtPoint({ x: 46, y: 145 }, metrics);
  assert.equal(actionGridIndex, 0);
  assert.equal(gridIndexToPadIndex(actionGridIndex), null);
  assert.equal(gridIndexToPadIndex(nextRowFirstPadGridIndex), 3, 'slot arithmetic remains correct across a row boundary');
  assert.deepEqual(reordered.boards[0].pads.map(({ id }) => id).slice(0, 5), [board.pads[1].id, board.pads[2].id, board.pads[3].id, board.pads[4].id, board.pads[0].id]);
});
