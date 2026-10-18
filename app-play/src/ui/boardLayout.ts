export interface BoardGridLayout {
  columns: number;
  tileWidth: number;
  gap: number;
}

/**
 * Select a compact board grid from the width actually available to the pads.
 * The minimum grows with the system font scale so labels keep their native
 * accessibility scaling without forcing the whole layout to shrink.
 */
export function calculateBoardGrid(
  availableWidth: number,
  fontScale: number,
  gap = 10,
): BoardGridLayout {
  const safeWidth = Number.isFinite(availableWidth) ? Math.max(0, availableWidth) : 0;
  const safeScale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const minimumTileWidth = 64 * safeScale;

  for (let columns = 4; columns > 1; columns -= 1) {
    const tileWidth = (safeWidth - gap * (columns - 1)) / columns;
    if (tileWidth >= minimumTileWidth) return { columns, tileWidth, gap };
  }

  return { columns: 1, tileWidth: safeWidth, gap };
}

export function calculateBoardTileHeight(tileWidth: number, fontScale: number): number {
  const safeWidth = Number.isFinite(tileWidth) ? Math.max(0, tileWidth) : 0;
  const safeScale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  return Math.max(104 * safeScale, safeWidth, 72 * safeScale + 20);
}
