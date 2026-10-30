import type { AnalyticsEventName } from './schema.ts';

export const PRODUCT_ANALYTICS_DIAGNOSTICS_ENABLED = process.env.EXPO_PUBLIC_PRODUCT_ANALYTICS_DIAGNOSTICS === 'true';
export const ANALYTICS_DIAGNOSTICS_PREFIX = 'STIMMYZ_ANALYTICS_QA';

const eventNames = new Set<AnalyticsEventName>([
  'creation_started', 'recording_completed', 'trim_viewed', 'sound_saved',
  'creation_failed', 'board_created', 'protected_playback_used', 'usage_summary',
]);
const propertyKeys = new Set([
  'source', 'duration_bucket', 'clip_duration_bucket', 'artwork', 'stage', 'error_class',
  'grid', 'navigation', 'repeat_mode', 'sound_count_bucket', 'plays_bucket', 'boards_bucket',
  '$geoip_disable', '$process_person_profile',
]);

export type AnalyticsDiagnostic =
  | { kind: 'init'; configured: boolean; consent: 'unknown' | 'off' | 'on' }
  | { kind: 'consent'; enabled: boolean }
  | { kind: 'gate'; open: boolean }
  | { kind: 'event'; name: AnalyticsEventName; propertyKeys: readonly string[] }
  | { kind: 'dispatch'; events: readonly string[]; propertyKeys: readonly string[]; geoipDisabled: boolean; profileProcessing: boolean }
  | { kind: 'response'; status: number }
  | { kind: 'abort'; requests: number }
  | { kind: 'failure'; reason: 'storage' | 'configuration' | 'initialization' | 'transport' | 'policy' };

type DiagnosticSink = (line: string) => void;

/**
 * Print only an explicit, allowlisted record. Values such as tokens, install IDs,
 * raw payloads, server text and exception messages can never cross this boundary.
 */
export function emitAnalyticsDiagnostic(
  record: AnalyticsDiagnostic,
  enabled = PRODUCT_ANALYTICS_DIAGNOSTICS_ENABLED,
  sink: DiagnosticSink = (line) => console.info(line),
): void {
  if (!enabled || !record || typeof record !== 'object') return;
  let safe: Record<string, unknown> | null = null;
  try { switch (record.kind) {
    case 'init':
      if (record.consent === 'unknown' || record.consent === 'off' || record.consent === 'on') safe = { kind: 'init', configured: record.configured === true, consent: record.consent };
      break;
    case 'consent': safe = { kind: 'consent', enabled: record.enabled === true }; break;
    case 'gate': safe = { kind: 'gate', open: record.open === true }; break;
    case 'event': {
      if (!eventNames.has(record.name)) break;
      safe = { kind: 'event', name: record.name, propertyKeys: sanitizeKeys(record.propertyKeys) };
      break;
    }
    case 'dispatch': {
      const events = [...new Set(record.events.filter((name): name is AnalyticsEventName => typeof name === 'string' && eventNames.has(name as AnalyticsEventName)))];
      safe = { kind: 'dispatch', endpoint: '/batch/', method: 'POST', events, propertyKeys: sanitizeKeys(record.propertyKeys), geoipDisabled: record.geoipDisabled === true, profileProcessing: record.profileProcessing === true };
      break;
    }
    case 'response':
      if (Number.isInteger(record.status) && record.status >= 100 && record.status <= 599) safe = { kind: 'response', status: record.status };
      break;
    case 'abort': safe = { kind: 'abort', requests: Number.isFinite(record.requests) ? Math.max(0, Math.min(50, Math.floor(record.requests))) : 0 }; break;
    case 'failure':
      if (record.reason === 'storage' || record.reason === 'configuration' || record.reason === 'initialization' || record.reason === 'transport' || record.reason === 'policy') safe = { kind: 'failure', reason: record.reason };
      break;
  } } catch { return; }
  if (!safe) return;
  try { sink(`${ANALYTICS_DIAGNOSTICS_PREFIX} ${JSON.stringify(safe)}`); } catch { /* diagnostics never affect app behavior */ }
}

function sanitizeKeys(keys: readonly string[]): string[] {
  return [...new Set(keys.filter((key): key is string => typeof key === 'string' && propertyKeys.has(key)))].sort();
}
