export type CreationSource = 'device' | 'mic' | 'file';
export type DurationBucket = '0_5' | '6_15' | '16_30' | '31_plus';
export type ErrorClass = 'permission_denied' | 'unavailable' | 'invalid_media' | 'limit_exceeded' | 'storage' | 'capture_failed' | 'processing_failed' | 'save_failed' | 'unknown';
export type CreationStage = 'permission' | 'capture' | 'import' | 'trim' | 'save';
export type RepeatMode = 'once' | 'count' | 'loop';
export type SoundCountBucket = '0' | '1_10' | '11_25' | '26_50' | '51_100' | '101_150' | '151_plus';
export type PlaysBucket = '0' | '1_10' | '11_50' | '51_100' | '101_plus';
export type BoardsBucket = '0' | '1' | '2_5' | '6_plus';

export type AnalyticsEventName =
  | 'creation_started'
  | 'recording_completed'
  | 'trim_viewed'
  | 'sound_saved'
  | 'creation_failed'
  | 'board_created'
  | 'protected_playback_used'
  | 'usage_summary';

export interface AnalyticsEventMap {
  creation_started: { source: CreationSource };
  recording_completed: { source: 'device' | 'mic'; duration_bucket: DurationBucket };
  trim_viewed: { source: CreationSource };
  sound_saved: { source: CreationSource; clip_duration_bucket: DurationBucket; artwork: 'default' | 'gallery' };
  creation_failed: { source: CreationSource; stage: CreationStage; error_class: ErrorClass };
  board_created: { grid: '3x4' | '4x4'; navigation: 'pages' | 'scroll' };
  protected_playback_used: { repeat_mode: RepeatMode };
  usage_summary: { sound_count_bucket: SoundCountBucket; plays_bucket: PlaysBucket; boards_bucket: BoardsBucket };
}
export type AnalyticsEventProperties = AnalyticsEventMap[AnalyticsEventName];

const sourceValues = new Set(['device', 'mic', 'file']);
const durationValues = new Set(['0_5', '6_15', '16_30', '31_plus']);
const errorValues = new Set(['permission_denied', 'unavailable', 'invalid_media', 'limit_exceeded', 'storage', 'capture_failed', 'processing_failed', 'save_failed', 'unknown']);
const stageValues = new Set(['permission', 'capture', 'import', 'trim', 'save']);
const soundCountValues = new Set(['0', '1_10', '11_25', '26_50', '51_100', '101_150', '151_plus']);
const playsValues = new Set(['0', '1_10', '11_50', '51_100', '101_plus']);
const boardsValues = new Set(['0', '1', '2_5', '6_plus']);

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function hasEnum(set: Set<string>, value: unknown): boolean { return typeof value === 'string' && set.has(value); }

/** Validate at the application boundary; callers cannot smuggle arbitrary data through a typed cast. */
export function validateAnalyticsEvent(event: unknown, properties: unknown): properties is AnalyticsEventProperties {
  if (typeof event !== 'string' || !properties || typeof properties !== 'object' || Array.isArray(properties)) return false;
  const row = properties as Record<string, unknown>;
  switch (event) {
    case 'creation_started': case 'trim_viewed':
      return hasExactKeys(row, ['source']) && hasEnum(sourceValues, row.source);
    case 'recording_completed':
      return hasExactKeys(row, ['source', 'duration_bucket']) && typeof row.source === 'string' && ['device', 'mic'].includes(row.source) && hasEnum(durationValues, row.duration_bucket);
    case 'sound_saved':
      return hasExactKeys(row, ['source', 'clip_duration_bucket', 'artwork']) && hasEnum(sourceValues, row.source) && hasEnum(durationValues, row.clip_duration_bucket) && typeof row.artwork === 'string' && ['default', 'gallery'].includes(row.artwork);
    case 'creation_failed':
      return hasExactKeys(row, ['source', 'stage', 'error_class']) && hasEnum(sourceValues, row.source) && hasEnum(stageValues, row.stage) && hasEnum(errorValues, row.error_class);
    case 'board_created':
      return hasExactKeys(row, ['grid', 'navigation']) && typeof row.grid === 'string' && ['3x4', '4x4'].includes(row.grid) && typeof row.navigation === 'string' && ['pages', 'scroll'].includes(row.navigation);
    case 'protected_playback_used':
      return hasExactKeys(row, ['repeat_mode']) && typeof row.repeat_mode === 'string' && ['once', 'count', 'loop'].includes(row.repeat_mode);
    case 'usage_summary':
      return hasExactKeys(row, ['sound_count_bucket', 'plays_bucket', 'boards_bucket']) && hasEnum(soundCountValues, row.sound_count_bucket) && hasEnum(playsValues, row.plays_bucket) && hasEnum(boardsValues, row.boards_bucket);
    default: return false;
  }
}

export function durationBucket(seconds: number): DurationBucket | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds <= 5) return '0_5';
  if (seconds <= 15) return '6_15';
  if (seconds <= 30) return '16_30';
  return '31_plus';
}

export function soundCountBucket(count: number): SoundCountBucket | null {
  if (!Number.isSafeInteger(count) || count < 0) return null;
  if (count === 0) return '0'; if (count <= 10) return '1_10'; if (count <= 25) return '11_25'; if (count <= 50) return '26_50'; if (count <= 100) return '51_100'; if (count <= 150) return '101_150'; return '151_plus';
}

export function playsBucket(count: number): PlaysBucket | null {
  if (!Number.isSafeInteger(count) || count < 0) return null;
  if (count === 0) return '0'; if (count <= 10) return '1_10'; if (count <= 50) return '11_50'; if (count <= 100) return '51_100'; return '101_plus';
}

export function boardsBucket(count: number): BoardsBucket | null {
  if (!Number.isSafeInteger(count) || count < 0) return null;
  if (count === 0) return '0'; if (count === 1) return '1'; if (count <= 5) return '2_5'; return '6_plus';
}
