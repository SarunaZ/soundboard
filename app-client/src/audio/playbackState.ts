export type PlaybackSnapshot =
  | { status: 'idle' }
  | {
      status: 'playing';
      padId: string;
      uri: string;
      startedAt: number;
      duration: number;
      elapsed: number;
      progress: number;
    };

interface ActivePlayback {
  generation: number;
  padId: string;
  uri: string;
  startedAt: number;
  duration: number;
}

/** Owns playback request ordering and derives progress from the audio clock. */
export class PlaybackStateStore {
  private generation = 0;
  private active: ActivePlayback | null = null;
  private readonly listeners = new Set<(snapshot: PlaybackSnapshot) => void>();

  beginRequest(): number {
    this.generation += 1;
    return this.generation;
  }

  isCurrentRequest(generation: number): boolean {
    return generation === this.generation;
  }

  start(generation: number, playback: Omit<ActivePlayback, 'generation'>): boolean {
    if (!this.isCurrentRequest(generation)) return false;
    this.active = { ...playback, generation };
    this.publish(playback.startedAt);
    return true;
  }

  finish(generation: number): void {
    if (!this.active || this.active.generation !== generation) return;
    this.active = null;
    this.publish(0);
  }

  stop(): void {
    this.generation += 1;
    this.active = null;
    this.publish(0);
  }

  snapshot(currentTime: number): PlaybackSnapshot {
    if (!this.active) return { status: 'idle' };
    const duration = Number.isFinite(this.active.duration) ? Math.max(0, this.active.duration) : 0;
    const clockTime = Number.isFinite(currentTime) ? currentTime : this.active.startedAt;
    const elapsed = Math.min(duration, Math.max(0, clockTime - this.active.startedAt));
    return {
      status: 'playing',
      padId: this.active.padId,
      uri: this.active.uri,
      startedAt: this.active.startedAt,
      duration,
      elapsed,
      progress: duration > 0 ? elapsed / duration : 1,
    };
  }

  subscribe(listener: (snapshot: PlaybackSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(clockTime: number): void {
    const snapshot = this.snapshot(clockTime);
    for (const listener of this.listeners) listener(snapshot);
  }
}

export function formatPlaybackTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
