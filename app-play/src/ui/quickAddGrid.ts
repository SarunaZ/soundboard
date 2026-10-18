/** The fixed Quick add tile occupies rendered grid index zero, outside saved pads. */
export function gridItemCountWithQuickAdd(padCount: number): number {
  return Math.max(0, padCount) + 1;
}

/** Translate a rendered grid index to a saved-pad index; Quick add has no pad index. */
export function gridIndexToPadIndex(gridIndex: number): number | null {
  return gridIndex <= 0 ? null : gridIndex - 1;
}
