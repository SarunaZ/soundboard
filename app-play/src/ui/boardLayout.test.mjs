import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBoardGrid, calculateBoardTileHeight } from './boardLayout.ts';

test('four columns fit the reviewed 411 dp phone at font scale 1.15', () => {
  const grid = calculateBoardGrid(379, 1.15, 10);
  assert.equal(grid.columns, 4);
  assert.ok(grid.tileWidth >= 64 * 1.15);
  assert.ok(grid.tileWidth * grid.columns + grid.gap * (grid.columns - 1) <= 379);
});

test('columns adapt to narrow widths and larger system fonts', () => {
  assert.equal(calculateBoardGrid(300, 1).columns, 4);
  assert.equal(calculateBoardGrid(280, 1.5).columns, 2);
  assert.equal(calculateBoardGrid(220, 1.4).columns, 2);
  assert.equal(calculateBoardGrid(130, 1.2).columns, 1);
});

test('every calculated column count fits its measured width exactly', () => {
  for (const width of [130, 220, 280, 300, 340, 379, 430]) {
    for (const scale of [1, 1.15, 1.5, 2]) {
      const { columns, tileWidth, gap } = calculateBoardGrid(width, scale);
      assert.ok(tileWidth * columns + gap * (columns - 1) <= width + 1e-9);
    }
  }
});

test('invalid measured widths produce a finite empty layout', () => {
  for (const width of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const grid = calculateBoardGrid(width, 1.15);
    assert.equal(grid.columns, 1);
    assert.equal(grid.tileWidth, 0);
    assert.ok(Number.isFinite(grid.tileWidth));
  }
});

test('pad height keeps a 104 dp minimum and scales with accessibility text', () => {
  assert.equal(calculateBoardTileHeight(80, 1), 104);
  assert.equal(calculateBoardTileHeight(87.25, 1.15), 119.6);
  assert.equal(calculateBoardTileHeight(140, 1.15), 140);
});
