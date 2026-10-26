import test from 'node:test';
import assert from 'node:assert/strict';
import { holdProgress, movedBeyondHoldThreshold, resolveBoardHold } from './boardHold.ts';

test('a release at 999 ms does not promote the already-playing sound', () => {
  assert.equal(resolveBoardHold(999, false), 'tap');
});

test('the one second boundary resolves to one protected play', () => {
  assert.equal(resolveBoardHold(1_000, false), 'protect');
  assert.equal(resolveBoardHold(1_100, false), 'protect');
});

test('cancelled holds never play, including after the threshold', () => {
  assert.equal(resolveBoardHold(400, true), 'cancel');
  assert.equal(resolveBoardHold(1_000, true), 'cancel');
});

test('charging progress is bounded and monotonic at the threshold', () => {
  assert.equal(holdProgress(-10), 0);
  assert.equal(holdProgress(500), 0.5);
  assert.equal(holdProgress(1_500), 1);
});

test('small finger drift is allowed, scrolling movement cancels', () => {
  assert.equal(movedBeyondHoldThreshold(5, 5), false);
  assert.equal(movedBeyondHoldThreshold(0, 10), true);
});

