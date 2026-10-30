import { durationBucket, type AnalyticsEventName, type AnalyticsEventProperties, type CreationSource, type CreationStage, type ErrorClass } from '../analytics/schema.ts';

type Track = (event: AnalyticsEventName, properties: AnalyticsEventProperties) => void;

/** Per-flow event gate and cardinality guard. Keeps flow IDs and source metadata on-device. */
export function createCreateFlowAnalytics(epoch: number | null, getCurrentEpoch: () => number | null, track: Track) {
  let source: CreationSource | null = null;
  let started = false;
  let trimViewed = false;
  let soundSaved = false;
  const allowed = () => epoch !== null && getCurrentEpoch() === epoch;

  return {
    start(candidate: CreationSource) {
      if (started) return;
      started = true;
      if (allowed()) track('creation_started', { source: candidate });
    },
    adopt(candidate: CreationSource) { source = candidate; },
    trimViewed() {
      if (!source || trimViewed) return;
      trimViewed = true;
      if (allowed()) track('trim_viewed', { source });
    },
    recordingCompleted(recordingSource: 'device' | 'mic', seconds: number) {
      const duration_bucket = durationBucket(seconds);
      if (duration_bucket && allowed()) track('recording_completed', { source: recordingSource, duration_bucket });
    },
    saved(seconds: number, artwork: 'default' | 'gallery') {
      if (soundSaved) return;
      const clip_duration_bucket = durationBucket(seconds);
      if (source && clip_duration_bucket && allowed()) {
        soundSaved = true;
        track('sound_saved', { source, clip_duration_bucket, artwork });
      }
    },
    failed(stage: CreationStage, error_class: ErrorClass, sourceHint?: CreationSource) {
      const failureSource = sourceHint ?? source;
      if (failureSource && allowed()) track('creation_failed', { source: failureSource, stage, error_class });
    },
  };
}
