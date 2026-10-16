import test from 'node:test';
import assert from 'node:assert/strict';
import { canRevealFocusedInput, getInputRevealOffset } from './keyboardGeometry.ts';

const viewport = { x: 0, y: 80, width: 400, height: 700 };

test('does not scroll an input that is already visible above the keyboard gap', () => {
  assert.equal(getInputRevealOffset({
    viewport,
    input: { x: 16, y: 400, width: 300, height: 50 },
    keyboardTop: 600,
    currentOffset: 120,
  }), 120);
});

test('scrolls only the overlap plus the requested gap when the keyboard covers the input', () => {
  assert.equal(getInputRevealOffset({
    viewport,
    input: { x: 16, y: 540, width: 300, height: 50 },
    keyboardTop: 560,
    currentOffset: 120,
  }), 166);
});

test('uses a resized viewport bottom and keeps an input below the top inset visible', () => {
  assert.equal(getInputRevealOffset({
    viewport: { x: 0, y: 100, width: 400, height: 320 },
    input: { x: 16, y: 380, width: 300, height: 50 },
    currentOffset: 40,
  }), 66);
  assert.equal(getInputRevealOffset({
    viewport,
    input: { x: 16, y: 70, width: 300, height: 50 },
    currentOffset: 20,
  }), 0);
});

test('a keyboard hide cancels a pending reveal', () => {
  assert.equal(canRevealFocusedInput({
    enabled: true,
    keyboardVisible: false,
    focused: true,
    generation: 2,
    requestedGeneration: 2,
  }), false);
});

test('a queued reveal cannot apply after focus changes or its request becomes stale', () => {
  assert.equal(canRevealFocusedInput({ enabled: true, keyboardVisible: true, focused: false, generation: 4, requestedGeneration: 4 }), false);
  assert.equal(canRevealFocusedInput({ enabled: true, keyboardVisible: true, focused: true, generation: 5, requestedGeneration: 4 }), false);
});

test('focus while a keyboard is already open can reveal after the resized layout', () => {
  assert.equal(canRevealFocusedInput({ enabled: true, keyboardVisible: true, focused: true, generation: 3, requestedGeneration: 3 }), true);
  assert.equal(getInputRevealOffset({
    viewport: { x: 0, y: 100, width: 400, height: 320 },
    input: { x: 16, y: 390, width: 300, height: 50 },
    currentOffset: 30,
  }), 66);
});

test('transient and non-finite measurements preserve a safe scroll offset', () => {
  assert.equal(getInputRevealOffset({
    viewport: { x: 0, y: 0, width: 400, height: 0 },
    input: { x: 0, y: 800, width: 200, height: 50 },
    currentOffset: 18,
  }), 18);
  assert.equal(getInputRevealOffset({
    viewport,
    input: { x: 0, y: Number.NaN, width: 200, height: 50 },
    currentOffset: Number.NaN,
  }), 0);
});
