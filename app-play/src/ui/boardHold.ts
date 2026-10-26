export const PROTECTED_HOLD_MS = 1_000;
export const HOLD_CANCEL_DISTANCE = 9;

export type HoldResolution = 'tap' | 'protect' | 'cancel';

/** Resolves a single press so a completed hold can never also become a tap. */
export function resolveBoardHold(elapsedMs: number, cancelled: boolean): HoldResolution {
  if (cancelled) return 'cancel';
  return elapsedMs >= PROTECTED_HOLD_MS ? 'protect' : 'tap';
}

export function runBoardHold(elapsedMs: number, cancelled: boolean, actions: { tap: () => void; protect: () => void }): HoldResolution {
  const outcome = resolveBoardHold(elapsedMs, cancelled);
  if (outcome === 'tap') actions.tap();
  if (outcome === 'protect') actions.protect();
  return outcome;
}

export function holdProgress(elapsedMs: number): number {
  return Math.max(0, Math.min(1, elapsedMs / PROTECTED_HOLD_MS));
}

export function movedBeyondHoldThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > HOLD_CANCEL_DISTANCE;
}
