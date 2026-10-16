export interface GridPoint {
  x: number;
  y: number;
}

export interface GridMetrics {
  width: number;
  scrollOffset: number;
  itemCount: number;
  columns?: number;
  gap?: number;
  padding?: number;
  itemHeight?: number;
}

/** Convert a screen point in the list viewport to the nearest visible grid cell. */
export function gridIndexAtPoint(point: GridPoint, metrics: GridMetrics): number {
  const columns = Math.max(1, Math.floor(metrics.columns ?? 4));
  const gap = Math.max(0, metrics.gap ?? 8);
  const padding = Math.max(0, metrics.padding ?? 8);
  const itemHeight = Math.max(1, metrics.itemHeight ?? 92);
  const rowPitch = itemHeight + gap;
  const innerWidth = Math.max(1, metrics.width - padding * 2);
  const cellWidth = Math.max(1, (innerWidth - gap * (columns - 1)) / columns);
  const columnPitch = cellWidth + gap;
  const column = clamp(Math.round((point.x - padding - cellWidth / 2) / columnPitch), 0, columns - 1);
  const row = Math.max(0, Math.round((point.y + metrics.scrollOffset - itemHeight / 2) / rowPitch));
  return clamp(row * columns + column, 0, Math.max(0, metrics.itemCount - 1));
}

/** Return the pad under the dedicated lower-right handle, or null elsewhere. */
export function dragHandleIndexAtPoint(point: GridPoint, metrics: GridMetrics): number | null {
  const columns = Math.max(1, Math.floor(metrics.columns ?? 4));
  const gap = Math.max(0, metrics.gap ?? 8);
  const padding = Math.max(0, metrics.padding ?? 8);
  const itemHeight = Math.max(1, metrics.itemHeight ?? 92);
  const innerWidth = Math.max(1, metrics.width - padding * 2);
  const cellWidth = Math.max(1, (innerWidth - gap * (columns - 1)) / columns);
  const x = point.x - padding;
  const y = point.y + metrics.scrollOffset;
  if (x < 0 || y < 0) return null;
  const columnPitch = cellWidth + gap;
  const rowPitch = itemHeight + gap;
  const column = Math.floor(x / columnPitch);
  const row = Math.floor(y / rowPitch);
  const insideCellX = x - column * columnPitch;
  const insideCellY = y - row * rowPitch;
  if (column >= columns || insideCellX > cellWidth || insideCellY > itemHeight) return null;
  if (insideCellX < cellWidth - 48 || insideCellY < itemHeight - 42) return null;
  const index = row * columns + column;
  return index < metrics.itemCount ? index : null;
}

/** Return a signed per-tick scroll delta when the pointer enters an edge band. */
export function edgeScrollStep(pointerY: number, viewportHeight: number, edgeSize = 64, maxStep = 18): number {
  if (viewportHeight <= 0 || edgeSize <= 0 || maxStep <= 0) return 0;
  if (pointerY < edgeSize) {
    return -Math.ceil(maxStep * clamp((edgeSize - pointerY) / edgeSize, 0, 1));
  }
  if (pointerY > viewportHeight - edgeSize) {
    return Math.ceil(maxStep * clamp((pointerY - (viewportHeight - edgeSize)) / edgeSize, 0, 1));
  }
  return 0;
}

export function clampScrollOffset(offset: number, contentHeight: number, viewportHeight: number): number {
  return clamp(offset, 0, Math.max(0, contentHeight - viewportHeight));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
