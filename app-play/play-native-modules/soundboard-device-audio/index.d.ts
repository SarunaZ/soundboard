export type PlaybackPreparationPending = { state: 'pending' };
export type PlaybackPreparationReady = {
  state: 'ready';
  processed: boolean;
  clipGain: number;
  peakBound: number;
  channels: ArrayBuffer[];
};
export type PlaybackPreparationFailed = { state: 'failed'; message: string };
export type PlaybackPreparationCancelled = { state: 'cancelled' };
export type PlaybackPreparationResult =
  | PlaybackPreparationPending
  | PlaybackPreparationReady
  | PlaybackPreparationFailed
  | PlaybackPreparationCancelled;

export function startPlaybackPreparation(
  channels: Float32Array[],
  gain: number,
  sampleRate: number,
): string;
export function pollPlaybackPreparation(jobId: string): PlaybackPreparationResult;
export function cancelPlaybackPreparation(jobId: string): void;
