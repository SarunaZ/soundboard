/**
 * Types shared by the service and the app. Mirrors DESIGN.md §4.
 *
 * Source is transient (discarded after render, decision #5); Clip is the
 * permanent derivative; Pad is presentation only and never touches an asset.
 */

export type SourceKind = 'youtube' | 'direct' | 'upload';
export type SourceState = 'pending' | 'fetching' | 'ready' | 'failed';
export type RenderState = 'pending' | 'rendering' | 'ready' | 'failed';

/** Master. Lives on the droplet's temp disk with a 24 h TTL, then is gone. */
export interface Source {
  id: string;
  kind: SourceKind;
  sourceUrl: string;
  /** YouTube video ID etc. Dedup key: ingesting twice yields one Source. */
  canonicalId: string | null;
  title: string | null;
  durationMs: number | null;
  tempPath: string | null;
  byteSize: number | null;
  contentHash: string | null;
  state: SourceState;
  fetchedAt: string | null;
  expiresAt: string | null;
}

/** Derivative. Permanent, content-addressed, the real archive. */
export interface Clip {
  id: string;
  sourceId: string;
  /** The recipe. Replayed against editKey when re-editing. */
  trimStartMs: number;
  trimEndMs: number;
  /** Actual handle amounts after clamping to source bounds (±4 s, #13). */
  padStartMs: number;
  padEndMs: number;
  gainDb: number;
  fadeInMs: number;
  fadeOutMs: number;
  normalize: boolean;
  /** clips/<sha256>.m4a — tight, ~24 KB. The only thing the phone fetches. */
  clipKey: string;
  /** edits/<sha256>.m4a — padded, ~88 KB. Editor only. */
  editKey: string | null;
  contentHash: string;
  byteSize: number;
  renderState: RenderState;
}

/** Presentation. Deliberately separate from the asset. */
export interface Pad {
  id: string;
  clipId: string;
  name: string;
  tags: string[];
  color: string | null;
  gridPos: number;
  pinned: boolean;
  playCount: number;
  lastPlayedAt: string | null;
}

/**
 * Mirrored locally by the app (~200 bytes/clip, ~40 KB at 200 clips) and
 * refreshed in the background. Never on the playback path.
 */
export interface Manifest {
  version: number;
  generatedAt: string;
  /** Absolute R2 URLs. Content-addressed, so cacheable forever. */
  baseUrl: string;
  pads: ManifestEntry[];
}

export interface ManifestEntry {
  padId: string;
  clipId: string;
  name: string;
  tags: string[];
  color: string | null;
  gridPos: number;
  pinned: boolean;
  clipKey: string;
  byteSize: number;
  durationMs: number;
}

/** One `onPressIn → first audible sample` measurement (DESIGN §6). */
export interface LatencySample {
  padId: string;
  ms: number;
  cacheHit: boolean;
  connectionType: string;
  at: string;
}
