export const MIN_RANGE_MS = 100;
export const MAX_RANGE_MS = 60_000;
export const HANDLE_WIDTH = 24;

export function timelineWidth(trackWidth: number): number {
  return Math.max(1, trackWidth - HANDLE_WIDTH);
}

export function timeToPosition(milliseconds: number, durationMs: number, trackWidth: number): number {
  if (durationMs <= 0) return 0;
  const innerWidth = timelineWidth(trackWidth);
  const clamped = Math.max(0, Math.min(durationMs, milliseconds));
  return HANDLE_WIDTH / 2 + clamped / durationMs * innerWidth;
}

export function positionToTime(position: number, durationMs: number, trackWidth: number): number {
  if (durationMs <= 0) return 0;
  const innerWidth = timelineWidth(trackWidth);
  const fraction = Math.max(0, Math.min(1, (position - HANDLE_WIDTH / 2) / innerWidth));
  return Math.round(fraction * durationMs);
}

export function dragDeltaToTime(deltaX: number, durationMs: number, trackWidth: number): number {
  return Math.round(deltaX / timelineWidth(trackWidth) * durationMs);
}

export function clampStart(target: number, endMs: number, durationMs: number): number {
  const minimum = Math.min(MIN_RANGE_MS, durationMs);
  const maximum = Math.min(MAX_RANGE_MS, durationMs);
  return Math.max(Math.max(0, endMs - maximum), Math.min(endMs - minimum, target));
}

export function clampEnd(target: number, startMs: number, durationMs: number): number {
  const minimum = Math.min(MIN_RANGE_MS, durationMs);
  const maximum = Math.min(MAX_RANGE_MS, durationMs);
  return Math.max(startMs + minimum, Math.min(Math.min(durationMs, startMs + maximum), target));
}
