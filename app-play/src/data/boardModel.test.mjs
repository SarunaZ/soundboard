import assert from 'node:assert/strict';
import test from 'node:test';

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
} from './boardModel.ts';

const clipA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const clipB = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

test('Play begins with one stable empty Main board and explicitly empty pads', () => {
  const initial = emptyBoardCollection();
  assert.equal(initial.boards.length, 1);
  assert.equal(initial.activeBoardId, initial.boards[0].id);
  assert.equal(initial.boards[0].name, 'Main');
  assert.deepEqual({ grid: initial.boards[0].grid, navigation: initial.boards[0].navigation, scrollbarSide: initial.boards[0].scrollbarSide, allowOverlap: initial.boards[0].allowOverlap }, { grid: '4x4', navigation: 'pages', scrollbarSide: 'right', allowOverlap: false });
  assert.equal(initial.boards[0].pads.length, 16);
  assert.ok(initial.boards[0].pads.every((pad) => pad.clipId === null));
  assert.deepEqual(emptyBoardCollection(), initial);
});

test('legacy board snapshots migrate to safe layout defaults and preferences survive model operations', () => {
  const current = emptyBoardCollection();
  const legacy = structuredClone(current);
  delete legacy.boards[0].grid;
  delete legacy.boards[0].navigation;
  delete legacy.boards[0].allowOverlap;
  delete legacy.boards[0].scrollbarSide;
  const migrated = parseBoardCollection(legacy);
  assert.deepEqual({ grid: migrated.boards[0].grid, navigation: migrated.boards[0].navigation, scrollbarSide: migrated.boards[0].scrollbarSide, allowOverlap: migrated.boards[0].allowOverlap }, { grid: '4x4', navigation: 'pages', scrollbarSide: 'right', allowOverlap: false });
  const customized = parseBoardCollection({ ...migrated, boards: [{ ...migrated.boards[0], grid: '3x4', navigation: 'scroll', allowOverlap: true }] });
  const changed = addClipToBoardModel(customized, clipA);
  assert.deepEqual({ grid: changed.boards[0].grid, navigation: changed.boards[0].navigation, allowOverlap: changed.boards[0].allowOverlap }, { grid: '3x4', navigation: 'scroll', allowOverlap: true });
  assert.throws(() => parseBoardCollection({ ...customized, boards: [{ ...customized.boards[0], grid: '5x5' }] }), /grid size/);
});

test('board page index migrates from legacy snapshots and remains independent across boards and JSON round trips', () => {
  const legacy = emptyBoardCollection();
  delete legacy.boards[0].pageIndex;
  const migrated = parseBoardCollection(legacy);
  assert.equal(migrated.boards[0].pageIndex, 0);

  const secondBoard = createBoardModel(migrated, 'Second');
  const firstId = migrated.activeBoardId;
  const secondId = secondBoard.activeBoardId;
  const pageState = setBoardPreferencesModel(secondBoard, firstId, { pageIndex: 2 });
  const independent = setBoardPreferencesModel(pageState, secondId, { pageIndex: 5 });
  const restored = parseBoardCollection(JSON.parse(JSON.stringify(independent)));
  assert.equal(restored.boards.find((board) => board.id === firstId).pageIndex, 2);
  assert.equal(restored.boards.find((board) => board.id === secondId).pageIndex, 5);
  assert.equal(restored.activeBoardId, secondId);
  assert.throws(() => setBoardPreferencesModel(independent, firstId, { pageIndex: -1 }), /page index/);
  assert.throws(() => setBoardPreferencesModel(independent, firstId, { pageIndex: 1.5 }), /page index/);
});

test('scrollbar side defaults right, persists independently per board, and rejects invalid values', () => {
  const legacy = emptyBoardCollection();
  delete legacy.boards[0].scrollbarSide;
  const migrated = parseBoardCollection(legacy);
  assert.equal(migrated.boards[0].scrollbarSide, 'right');
  const second = createBoardModel(migrated, 'Second');
  const firstId = migrated.activeBoardId;
  const secondId = second.activeBoardId;
  const leftFirst = setBoardPreferencesModel(second, firstId, { scrollbarSide: 'left' });
  const independent = setBoardPreferencesModel(leftFirst, secondId, { scrollbarSide: 'right' });
  const restored = parseBoardCollection(JSON.parse(JSON.stringify(independent)));
  assert.deepEqual(restored.boards.map(({ scrollbarSide }) => scrollbarSide), ['left', 'right']);
  assert.throws(() => parseBoardCollection({ ...independent, boards: [{ ...independent.boards[0], scrollbarSide: 'top' }, independent.boards[1]] }), /scrollbar side/);
});

test('board create/select and clip assignment preserve the collection and explicit empties', () => {
  const initial = emptyBoardCollection();
  const created = createBoardModel(initial, 'Road trip');
  assert.equal(initial.boards.length, 1, 'model operations do not mutate their input');
  assert.equal(created.boards.length, 2);
  assert.equal(created.activeBoardId, created.boards[1].id);
  const selected = selectBoardModel(created, initial.activeBoardId);
  const assigned = addClipToBoardModel(selected, clipA);
  const main = assigned.boards.find((board) => board.id === initial.activeBoardId);
  assert.equal(main.pads[0].clipId, clipA);
  assert.equal(main.pads[1].clipId, null);
  assert.equal(assigned.activeBoardId, initial.activeBoardId);
});

test('renaming a board trims its name while preserving pads, preferences, other boards, and selection', () => {
  const initial = emptyBoardCollection();
  const boardId = initial.activeBoardId;
  let state = createBoardModel(initial, 'Second');
  state = parseBoardCollection({ ...state, activeBoardId: boardId, boards: state.boards.map((board) => board.id === boardId ? { ...board, grid: '3x4', navigation: 'scroll', allowOverlap: true } : board) });
  state = addClipToBoardModel(state, clipA, boardId);
  state = renamePadModel(state, boardId, state.boards[0].pads[0].id, 'Keep this label');
  const beforeOtherBoard = structuredClone(state.boards[1]);
  const renamed = renameBoardModel(state, boardId, '  Main sounds  ');
  const roundTrip = parseBoardCollection(JSON.parse(JSON.stringify(renamed)));

  assert.equal(roundTrip.activeBoardId, boardId);
  assert.equal(roundTrip.boards[0].name, 'Main sounds');
  assert.deepEqual(roundTrip.boards[0].pads, state.boards[0].pads);
  assert.deepEqual({ grid: roundTrip.boards[0].grid, navigation: roundTrip.boards[0].navigation, allowOverlap: roundTrip.boards[0].allowOverlap }, { grid: '3x4', navigation: 'scroll', allowOverlap: true });
  assert.deepEqual(roundTrip.boards[1], beforeOtherBoard);
  assert.equal(state.boards[0].name, 'Main', 'renaming leaves the input collection unchanged');
});

test('board rename rejects blank, overlong, and missing board names without changing input', () => {
  const state = emptyBoardCollection();
  const before = structuredClone(state);
  assert.throws(() => renameBoardModel(state, state.activeBoardId, '  '), /Give this board a name/);
  assert.throws(() => renameBoardModel(state, state.activeBoardId, 'x'.repeat(41)), /40 characters or fewer/);
  assert.throws(() => renameBoardModel(state, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Renamed'), /board no longer exists/);
  assert.deepEqual(state, before);
});

test('board deletion removes only the selected board, retains clips, and selects a neighboring board safely', () => {
  let state = createBoardModel(emptyBoardCollection(), 'Second');
  const firstId = state.boards[0].id;
  const secondId = state.boards[1].id;
  const clipState = addClipToBoardModel(state, clipA, firstId);
  const activeSecond = selectBoardModel(clipState, secondId);
  const deletedActive = deleteBoardModel(activeSecond, secondId);
  assert.deepEqual(deletedActive.boards.map(({ id }) => id), [firstId]);
  assert.equal(deletedActive.activeBoardId, firstId);
  assert.equal(deletedActive.boards[0].pads[0].clipId, clipA);
  assert.equal(activeSecond.boards.length, 2, 'deletion does not mutate the input');
  assert.throws(() => deleteBoardModel(deletedActive, firstId), /at least one board/);
  assert.throws(() => deleteBoardModel(state, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), /board no longer exists/);
  assert.deepEqual(deleteBoardModel(state, firstId).boards.map(({ id }) => id), [secondId]);
});

test('board reorder moves complete records, persists order, and keeps active selection stable', () => {
  const first = emptyBoardCollection();
  let state = createBoardModel(first, 'Second');
  state = createBoardModel(state, 'Third');
  const [main, second, third] = state.boards;
  state = addClipToBoardModel(state, clipA, second.id);
  const active = selectBoardModel(state, third.id);
  const reordered = reorderBoardModel(active, third.id, main.id);
  assert.deepEqual(reordered.boards.map(({ id }) => id), [third.id, main.id, second.id]);
  assert.equal(reordered.activeBoardId, third.id);
  assert.equal(reordered.boards[2].pads[0].clipId, clipA);
  assert.deepEqual(parseBoardCollection(JSON.parse(JSON.stringify(reordered))), reordered);
  assert.deepEqual(reorderBoardModel(reordered, third.id, third.id), reordered);
  assert.throws(() => reorderBoardModel(reordered, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', main.id), /board no longer exists/);
  assert.throws(() => reorderBoardModel(reordered, third.id, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), /destination board no longer exists/);
});

test('clear and library deletion remove references while retaining each empty pad', () => {
  let state = addClipToBoardModel(emptyBoardCollection(), clipA);
  const main = state.boards[0];
  state = renamePadModel(state, main.id, main.pads[0].id, 'Intro');
  state = clearPadModel(state, main.id, main.pads[0].id);
  assert.equal(state.boards[0].pads[0].clipId, null);
  assert.equal(state.boards[0].pads[0].label, undefined);
  state = addClipToBoardModel(state, clipA, main.id, main.pads[1].id);
  state = removeClipAssignmentsModel(state, clipA);
  assert.ok(state.boards[0].pads.every((pad) => pad.clipId === null));
  assert.equal(state.boards[0].pads.length, 16);
});

test('cross-board move transfers clip and pad overrides in one returned snapshot', () => {
  let state = emptyBoardCollection();
  const sourceBoardId = state.activeBoardId;
  state = addClipToBoardModel(state, clipA, sourceBoardId);
  const sourcePad = state.boards[0].pads[0];
  state = renamePadModel(state, sourceBoardId, sourcePad.id, 'Short name');
  state = addClipToBoardModel(state, clipB, sourceBoardId, state.boards[0].pads[1].id);
  const newBoard = createBoardModel(state, 'Second');
  const destinationBoardId = newBoard.activeBoardId;
  const sourceSnapshot = newBoard.boards[0];
  const result = movePadModel(newBoard, sourceBoardId, sourcePad.id, destinationBoardId);
  assert.equal(result.boards.find((board) => board.id === sourceBoardId).pads[0].clipId, null);
  const moved = result.boards.find((board) => board.id === destinationBoardId).pads[0];
  assert.equal(moved.clipId, clipA);
  assert.equal(moved.label, 'Short name');
  assert.equal(newBoard.boards[0].pads[0].clipId, clipA, 'failed or subsequent moves cannot mutate the old snapshot');
  assert.deepEqual(sourceSnapshot, newBoard.boards[0]);
});

test('occupied targets reject without changing either board; same-board move succeeds to an empty pad', () => {
  let state = addClipToBoardModel(emptyBoardCollection(), clipA);
  const boardId = state.activeBoardId;
  const [source, target] = state.boards[0].pads;
  state = addClipToBoardModel(state, clipB, boardId, target.id);
  const before = structuredClone(state);
  assert.throws(() => movePadModel(state, boardId, source.id, boardId, target.id), /occupied/);
  assert.deepEqual(state, before);
  const moved = movePadModel(state, boardId, source.id, boardId, state.boards[0].pads[2].id);
  assert.equal(moved.boards[0].pads[0].clipId, null);
  assert.equal(moved.boards[0].pads[2].clipId, clipA);
  assert.equal(moved.boards[0].pads[1].clipId, clipB);
});

test('same-board move to append keeps the moved clip and appends exactly one pad', () => {
  let state = emptyBoardCollection();
  const boardId = state.activeBoardId;
  const oldLength = state.boards[0].pads.length;
  const ids = Array.from({ length: oldLength }, (_, i) => `${String(i + 1).padStart(8, '0')}-dddd-4ddd-8ddd-dddddddddddd`);
  ids.forEach((clipId) => { state = addClipToBoardModel(state, clipId, boardId); });
  const sourceId = state.boards[0].pads[0].id;
  const result = movePadModel(state, boardId, sourceId, boardId);
  assert.equal(result.boards[0].pads.length, oldLength + 1);
  assert.equal(result.boards[0].pads[0].clipId, null);
  assert.equal(result.boards[0].pads.at(-1).clipId, ids[0]);
});

test('pad reorder moves the full record to the target original index in either direction', () => {
  const initial = emptyBoardCollection();
  const boardId = initial.activeBoardId;
  const board = initial.boards[0];
  const [a, b, c, d] = board.pads;
  const populated = parseBoardCollection({
    ...initial,
    boards: [{ ...board, pads: [
      { ...a, clipId: clipA, label: 'First', color: '#112233' },
      { ...b, clipId: null, label: 'Empty label', color: '#445566' },
      { ...c, clipId: clipB, label: 'Third', color: '#778899' },
      d,
      ...board.pads.slice(4),
    ] }],
  });
  const before = structuredClone(populated);

  const forward = reorderPadModel(populated, boardId, a.id, c.id);
  assert.deepEqual(forward.boards[0].pads.slice(0, 4).map(({ id }) => id), [b.id, c.id, a.id, d.id]);
  assert.deepEqual(forward.boards[0].pads[2], { ...a, clipId: clipA, label: 'First', color: '#112233' });
  assert.deepEqual(forward.boards[0].pads[0], { ...b, clipId: null, label: 'Empty label', color: '#445566' });

  const backward = reorderPadModel(forward, boardId, d.id, b.id);
  assert.deepEqual(backward.boards[0].pads.slice(0, 4).map(({ id }) => id), [d.id, b.id, c.id, a.id]);
  assert.deepEqual(backward.boards[0].pads[0], d);
  assert.deepEqual(backward.boards[0].pads[3], { ...a, clipId: clipA, label: 'First', color: '#112233' });
  assert.deepEqual(populated, before, 'the input snapshot is unchanged');
});

test('pad reorder round-trips through persisted JSON and retains other boards and active selection', () => {
  const initial = emptyBoardCollection();
  const firstBoardId = initial.activeBoardId;
  const withSecond = createBoardModel(initial, 'Second');
  const secondBoard = withSecond.boards[1];
  const firstBoard = withSecond.boards[0];
  const [source, target, ...rest] = firstBoard.pads;
  const state = parseBoardCollection({
    ...withSecond,
    boards: [{ ...firstBoard, pads: [{ ...source, clipId: clipA, label: 'Saved', color: '#abcdef' }, target, ...rest] }, secondBoard],
  });
  const untouchedSecond = structuredClone(secondBoard);
  const reordered = reorderPadModel(state, firstBoardId, source.id, target.id);
  const restarted = parseBoardCollection(JSON.parse(JSON.stringify(reordered)));

  assert.deepEqual(restarted, reordered);
  assert.deepEqual(restarted.boards[0].pads.slice(0, 2).map(({ id }) => id), [target.id, source.id]);
  assert.deepEqual(restarted.boards[0].pads[1], { ...source, clipId: clipA, label: 'Saved', color: '#abcdef' });
  assert.deepEqual(restarted.boards[1], untouchedSecond);
  assert.equal(restarted.activeBoardId, withSecond.activeBoardId);
});

test('pad reorder is a no-op for the same pad and rejects missing board, source, or target without mutation', () => {
  const state = emptyBoardCollection();
  const boardId = state.activeBoardId;
  const [first, second] = state.boards[0].pads;
  const before = structuredClone(state);

  assert.deepEqual(reorderPadModel(state, boardId, first.id, first.id), state);
  assert.throws(() => reorderPadModel(state, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', first.id, second.id), /board no longer exists/);
  assert.throws(() => reorderPadModel(state, boardId, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', second.id), /selected pad no longer exists/);
  assert.throws(() => reorderPadModel(state, boardId, first.id, 'ffffffff-ffff-4fff-8fff-ffffffffffff'), /destination pad no longer exists/);
  assert.deepEqual(state, before);
});

test('parsing rejects corrupt collections instead of falling back to defaults', () => {
  const invalid = { ...emptyBoardCollection(), activeBoardId: 'no-such-board' };
  assert.throws(() => parseBoardCollection(invalid), /active board/);
});
