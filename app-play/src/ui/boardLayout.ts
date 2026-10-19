export interface BoardGridLayout {
  columns: number;
  tileWidth: number;
  gap: number;
}

/**
 * Select a four-column board grid from the width actually available to pads.
 * Tile widths align to physical pixels so Yoga's edge rounding cannot make a
 * complete row exceed the measured width. Large-font accommodation is handled
 * by tile height rather than changing the column count.
 */
export function calculateBoardGrid(
  availableWidth: number,
  fontScale: number,
  gap = 8,
  pixelRatio = 1,
): BoardGridLayout {
  const safeWidth = Number.isFinite(availableWidth) ? Math.max(0, availableWidth) : 0;
  const safePixelRatio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  void fontScale;
  const columns = 4;
  const safeGap = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  // Yoga rounds child edges to physical pixels. Fit the grid in that same
  // coordinate space so four individually rounded tile widths cannot wrap.
  const availablePixels = Math.floor(safeWidth * safePixelRatio);
  const gapPixels = Math.ceil(safeGap * safePixelRatio);
  const tileWidthPixels = Math.floor(Math.max(0, availablePixels - gapPixels * (columns - 1)) / columns);
  const tileWidth = tileWidthPixels / safePixelRatio;
  return { columns, tileWidth, gap: safeGap };
}

export function calculateBoardTileHeight(tileWidth: number, fontScale: number): number {
  const safeWidth = Number.isFinite(tileWidth) ? Math.max(0, tileWidth) : 0;
  const safeFontScale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const aspectHeight = safeWidth / 0.88;
  if (safeFontScale <= 1.2) return aspectHeight;
  return Math.max(aspectHeight, 34 + (28 + 26) * safeFontScale + 12);
}
