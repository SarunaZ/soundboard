export type TrimPreviewStatus = {
  currentTime: number;
  playing: boolean;
  isBuffering: boolean;
  didJustFinish: boolean;
  error: string | null;
};

export type TrimPreviewState = {
  positionMs: number;
  playing: boolean;
  buffering: boolean;
  complete: boolean;
  error: string | null;
};

export type TrimPreviewPlayer = {
  currentTime: number;
  play(): void;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
  addListener(event: 'playbackStatusUpdate', listener: (status: TrimPreviewStatus) => void): { remove(): void };
  remove(): void;
};

const initialState: TrimPreviewState = { positionMs: 0, playing: false, buffering: false, complete: false, error: null };

/** Follows the native player's position and owns its callbacks and lifetime. */
export class TrimPreviewController {
  private state: TrimPreviewState = { ...initialState };
  private active = true;
  private resetting = false;
  private readonly subscription: { remove(): void };
  private readonly player: TrimPreviewPlayer;
  private readonly durationMs: number;
  private readonly onState: (state: TrimPreviewState) => void;

  constructor(
    player: TrimPreviewPlayer,
    durationMs: number,
    onState: (state: TrimPreviewState) => void,
  ) {
    this.player = player;
    this.durationMs = durationMs;
    this.onState = onState;
    this.subscription = player.addListener('playbackStatusUpdate', (status) => this.acceptStatus(status));
  }

  getState(): TrimPreviewState { return this.state; }

  async play(): Promise<void> {
    if (!this.active || this.state.playing) return;
    this.publish({ ...this.state, error: null });
    try {
      if (this.state.complete) {
        this.resetting = true;
        await this.player.seekTo(0);
        if (!this.active) return;
        this.resetting = false;
        this.publish({ ...initialState });
      }
      this.player.play();
      this.publish({ ...this.state, playing: true, buffering: false, error: null });
    } catch (error) {
      this.resetting = false;
      this.fail(error);
    }
  }

  pause(): void {
    if (!this.active || (!this.state.playing && !this.state.buffering)) return;
    try {
      this.player.pause();
      const positionMs = this.clamp(this.player.currentTime * 1000);
      this.publish({ ...this.state, positionMs, playing: false, buffering: false });
    } catch (error) {
      this.fail(error);
    }
  }

  async reset(): Promise<void> {
    if (!this.active) return;
    this.resetting = true;
    try {
      this.player.pause();
      await this.player.seekTo(0);
      if (!this.active) return;
      this.publish({ ...initialState });
    } catch (error) {
      this.fail(error);
    } finally {
      this.resetting = false;
    }
  }

  dispose(): void {
    if (!this.active) return;
    this.active = false;
    this.subscription.remove();
    try { this.player.pause(); } catch { /* Player removal below is the final cleanup. */ }
    this.player.remove();
  }

  private acceptStatus(status: TrimPreviewStatus): void {
    if (!this.active) return;
    if (status.error) {
      this.fail(new Error(status.error));
      return;
    }
    if (this.resetting) return;
    const positionMs = this.clamp(status.currentTime * 1000);
    if (status.didJustFinish || positionMs >= this.durationMs) {
      try { this.player.pause(); } catch { /* Completion state remains authoritative. */ }
      this.publish({ positionMs: this.durationMs, playing: false, buffering: false, complete: true, error: null });
      return;
    }
    this.publish({
      positionMs,
      playing: status.playing && !status.isBuffering,
      buffering: status.isBuffering,
      complete: false,
      error: null,
    });
  }

  private clamp(positionMs: number): number {
    return Number.isFinite(positionMs) ? Math.max(0, Math.min(this.durationMs, positionMs)) : 0;
  }

  private fail(error: unknown): void {
    if (!this.active) return;
    try { this.player.pause(); } catch { /* Preserve the original playback error. */ }
    const message = error instanceof Error && error.message ? error.message : 'Could not play this audio preview.';
    this.publish({ ...this.state, playing: false, buffering: false, error: message });
  }

  private publish(state: TrimPreviewState): void {
    if (!this.active) return;
    this.state = state;
    this.onState(state);
  }
}
