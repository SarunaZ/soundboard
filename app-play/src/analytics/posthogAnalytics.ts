import type { PostHogCoreStateless, PostHogCoreOptions, PostHogFetchOptions, PostHogFetchResponse, PostHogPersistedProperty, PostHogEventProperties, JsonType } from '@posthog/core';
import { validateAnalyticsEvent, type AnalyticsEventName, type AnalyticsEventProperties } from './schema.ts';
import { emitAnalyticsDiagnostic } from './diagnostics.ts';

export const POSTHOG_EU_HOST = 'https://eu.i.posthog.com';

export interface AnalyticsEventTransport {
  enqueue(event: AnalyticsEventName, properties: AnalyticsEventProperties, distinctId: string, epoch: number): void;
  revoke(): Promise<void> | void;
}

export type PostHogRequest = (url: string, init: PostHogFetchOptions) => Promise<PostHogFetchResponse>;
type PersistedKey = PostHogPersistedProperty;
type CoreConstructor = new (token: string, options?: PostHogCoreOptions) => PostHogCoreStateless;
type CoreSdk = { PostHogCoreStateless: CoreConstructor; PostHogPersistedProperty: Record<string, PersistedKey> };

function acceptedEndpoint(url: string, method: string): boolean {
  try { const parsed = new URL(url); return parsed.origin === POSTHOG_EU_HOST && parsed.pathname === '/batch/' && parsed.search === '' && method === 'POST'; }
  catch { return false; }
}

/**
 * A small subclass of the official core SDK avoids the React Native SDK's unmanaged AppState
 * listener and optional native integrations. The core base has no automatic initialization
 * requests; the only allowed dispatch is its reviewed EU `/batch/` event endpoint.
 */
export class PostHogAnalyticsTransport implements AnalyticsEventTransport {
  private readonly requests = new Set<AbortController>();
  private active = true;
  private client: (PostHogCoreStateless & { captureProduct(event: string, properties: PostHogEventProperties): void }) | null = null;
  private readonly persisted = new Map<PersistedKey, unknown>();
  private persistedPropertyKeys: Record<string, PersistedKey> | null = null;
  private readonly isCurrent: (epoch: number) => boolean;
  private readonly epoch: number;
  private readonly installId: string;

  private constructor(isCurrent: (epoch: number) => boolean, epoch: number, installId: string) { this.isCurrent = isCurrent; this.epoch = epoch; this.installId = installId; }

  static async create(
    projectToken: string,
    installId: string,
    epoch: number,
    isCurrent: (epoch: number) => boolean,
    request: PostHogRequest = (url, init) => fetch(url, init),
    loadCore: () => Promise<CoreSdk> = async () => await import('@posthog/core') as unknown as CoreSdk,
  ): Promise<PostHogAnalyticsTransport> {
    const adapter = new PostHogAnalyticsTransport(isCurrent, epoch, installId);
    const { PostHogCoreStateless, PostHogPersistedProperty } = await loadCore();
    adapter.persistedPropertyKeys = PostHogPersistedProperty;
    const owner = adapter;
    class ProductPostHogCore extends PostHogCoreStateless {
      fetch(url: string, options: PostHogFetchOptions): Promise<PostHogFetchResponse> {
        if (!acceptedEndpoint(url, options.method) || !owner.active || !owner.isCurrent(owner.epoch)) {
          emitAnalyticsDiagnostic({ kind: 'failure', reason: 'transport' });
          return Promise.reject(new Error('Analytics transport gate closed.'));
        }
        const filteredBody = sanitizePostHogBatchBody(options.body, projectToken, installId, Date.now());
        if (filteredBody === null) return Promise.resolve({ status: 200, text: async () => '', json: async () => ({}) });
        const safePayload = JSON.parse(filteredBody) as { batch: Array<{ event: string; properties: Record<string, unknown> }> };
        const batch = safePayload.batch;
        const keys = [...new Set(batch.flatMap((entry) => Object.keys(entry.properties)))];
        emitAnalyticsDiagnostic({
          kind: 'dispatch', events: batch.map((entry) => entry.event), propertyKeys: keys,
          geoipDisabled: batch.every((entry) => entry.properties.$geoip_disable === true),
          profileProcessing: batch.some((entry) => entry.properties.$process_person_profile !== false),
        });
        const controller = new AbortController();
        const cancel = () => controller.abort();
        options.signal?.addEventListener('abort', cancel, { once: true });
        owner.requests.add(controller);
        try {
          if (!owner.active || !owner.isCurrent(owner.epoch)) throw new Error('Analytics transport gate closed.');
          return request(url, { ...options, body: filteredBody, signal: controller.signal }).then((response) => {
            emitAnalyticsDiagnostic({ kind: 'response', status: response.status });
            return response;
          }, () => {
            emitAnalyticsDiagnostic({ kind: 'failure', reason: 'transport' });
            throw new Error('Analytics transport request failed.');
          }).finally(() => {
            options.signal?.removeEventListener('abort', cancel);
            owner.requests.delete(controller);
          });
        } catch {
          options.signal?.removeEventListener('abort', cancel);
          owner.requests.delete(controller);
          emitAnalyticsDiagnostic({ kind: 'failure', reason: 'transport' });
          return Promise.reject(new Error('Analytics transport request failed.'));
        }
      }
      getLibraryId(): string { return 'posthog-core'; }
      getLibraryVersion(): string { return '1.61.2'; }
      getCustomUserAgent(): string | void { return undefined; }
      getPersistedProperty<T>(key: PersistedKey): T | undefined { return owner.persisted.get(key) as T | undefined; }
      setPersistedProperty<T>(key: PersistedKey, value: T | null): void { if (value === null) owner.persisted.delete(key); else owner.persisted.set(key, value); }
      protected getCommonEventProperties(): PostHogEventProperties { return {}; }
      protected processBeforeEnqueue(message: PostHogEventProperties): PostHogEventProperties | null {
        const properties = sanitizeEvent(message.event, message.properties);
        if (!properties || message.distinct_id !== owner.installId) return null;
        const timestamp = typeof message.timestamp === 'string' || message.timestamp instanceof Date ? message.timestamp : undefined;
        const uuid = typeof message.uuid === 'string' ? message.uuid : undefined;
        return { distinct_id: owner.installId, event: message.event, properties, ...(timestamp ? { timestamp: timestamp as JsonType } : {}), ...(uuid ? { uuid } : {}) };
      }
      captureProduct(event: string, properties: PostHogEventProperties): void {
        this.captureStateless(owner.installId, event, properties, { disableGeoip: true });
      }
    }
    const client = new ProductPostHogCore(projectToken, {
      host: POSTHOG_EU_HOST,
      defaultOptIn: false,
      flushAt: 1,
      flushInterval: 0,
      maxQueueSize: 50,
      maxBatchSize: 50,
      fetchRetryCount: 0,
      disableGeoip: true,
      disableCompression: true,
    });
    adapter.client = client;
    await client.optIn();
    if (!adapter.active || !isCurrent(epoch)) { await adapter.revoke(); throw new Error('Analytics consent changed during SDK initialization.'); }
    // Guard against a future core constructor behavior change: verify no queue was created by init.
    adapter.persisted.set(PostHogPersistedProperty.OptedOut, false);
    return adapter;
  }

  enqueue(event: AnalyticsEventName, properties: AnalyticsEventProperties, distinctId: string, epoch: number): void {
    if (!this.active || epoch !== this.epoch || !this.isCurrent(epoch) || distinctId !== this.installId || !validateAnalyticsEvent(event, properties)) return;
    const clean = sanitizeEvent(event, properties);
    if (!clean || !this.client || !this.active || !this.isCurrent(epoch)) return;
    this.client.captureProduct(event, clean);
  }

  async revoke(): Promise<void> {
    this.active = false;
    emitAnalyticsDiagnostic({ kind: 'abort', requests: this.requests.size });
    for (const request of this.requests) request.abort();
    this.requests.clear();
    const client = this.client;
    const keys = this.persistedPropertyKeys;
    this.persisted.clear();
    if (client && keys) {
      client.setPersistedProperty(keys.Queue, []);
      client.setPersistedProperty(keys.DistinctId, null);
      client.setPersistedProperty(keys.AnonymousId, null);
      client.setPersistedProperty(keys.DeviceId, null);
      client.setPersistedProperty(keys.OptedOut, true);
    }
    this.client = null;
  }
}

/** Final SDK queue boundary. SDK-generated properties are discarded, then payload is validated. */
export function sanitizeEvent(event: unknown, properties: unknown): AnalyticsEventProperties | null {
  if (typeof event !== 'string' || !properties || typeof properties !== 'object' || Array.isArray(properties)) return null;
  const row = properties as Record<string, unknown>;
  let clean: AnalyticsEventProperties;
  switch (event) {
    case 'creation_started': case 'trim_viewed': clean = { source: row.source as 'device' | 'mic' | 'file' }; break;
    case 'recording_completed': clean = { source: row.source as 'device' | 'mic', duration_bucket: row.duration_bucket as '0_5' | '6_15' | '16_30' | '31_plus' }; break;
    case 'sound_saved': clean = { source: row.source as 'device' | 'mic' | 'file', clip_duration_bucket: row.clip_duration_bucket as '0_5' | '6_15' | '16_30' | '31_plus', artwork: row.artwork as 'default' | 'gallery' }; break;
    case 'creation_failed': clean = { source: row.source as 'device' | 'mic' | 'file', stage: row.stage as 'permission' | 'capture' | 'import' | 'trim' | 'save', error_class: row.error_class as 'permission_denied' | 'unavailable' | 'invalid_media' | 'limit_exceeded' | 'storage' | 'capture_failed' | 'processing_failed' | 'save_failed' | 'unknown' }; break;
    case 'board_created': clean = { grid: row.grid as '3x4' | '4x4', navigation: row.navigation as 'pages' | 'scroll' }; break;
    case 'protected_playback_used': clean = { repeat_mode: row.repeat_mode as 'once' | 'count' | 'loop' }; break;
    case 'usage_summary': clean = { sound_count_bucket: row.sound_count_bucket as '0' | '1_10' | '11_25' | '26_50' | '51_100' | '101_150' | '151_plus', plays_bucket: row.plays_bucket as '0' | '1_10' | '11_50' | '51_100' | '101_plus', boards_bucket: row.boards_bucket as '0' | '1' | '2_5' | '6_plus' }; break;
    default: return null;
  }
  return validateAnalyticsEvent(event, clean) ? clean : null;
}

/** Re-sanitize buffered SDK events and enforce the 24 hour TTL immediately before dispatch. */
export function sanitizePostHogBatchBody(value: unknown, token: string, installId: string, now: number): string | null {
  if (typeof value !== 'string') return null;
  let parsed: unknown;
  try { parsed = JSON.parse(value) as unknown; } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const body = parsed as { api_key?: unknown; batch?: unknown };
  if (body.api_key !== token || !Array.isArray(body.batch)) return null;
  const batch = body.batch.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const row = entry as { event?: unknown; distinct_id?: unknown; properties?: unknown; timestamp?: unknown; uuid?: unknown };
    if (row.distinct_id !== installId || typeof row.timestamp !== 'string') return [];
    const time = Date.parse(row.timestamp);
    if (!Number.isFinite(time) || now < time || now - time > 24 * 60 * 60 * 1000) return [];
    const properties = sanitizeEvent(row.event, row.properties);
    if (!properties || typeof row.event !== 'string') return [];
    return [{ ...(typeof row.uuid === 'string' ? { uuid: row.uuid } : {}), event: row.event, distinct_id: installId, properties: { ...properties, $geoip_disable: true, $process_person_profile: false }, timestamp: new Date(time).toISOString() }];
  });
  return batch.length ? JSON.stringify({ api_key: token, batch }) : null;
}
