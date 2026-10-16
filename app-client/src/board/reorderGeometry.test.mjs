import assert from 'node:assert/strict';
import test from 'node:test';
import { clampScrollOffset, dragHandleIndexAtPoint, edgeScrollStep, gridIndexAtPoint } from './reorderGeometry.ts';

const metrics = { width: 400, scrollOffset: 0, itemCount: 17, columns: 4, gap: 8, padding: 8, itemHeight: 92 };

test('maps touches to the nearest row and column and clamps outside grid bounds', () => {
  assert.equal(gridIndexAtPoint({ x: 8, y: 1 }, metrics), 0);
  assert.equal(gridIndexAtPoint({ x: 390, y: 1 }, metrics), 3);
  assert.equal(gridIndexAtPoint({ x: 205, y: 150 }, metrics), 6);
  assert.equal(gridIndexAtPoint({ x: -30, y: -40 }, metrics), 0);
  assert.equal(gridIndexAtPoint({ x: 900, y: 900 }, metrics), 16);
});

test('includes scroll offset and selects the partial final row', () => {
  assert.equal(gridIndexAtPoint({ x: 12, y: 5 }, { ...metrics, scrollOffset: 300 }), 12);
  assert.equal(gridIndexAtPoint({ x: 205, y: 1 }, { ...metrics, scrollOffset: 400 }), 16);
  assert.equal(gridIndexAtPoint({ x: 390, y: 1 }, { ...metrics, scrollOffset: 400 }), 16);
});

test('recognizes only the dedicated drag handle including a partial last row', () => {
  assert.equal(dragHandleIndexAtPoint({ x: 75, y: 70 }, metrics), 0);
  assert.equal(dragHandleIndexAtPoint({ x: 30, y: 70 }, metrics), null);
  assert.equal(dragHandleIndexAtPoint({ x: 75, y: 40 }, metrics), null);
  assert.equal(dragHandleIndexAtPoint({ x: 75, y: 60 }, { ...metrics, scrollOffset: 400 }), 16);
  assert.equal(dragHandleIndexAtPoint({ x: 300, y: 60 }, { ...metrics, scrollOffset: 400 }), null);
});

test('edge scrolling has direction, speed boundaries, and a quiet center', () => {
  assert.equal(edgeScrollStep(0, 500), -18);
  assert.equal(edgeScrollStep(32, 500), -9);
  assert.equal(edgeScrollStep(250, 500), 0);
  assert.equal(edgeScrollStep(468, 500), 9);
  assert.equal(edgeScrollStep(500, 500), 18);
  assert.equal(edgeScrollStep(10, 0), 0);
});

test('scroll offsets stay between the viewport and content boundaries', () => {
  assert.equal(clampScrollOffset(-4, 1000, 300), 0);
  assert.equal(clampScrollOffset(800, 1000, 300), 700);
  assert.equal(clampScrollOffset(40, 200, 300), 0);
});
