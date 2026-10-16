export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function canRevealFocusedInput({
  enabled,
  keyboardVisible,
  focused,
  generation,
  requestedGeneration,
}: {
  enabled: boolean;
  keyboardVisible: boolean;
  focused: boolean;
  generation: number;
  requestedGeneration: number;
}): boolean {
  return enabled && keyboardVisible && focused && generation === requestedGeneration;
}

/** Return the smallest scroll offset that places the focused input in view. */
export function getInputRevealOffset({
  viewport,
  input,
  keyboardTop,
  currentOffset,
  gap = 16,
}: {
  viewport: WindowRect;
  input: WindowRect;
  keyboardTop?: number;
  currentOffset: number;
  gap?: number;
}): number {
  const safeOffset = Number.isFinite(currentOffset) ? Math.max(0, currentOffset) : 0;
  const validRect = (rect: WindowRect) =>
    Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) && rect.width > 0 &&
    Number.isFinite(rect.height) && rect.height > 0;
  if (!validRect(viewport) || !validRect(input) ||
      (keyboardTop !== undefined && !Number.isFinite(keyboardTop))) return safeOffset;

  const safeGap = Number.isFinite(gap) ? Math.max(0, gap) : 16;
  const visibleTop = viewport.y;
  const visibleBottom = Math.min(viewport.y + viewport.height, keyboardTop ?? Number.POSITIVE_INFINITY);
  const inputTop = input.y;
  const inputBottom = input.y + input.height;

  if (inputBottom > visibleBottom - safeGap) {
    return Math.max(0, safeOffset + inputBottom - (visibleBottom - safeGap));
  }
  if (inputTop < visibleTop + safeGap) {
    return Math.max(0, safeOffset - (visibleTop + safeGap - inputTop));
  }
  return safeOffset;
}
