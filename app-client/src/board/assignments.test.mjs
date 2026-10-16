import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyBoardAssignments,
  assignClipToSlot,
  clearBoardSlot,
  emptyBoardAssignments,
  nextAvailableBoardSlot,
  parseBoardAssignments,
  removeClipAssignments,
  moveBoardSlot,
} from './assignments.ts';

const clipId = '123e4567-e89b-42d3-a456-426614174000';
const otherClipId = '123e4567-e89b-42d3-b456-426614174001';

test('accepts the original 16-slot board and grows only up to 1000 stable slots', () => {
  const source = { version: 1, slots: Array(16).fill(null), uri: 'file:///private.m4a' };
  const parsed = parseBoardAssignments(source);
  assert.equal(parsed.slots.length, 16);
  assert.notEqual(parsed.slots, source.slots);
  assert.equal('uri' in parsed, false);
  assert.equal(JSON.stringify(parsed).includes('file:///'), false);
  assert.deepEqual(emptyBoardAssignments(), { version: 1, slots: Array(16).fill(null) });
  const expanded = assignClipToSlot(parsed, 999, clipId);
  assert.equal(expanded.slots.length, 1000);
  assert.equal(expanded.slots[999], clipId);
  assert.equal(parsed.slots.length, 16);
  assert.throws(() => assignClipToSlot(expanded, 1000, clipId), /0 to 999/);
  assert.throws(() => parseBoardAssignments({ version: 1, slots: Array(1001).fill(null) }), /1000/);
});

test('legacy snapshots keep default order through parse and roundtrip, then order mutations persist separately', () => {
  const legacy = { version: 1, slots: Array(16).fill(null) };
  const parsed = parseBoardAssignments(legacy);
  assert.deepEqual(parsed, legacy);
  assert.deepEqual(parseBoardAssignments(JSON.parse(JSON.stringify(parsed))), legacy);
  const moved = moveBoardSlot(parsed, 2, 9);
  assert.deepEqual(moved.order, [0, 1, 3, 4, 5, 6, 7, 8, 9, 2, 10, 11, 12, 13, 14, 15]);
  assert.deepEqual(parsed, legacy);
  assert.deepEqual(parseBoardAssignments(JSON.parse(JSON.stringify(moved))), moved);
});

test('moves original and appended slots by insertion while retaining duplicate assignments and stable slots', () => {
  let state = assignClipToSlot(emptyBoardAssignments(), 1, clipId);
  state = assignClipToSlot(state, 4, clipId);
  state = assignClipToSlot(state, 17, otherClipId);
  const movedOriginal = moveBoardSlot(state, 1, 17);
  assert.equal(movedOriginal.slots[1], clipId);
  assert.equal(movedOriginal.slots[4], clipId);
  assert.equal(movedOriginal.slots[17], otherClipId);
  assert.equal(movedOriginal.order?.at(-1), 1);
  const movedAppendedBack = moveBoardSlot(movedOriginal, 17, 0);
  assert.equal(movedAppendedBack.order?.[0], 17);
  assert.equal(state.order, undefined);
});

test('moves the last playable slot to the front at the 1000-slot capacity without changing assignments', () => {
  const state = assignClipToSlot(emptyBoardAssignments(), 999, clipId);
  const moved = moveBoardSlot(state, 999, 0);
  assert.equal(state.slots.length, 1000);
  assert.equal(moved.slots.length, 1000);
  assert.deepEqual(moved.slots, state.slots);
  assert.equal(moved.slots[999], clipId);
  assert.equal(moved.order?.length, 1000);
  assert.equal(new Set(moved.order).size, 1000);
  assert.deepEqual(moved.order.slice(0, 3), [999, 0, 1]);
  assert.equal(parseBoardAssignments(JSON.parse(JSON.stringify(moved))).slots.length, 1000);
});

test('partial visual orders append unlisted slots and assignment mutations retain ordering through holes', () => {
  const partial = parseBoardAssignments({ version: 1, slots: [...Array(16).fill(null), clipId, otherClipId], order: [17, 2] });
  const base = Array.from({ length: 16 }, (_, index) => ({ id: `pad-${index}`, name: `Pad ${index}`, color: 'gray' }));
  const clips = [
    { id: clipId, title: 'A', uri: 'file:///a.m4a', missing: false },
    { id: otherClipId, title: 'B', uri: 'file:///b.m4a', missing: false },
  ];
  const defaultSlotsExceptTwo = Array.from({ length: 16 }, (_, i) => i).filter((i) => i !== 2);
  assert.deepEqual(applyBoardAssignments(base, partial, clips).map(({ slotIndex }) => slotIndex), [17, 2, ...defaultSlotsExceptTwo, 16]);
  const afterClear = clearBoardSlot(partial, 17);
  assert.deepEqual(afterClear.order, [17, 2]);
  const afterRemove = removeClipAssignments(afterClear, clipId);
  assert.deepEqual(afterRemove.order, [17, 2]);
  const reused = assignClipToSlot(afterRemove, 17, clipId);
  assert.deepEqual(reused.order, [17, 2]);
  assert.deepEqual(applyBoardAssignments(base, reused, clips).map(({ slotIndex }) => slotIndex), [17, 2, ...defaultSlotsExceptTwo]);
});

test('automatic board slots start at 16, reuse the first appended hole, then append', () => {
  const initial = emptyBoardAssignments();
  assert.equal(nextAvailableBoardSlot(initial), 16);
  assert.deepEqual(clearBoardSlot(initial, 999), initial);
  const at16 = assignClipToSlot(initial, 16, clipId);
  assert.equal(nextAvailableBoardSlot(at16), 17);
  const at17 = assignClipToSlot(at16, 17, otherClipId);
  assert.equal(nextAvailableBoardSlot(clearBoardSlot(at17, 16)), 16);
  assert.equal(nextAvailableBoardSlot(clearBoardSlot(at17, 17)), 17);
  assert.equal(nextAvailableBoardSlot(assignClipToSlot(at17, 999, clipId)), 18);
  assert.throws(() => nextAvailableBoardSlot({ version: 1, slots: Array(1000).fill(clipId) }), /full/);
});

test('assigns, replaces, and clears immutable slots while preserving duplicate assignments', () => {
  const original = emptyBoardAssignments();
  const first = assignClipToSlot(original, 2, clipId);
  const withSecond = assignClipToSlot(first, 5, clipId);
  const replaced = assignClipToSlot(withSecond, 2, otherClipId);
  const cleared = clearBoardSlot(replaced, 5);

  assert.equal(original.slots[2], null);
  assert.equal(first.slots[2], clipId);
  assert.equal(withSecond.slots[5], clipId);
  assert.equal(replaced.slots[2], otherClipId);
  assert.equal(cleared.slots[5], null);
  assert.equal(cleared.slots[2], otherClipId);
});

test('removes every assignment for a deleted clip', () => {
  const assigned = assignClipToSlot(assignClipToSlot(emptyBoardAssignments(), 0, clipId), 15, clipId);
  const removed = removeClipAssignments(assigned, clipId);
  assert.equal(removed.slots[0], null);
  assert.equal(removed.slots[15], null);
  assert.equal(assigned.slots[0], clipId);
});

test('rejects malformed schema, slot indexes, and clip IDs', () => {
  assert.throws(() => parseBoardAssignments({ version: 1, slots: Array(15).fill(null) }), /16/);
  assert.throws(() => parseBoardAssignments({ version: 1, slots: ['not-a-uuid', ...Array(15).fill(null)] }), /16/);
  assert.throws(() => parseBoardAssignments({ version: 2, slots: Array(16).fill(null) }), /unsupported/);
  assert.throws(() => assignClipToSlot(emptyBoardAssignments(), -1, clipId), /index/);
  assert.throws(() => clearBoardSlot(emptyBoardAssignments(), 1000), /index/);
  assert.throws(() => assignClipToSlot(emptyBoardAssignments(), 0, 'not-a-uuid'), /clip ID/);
  assert.throws(() => removeClipAssignments(emptyBoardAssignments(), 'not-a-uuid'), /clip ID/);
  assert.throws(() => parseBoardAssignments({ version: 1, slots: Array(16).fill(null), order: [1, 1] }), /visual order/);
  assert.throws(() => parseBoardAssignments({ version: 1, slots: Array(16).fill(null), order: [16] }), /visual order/);
  assert.throws(() => parseBoardAssignments({ version: 1, slots: Array(16).fill(null), order: [1.5] }), /visual order/);
  assert.throws(() => parseBoardAssignments({ version: 1, slots: Array(16).fill(null), order: '1,2' }), /visual order/);
  assert.throws(() => moveBoardSlot(emptyBoardAssignments(), 0, 16), /index/);
  assert.throws(() => moveBoardSlot(emptyBoardAssignments(), 1.5, 0), /index/);
});

test('overlays present local clips by slot and falls back to bundled pads for missing files', () => {
  const basePads = Array.from({ length: 16 }, (_, index) => ({
    id: `pad-${index}`,
    name: `Bundled ${index}`,
    uri: `asset://${index}`,
    color: `color-${index}`,
    module: index,
  }));
  const state = assignClipToSlot(assignClipToSlot(emptyBoardAssignments(), 1, clipId), 4, otherClipId);
  const result = applyBoardAssignments(basePads, state, [
    { id: clipId, title: 'Saved one', uri: 'file:///one.m4a', missing: false },
    { id: otherClipId, title: 'Saved missing', uri: '', missing: true },
  ]);

  assert.equal(result[1]?.id, 'local-pad-1');
  assert.equal(result[1]?.name, 'Saved one');
  assert.equal(result[1]?.uri, 'file:///one.m4a');
  assert.equal(result[1]?.localClipId, clipId);
  assert.equal(result[1]?.module, undefined);
  assert.equal(result[1]?.color, basePads[1]?.color);
  const { slotIndex: fallbackSlotIndex, ...fallback } = result[4];
  assert.equal(fallbackSlotIndex, 4);
  assert.deepEqual(fallback, basePads[4]);
  assert.equal(result[0]?.id, basePads[0]?.id);
});

test('dangling and URI-less clip records never leave stale local URIs on the base pad', () => {
  const base = [{ id: 'pad-0', name: 'Bundled', uri: 'asset://tone', module: 1 }];
  const assigned = assignClipToSlot(emptyBoardAssignments(), 0, clipId);
  assert.deepEqual(applyBoardAssignments(base, assigned, []).map(({ slotIndex, ...pad }) => pad), base);
  assert.deepEqual(applyBoardAssignments(base, assigned, [
    { id: clipId, title: 'Unavailable', uri: '', missing: false },
  ]).map(({ slotIndex, ...pad }) => pad), base);
});

test('appends playable extra local pads and skips empty or missing extra assignments without shifting indexes', () => {
  const basePads = Array.from({ length: 16 }, (_, index) => ({ id: `pad-${index}`, name: `Bundled ${index}`, color: `color-${index}`, module: index }));
  const slots = Array(19).fill(null);
  slots[16] = clipId;
  slots[17] = otherClipId;
  slots[18] = '123e4567-e89b-42d3-a456-426614174002';
  const result = applyBoardAssignments(basePads, { version: 1, slots }, [
    { id: clipId, title: 'Added', uri: 'file:///added.m4a', missing: false },
    { id: otherClipId, title: 'Missing', uri: '', missing: true },
  ]);
  assert.equal(result.length, 17);
  assert.deepEqual(result.slice(0, 16).map((pad) => pad.slotIndex), Array.from({ length: 16 }, (_, index) => index));
  assert.equal(result[16]?.slotIndex, 16);
  assert.equal(result[16]?.id, 'local-pad-16');
  assert.equal(result[16]?.localClipId, clipId);
  assert.equal(result[16]?.uri, 'file:///added.m4a');
  assert.equal(result[16]?.color, applyBoardAssignments(basePads, { version: 1, slots }, [
    { id: clipId, title: 'Added', uri: 'file:///added.m4a', missing: false },
  ])[16]?.color);
});
