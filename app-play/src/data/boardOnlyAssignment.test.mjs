import assert from 'node:assert/strict';
import test from 'node:test';
import { addClipToBoardModel, emptyBoardCollection } from './boardModel.ts';

const clipId = (number) => `${String(number).padStart(8, '0')}-dddd-4ddd-8ddd-dddddddddddd`;

test('board-only assignment fills a saved hole and appends when all saved pads are occupied', () => {
  let state = emptyBoardCollection();
  const boardId = state.activeBoardId;
  for (let number = 1; number <= 20; number += 1) {
    state = addClipToBoardModel(state, clipId(number), boardId);
  }
  const fullBoard = state.boards[0];
  assert.equal(fullBoard.pads.length, 20);
  assert.ok(fullBoard.pads.every((pad) => pad.clipId !== null));

  const appended = addClipToBoardModel(state, clipId(21), boardId);
  assert.equal(appended.boards[0].pads.length, 21);
  assert.deepEqual(appended.boards[0].pads.slice(0, 20), fullBoard.pads);
  assert.equal(appended.boards[0].pads[20].clipId, clipId(21));

  const holeState = { ...state, boards: [{ ...fullBoard, pads: fullBoard.pads.map((pad, index) => index === 7 ? { ...pad, clipId: null } : pad) }] };
  const filled = addClipToBoardModel(holeState, clipId(22), boardId);
  assert.equal(filled.boards[0].pads.length, 20);
  assert.equal(filled.boards[0].pads[7].clipId, clipId(22));
});
