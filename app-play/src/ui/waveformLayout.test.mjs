import test from 'node:test';
import assert from 'node:assert/strict';
import { clampEnd, clampStart, dragDeltaToTime, positionToTime, timeToPosition } from './waveformLayout.ts';

test('waveform handles remain fully visible at both source boundaries', () => {
  const width = 340;
  assert.equal(timeToPosition(0, 8_000, width), 12);
  assert.equal(timeToPosition(8_000, 8_000, width), width - 12);
  assert.equal(positionToTime(12, 8_000, width), 0);
  assert.equal(positionToTime(width - 12, 8_000, width), 8_000);
});

test('drag distance maps to source time across only the usable handle-center span', () => {
  const width = 340;
  assert.equal(dragDeltaToTime(width - 24, 8_000, width), 8_000);
  assert.equal(dragDeltaToTime(-(width - 24), 8_000, width), -8_000);
});

test('trim boundaries preserve a positive selection and the 60 second maximum', () => {
  assert.equal(clampStart(-500, 2_000, 100_000), 0);
  assert.equal(clampStart(0, 100_000, 100_000), 40_000);
  assert.equal(clampEnd(100_000, 0, 100_000), 60_000);
  assert.equal(clampEnd(-1, 0, 20_000), 100);
});
