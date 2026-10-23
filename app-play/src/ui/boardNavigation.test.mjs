import test from 'node:test';
import assert from 'node:assert/strict';
import { boardDistanceFromEnd, boardPageCount, boardPageSlice, boardSoundsPerPage, nextBoardBatchCount, shouldAutoLoadBoardSounds } from './boardNavigation.ts';

test('page capacity counts sounds only and Quick Add uses one grid cell', () => {
  assert.equal(boardSoundsPerPage(3), 11);
  assert.equal(boardSoundsPerPage(4), 15);
  assert.equal(boardPageCount(0, 3), 1);
  assert.equal(boardPageCount(11, 3), 1);
  assert.equal(boardPageCount(12, 3), 2);
  assert.equal(boardPageCount(15, 4), 1);
  assert.equal(boardPageCount(16, 4), 2);
});

test('page slices are bounded and scroll batches add full rows without skipping or overflow', () => {
  const sounds = Array.from({ length: 29 }, (_, index) => index);
  assert.deepEqual(boardPageSlice(sounds, 3, 0), sounds.slice(0, 11));
  assert.deepEqual(boardPageSlice(sounds, 3, 1), sounds.slice(11, 22));
  assert.deepEqual(boardPageSlice(sounds, 3, 2), sounds.slice(22, 29));
  assert.deepEqual(boardPageSlice(sounds, 4, -2), sounds.slice(0, 15));
  assert.equal(nextBoardBatchCount(15, 40, 3), 27);
  assert.equal(nextBoardBatchCount(15, 40, 4), 31);
  assert.equal(nextBoardBatchCount(31, 32, 4), 32);
});

test('near-end auto loading ignores mount events and guards duplicate batch requests', () => {
  const request = { userScrolled: true, distanceFromEnd: 80, nearEndDistance: 240, loadedSoundCount: 15, totalSoundCount: 80, lastRequestedSoundCount: -1 };
  assert.equal(shouldAutoLoadBoardSounds({ ...request, userScrolled: false }), false);
  assert.equal(shouldAutoLoadBoardSounds({ ...request, distanceFromEnd: 400 }), false);
  assert.equal(shouldAutoLoadBoardSounds(request), true);
  assert.equal(shouldAutoLoadBoardSounds({ ...request, lastRequestedSoundCount: 15 }), false);
  assert.equal(shouldAutoLoadBoardSounds({ ...request, loadedSoundCount: 31, lastRequestedSoundCount: 15 }), true);
  assert.equal(shouldAutoLoadBoardSounds({ ...request, loadedSoundCount: 80 }), false);
});

test('end distance uses the real viewport position so a prior scroll does not load from the top', () => {
  const request = { userScrolled: true, nearEndDistance: 240, loadedSoundCount: 47, totalSoundCount: 500, lastRequestedSoundCount: -1 };
  const distanceAtTop = boardDistanceFromEnd(2400, 600, 0);
  const distanceNearEnd = boardDistanceFromEnd(2400, 600, 1560);
  assert.equal(distanceAtTop, 1800);
  assert.equal(shouldAutoLoadBoardSounds({ ...request, distanceFromEnd: distanceAtTop }), false);
  assert.equal(shouldAutoLoadBoardSounds({ ...request, distanceFromEnd: distanceNearEnd }), true);
});
