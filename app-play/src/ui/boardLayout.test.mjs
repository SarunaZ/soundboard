import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBoardGrid, calculateBoardTileHeight } from './boardLayout.ts';

test('board uses four columns, 8 dp gaps, and the reviewed 0.88 tile aspect', () => {
  const grid = calculateBoardGrid(379, 1.15, 8);
  assert.equal(grid.columns, 4);
  assert.equal(grid.gap, 8);
  assert.ok(grid.tileWidth * grid.columns + grid.gap * (grid.columns - 1) <= 379);
  assert.equal(calculateBoardTileHeight(grid.tileWidth, 1.15) / grid.tileWidth, 1 / 0.88);
});

test('four columns remain stable on narrow widths and larger system fonts', () => {
  assert.equal(calculateBoardGrid(300, 1).columns, 4);
  assert.equal(calculateBoardGrid(280, 1.5).columns, 4);
  assert.equal(calculateBoardGrid(220, 1.4).columns, 4);
  assert.equal(calculateBoardGrid(130, 1.2).columns, 4);
});

test('density 2.625 fits four tiles in the measured 1080 px device viewport', () => {
  const pixelRatio = 2.625;
  const width = 1080 / pixelRatio - 46;
  const { columns, tileWidth, gap } = calculateBoardGrid(width, 1, 8, pixelRatio);
  const occupiedPixels = tileWidth * pixelRatio * columns + gap * pixelRatio * (columns - 1);

  assert.equal(columns, 4);
  assert.equal(tileWidth * pixelRatio, Math.floor(tileWidth * pixelRatio));
  assert.ok(occupiedPixels <= width * pixelRatio);
  assert.ok(width * pixelRatio - occupiedPixels < columns);
});

test('fractional dp widths round tile widths down to safe physical pixels', () => {
  for (const pixelRatio of [2.625, 3, 2.5, 1.5]) {
    for (const width of [411.427, 360.19, 320.333, 279.999]) {
      const { columns, tileWidth, gap } = calculateBoardGrid(width, 1, 8, pixelRatio);
      const occupiedPixels = tileWidth * pixelRatio * columns + gap * pixelRatio * (columns - 1);
      assert.equal(columns, 4);
      assert.ok(Math.abs(tileWidth * pixelRatio - Math.round(tileWidth * pixelRatio)) < 1e-9);
      assert.ok(occupiedPixels <= width * pixelRatio);
      assert.ok(width * pixelRatio - occupiedPixels < columns + 1);
    }
  }
});

test('every calculated column count fits its measured width exactly', () => {
  for (const width of [130, 220, 280, 300, 340, 379, 430]) {
    for (const scale of [1, 1.15, 1.5, 2]) {
      const { columns, tileWidth, gap } = calculateBoardGrid(width, scale);
      assert.ok(tileWidth * columns + gap * (columns - 1) <= width + 1e-9);
    }
  }
});

test('zero, negative, and invalid measured widths produce a finite empty layout', () => {
  for (const width of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const grid = calculateBoardGrid(width, 1.15);
    assert.equal(grid.columns, 4);
    assert.equal(grid.tileWidth, 0);
    assert.ok(Number.isFinite(grid.tileWidth));
  }
});

test('pad height preserves the design aspect and expands only for large font scales', () => {
  assert.equal(calculateBoardTileHeight(80, 1), 80 / 0.88);
  assert.equal(calculateBoardTileHeight(80, 1.2), 80 / 0.88);
  assert.equal(calculateBoardTileHeight(87.25, 1.15), 87.25 / 0.88);
  assert.equal(calculateBoardTileHeight(140, 1.15), 140 / 0.88);
  assert.equal(calculateBoardTileHeight(80, 1.5), 34 + (28 + 26) * 1.5 + 12);
  assert.equal(calculateBoardTileHeight(120, 1.5), 120 / 0.88);
});
