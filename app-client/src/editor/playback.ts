export interface PlaybackPositionInput {
  sourceKey: string;
  activeSourceKey: string;
  currentTimeSeconds: number;
  isLoaded: boolean;
  playing: boolean;
  didJustFinish: boolean;
  error: string | null;
  mode: 'source' | 'rendered';
  startMs: number;
  endMs: number;
  playbackStartMs: number;
  playbackEndMs: number;
}

export interface PlaybackPosition {
  playheadMs: number;
  elapsedMs: number;
  durationMs: number;
}

/** Maps Expo Audio's currentTime onto the source waveform for the active range preview. */
export function getPlaybackPosition(input: PlaybackPositionInput): PlaybackPosition | null {
  const {
    sourceKey,
    activeSourceKey,
    currentTimeSeconds,
    isLoaded,
    playing,
    didJustFinish,
    error,
    mode,
    startMs,
    endMs,
    playbackStartMs,
    playbackEndMs,
  } = input;

  if (!isLoaded || !playing || didJustFinish || error || sourceKey !== activeSourceKey) return null;
  if (![currentTimeSeconds, startMs, endMs, playbackStartMs, playbackEndMs].every(Number.isFinite)) return null;
  if (startMs < 0 || endMs <= startMs || playbackStartMs !== startMs || playbackEndMs !== endMs) return null;

  const durationMs = endMs - startMs;
  const reportedMs = currentTimeSeconds * 1000;
  if (!Number.isFinite(reportedMs)) return null;

  const elapsedMs = mode === 'rendered' ? reportedMs : reportedMs - startMs;
  if (elapsedMs < 0 || elapsedMs >= durationMs) return null;

  return {
    playheadMs: startMs + elapsedMs,
    elapsedMs,
    durationMs,
  };
}
