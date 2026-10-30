import { boardsBucket, playsBucket, soundCountBucket, validateAnalyticsEvent, type AnalyticsEventMap, type AnalyticsEventName, type AnalyticsEventProperties } from './schema.ts';
import { PostHogAnalyticsTransport, type AnalyticsEventTransport, type PostHogRequest } from './posthogAnalytics.ts';
import type { AnalyticsStorage } from './storage.ts';
import { emitAnalyticsDiagnostic } from './diagnostics.ts';

export type AnalyticsStatus = { consent: 'unknown' | 'off' | 'on'; configured: boolean; enabled: boolean };
export type AnalyticsConfig = { enabled: boolean; projectToken: string };
type ConsentRecord = { version: 2; enabled: boolean };
type IdentityRecord = { version: 1; installId: string };

export interface ProductAnalyticsDependencies {
  config: () => AnalyticsConfig;
  storage: () => Promise<AnalyticsStorage>;
  request?: PostHogRequest;
  createTransport?: (projectToken: string, installId: string, epoch: number, isCurrent: (epoch: number) => boolean) => Promise<AnalyticsEventTransport>;
  now?: () => number;
  randomInstallId?: () => string;
  /** Generic instances can exercise the lifecycle; the shipped device instance opts out until reviewed policy is approved. */
  activationPolicy?: () => boolean;
}

export interface AnalyticsService {
  initializeProductAnalytics(): Promise<void>;
  getAnalyticsStatus(): AnalyticsStatus;
  subscribeAnalyticsStatus(listener: (status: AnalyticsStatus) => void): () => void;
  setAnalyticsConsent(enabled: boolean): Promise<void>;
  trackAnalytics<K extends AnalyticsEventName>(event: K, properties: AnalyticsEventMap[K]): void;
  getAnalyticsEpoch(): number | null;
  recordPlaybackForSummary(): void;
  trackUsageSummary(counts: { soundCount: number; boardCount: number }): Promise<boolean>;
}

const validToken = (token: unknown): token is string => typeof token === 'string' && /^phc_[A-Za-z0-9_-]{8,196}$/.test(token);
export function analyticsConfiguration(env: Record<string, unknown>): AnalyticsConfig {
  const enabled = env.EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED === 'true';
  const projectToken = env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN;
  return { enabled: enabled && validToken(projectToken), projectToken: validToken(projectToken) ? projectToken : '' };
}

export class NoopAnalytics implements AnalyticsService {
  async initializeProductAnalytics() {}
  getAnalyticsStatus(): AnalyticsStatus { return { consent: 'off', configured: false, enabled: false }; }
  subscribeAnalyticsStatus(_listener: (status: AnalyticsStatus) => void): () => void { return () => {}; }
  async setAnalyticsConsent(_enabled: boolean) {}
  trackAnalytics<K extends AnalyticsEventName>(_event: K, _properties: AnalyticsEventMap[K]): void {}
  getAnalyticsEpoch(): number | null { return null; }
  recordPlaybackForSummary(): void {}
  async trackUsageSummary(_counts: { soundCount: number; boardCount: number }): Promise<boolean> { return false; }
}

export class ProductAnalytics implements AnalyticsService {
  private consent: AnalyticsStatus['consent'] = 'unknown';
  private configured = false;
  private installId: string | null = null;
  private transport: AnalyticsEventTransport | null = null;
  private epochCounter = 0;
  private epoch: number | null = null;
  private activationPermit: number | null = null;
  private consentRevision = 0;
  private initialized = false;
  private store: AnalyticsStorage | null = null;
  private listeners = new Set<(status: AnalyticsStatus) => void>();
  private operation: Promise<unknown> = Promise.resolve();
  private playCount = 0;
  private readonly deps: ProductAnalyticsDependencies;

  constructor(deps: ProductAnalyticsDependencies) { this.deps = deps; }

  getAnalyticsStatus(): AnalyticsStatus {
    return { consent: this.consent, configured: this.configured, enabled: this.consent === 'on' && this.configured && this.epoch !== null && this.transport !== null };
  }

  subscribeAnalyticsStatus(listener: (status: AnalyticsStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getAnalyticsStatus());
    return () => this.listeners.delete(listener);
  }

  private notify(): void { const status = this.getAnalyticsStatus(); for (const listener of this.listeners) listener(status); }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = this.operation.then(task, task);
    this.operation = next.then(() => undefined, () => undefined);
    return next;
  }

  private async loadStore(): Promise<AnalyticsStorage> {
    if (!this.store) this.store = await this.deps.storage();
    return this.store;
  }

  async initializeProductAnalytics(): Promise<void> {
    await this.serialize(async () => {
      if (this.initialized) return;
      if (!(this.deps.activationPolicy?.() ?? true)) {
        // Do not read legacy consent, identity or queued state while activation is unavailable.
        this.consent = 'off'; this.configured = false; this.installId = null; this.epoch = null; this.activationPermit = null;
        const previous = this.transport; this.transport = null; void previous?.revoke();
        this.initialized = true;
        emitAnalyticsDiagnostic({ kind: 'init', configured: false, consent: 'off' });
        emitAnalyticsDiagnostic({ kind: 'gate', open: false });
        this.notify(); return;
      }
      const config = this.deps.config();
      this.configured = config.enabled && validToken(config.projectToken);
      if (!this.configured) {
        this.consent = 'off'; this.initialized = true;
        emitAnalyticsDiagnostic({ kind: 'init', configured: false, consent: 'off' });
        emitAnalyticsDiagnostic({ kind: 'failure', reason: 'configuration' });
        this.notify(); return;
      }
      try {
        const storage = await this.loadStore();
        const record = await storage.readConsent();
        if (record === null) this.consent = 'unknown';
        else if (isConsentRecord(record)) this.consent = record.enabled ? 'on' : 'off';
        else this.consent = 'unknown';
        if (this.consent === 'on') await this.activate(config.projectToken, storage, this.consentRevision);
        emitAnalyticsDiagnostic({ kind: 'init', configured: true, consent: this.consent });
        emitAnalyticsDiagnostic({ kind: 'gate', open: this.getAnalyticsStatus().enabled });
      } catch {
        // Unreadable consent or identity is a closed gate; nothing is repaired implicitly.
        this.consent = 'unknown'; this.installId = null; this.epoch = null; this.activationPermit = null; this.transport?.revoke(); this.transport = null;
        emitAnalyticsDiagnostic({ kind: 'init', configured: true, consent: 'unknown' });
        emitAnalyticsDiagnostic({ kind: 'gate', open: false });
        emitAnalyticsDiagnostic({ kind: 'failure', reason: 'initialization' });
      }
      this.initialized = true;
      this.notify();
    });
  }

  async setAnalyticsConsent(enabled: boolean): Promise<void> {
    if (enabled && !(this.deps.activationPolicy?.() ?? true)) {
      this.consentRevision++; this.consent = 'off'; this.configured = false; this.epoch = null; this.activationPermit = null; this.epochCounter++; this.playCount = 0;
      const activeTransport = this.transport; this.transport = null; this.initialized = true;
      void activeTransport?.revoke();
      emitAnalyticsDiagnostic({ kind: 'consent', enabled: false }); emitAnalyticsDiagnostic({ kind: 'gate', open: false });
      emitAnalyticsDiagnostic({ kind: 'failure', reason: 'policy' }); this.notify();
      throw new Error('Analytics sharing is unavailable until its activation policy is approved.');
    }
    const expectedRevision = this.consentRevision;
    if (!enabled) {
      // Synchronously invalidate epochs and close the transport before queued persistence work.
      this.consentRevision++; this.consent = 'off'; this.epoch = null; this.activationPermit = null; this.epochCounter++; this.playCount = 0;
      const activeTransport = this.transport; this.transport = null;
      emitAnalyticsDiagnostic({ kind: 'consent', enabled: false });
      emitAnalyticsDiagnostic({ kind: 'gate', open: false });
      this.initialized = true; this.notify();
      void activeTransport?.revoke();
    }
    await this.serialize(async () => {
      const config = this.deps.config();
      const activationAllowed = this.deps.activationPolicy?.() ?? true;
      this.configured = activationAllowed && config.enabled && validToken(config.projectToken);
      if (enabled && this.consentRevision !== expectedRevision) return;
      if (enabled && !this.configured) {
        this.consent = 'off'; this.epoch = null; this.activationPermit = null;
        emitAnalyticsDiagnostic({ kind: 'failure', reason: 'configuration' });
        this.notify(); throw new Error('Analytics is not configured.');
      }
      const storage = await this.loadStore();
      if (enabled && this.consentRevision !== expectedRevision) return;
      if (!enabled) {
        // Gate was already closed synchronously above, before any awaited storage work.
        this.installId = null;
        let revokeError: unknown;
        try { await storage.writeConsent({ version: 2, enabled: false }); }
        catch (error) { revokeError = error; try { await storage.deleteConsent(); } catch { /* report persistence failure; remain closed in memory */ } }
        try { await storage.deleteIdentity(); } catch (error) { revokeError ??= error; }
        if (revokeError) throw new Error('Analytics consent is off in this session, but could not be fully saved on this device.');
        return;
      }
      // Persist explicit affirmative consent before creating a transport or issuing any request.
      await storage.writeConsent({ version: 2, enabled: true });
      emitAnalyticsDiagnostic({ kind: 'consent', enabled: true });
      try {
        if (this.consentRevision !== expectedRevision) return;
        this.consent = 'on';
        await this.activate(config.projectToken, storage, expectedRevision);
        if (this.consentRevision !== expectedRevision) return;
        this.consent = 'on'; this.initialized = true; this.notify();
        emitAnalyticsDiagnostic({ kind: 'gate', open: this.getAnalyticsStatus().enabled });
      } catch (error) {
        this.consent = 'off'; this.epoch = null; this.activationPermit = null; this.transport?.revoke(); this.transport = null; this.installId = null;
        emitAnalyticsDiagnostic({ kind: 'gate', open: false });
        emitAnalyticsDiagnostic({ kind: 'failure', reason: 'initialization' });
        try { await storage.writeConsent({ version: 2, enabled: false }); } catch { try { await storage.deleteConsent(); } catch { /* remain closed in memory */ } }
        try { await storage.deleteIdentity(); } catch { /* stale identity cannot be used without affirmative consent */ }
        this.notify(); throw error;
      }
    });
  }

  private async activate(projectToken: string, storage: AnalyticsStorage, expectedRevision: number): Promise<void> {
    if (this.consentRevision !== expectedRevision) return;
    const epoch = ++this.epochCounter;
    this.epoch = epoch;
    this.activationPermit = epoch;
    let raw = await storage.readIdentity();
    if (this.consentRevision !== expectedRevision || this.activationPermit !== epoch) return;
    let identity = isIdentityRecord(raw) ? raw : null;
    if (!identity) {
      identity = { version: 1, installId: this.deps.randomInstallId?.() ?? await randomInstallId() };
      if (!validInstallId(identity.installId)) throw new Error('Could not create an analytics installation ID.');
      await storage.writeIdentity(identity);
    }
    if (this.consentRevision !== expectedRevision || this.activationPermit !== epoch) return;
    this.installId = identity.installId;
    await this.transport?.revoke();
    const isCurrent = (value: number) => this.epoch === value && this.activationPermit === value && this.consentRevision === expectedRevision;
    const transport = this.deps.createTransport
      ? await this.deps.createTransport(projectToken, identity.installId, epoch, isCurrent)
      : await PostHogAnalyticsTransport.create(projectToken, identity.installId, epoch, isCurrent, this.deps.request);
    if (this.epoch !== epoch || this.activationPermit !== epoch || this.consentRevision !== expectedRevision) { await transport.revoke(); return; }
    this.transport = transport;
  }

  trackAnalytics<K extends AnalyticsEventName>(event: K, properties: AnalyticsEventMap[K]): void {
    const epoch = this.epoch;
    if (this.consent !== 'on' || !this.configured || epoch === null || !this.installId || !this.transport || !validateAnalyticsEvent(event, properties)) return;
    emitAnalyticsDiagnostic({ kind: 'event', name: event, propertyKeys: Object.keys(properties) });
    try { this.transport?.enqueue(event, properties, this.installId, epoch); } catch { /* analytics must not interrupt the app action being observed */ }
  }

  getAnalyticsEpoch(): number | null { return this.consent === 'on' && this.configured && this.transport !== null ? this.epoch : null; }

  recordPlaybackForSummary(): void { if (this.getAnalyticsEpoch() !== null) this.playCount = Math.min(Number.MAX_SAFE_INTEGER, this.playCount + 1); }

  async trackUsageSummary(counts: { soundCount: number; boardCount: number }): Promise<boolean> {
    const capturedEpoch = this.getAnalyticsEpoch();
    if (capturedEpoch === null || !Number.isSafeInteger(counts.soundCount) || !Number.isSafeInteger(counts.boardCount) || counts.soundCount < 0 || counts.boardCount < 0) return false;
    return this.serialize(async () => {
      if (this.getAnalyticsEpoch() !== capturedEpoch) return false;
      const sound_count_bucket = soundCountBucket(counts.soundCount);
      const plays_bucket = playsBucket(this.playCount);
      const boards_bucket = boardsBucket(counts.boardCount);
      if (!sound_count_bucket || !plays_bucket || !boards_bucket) return false;
      try {
        const storage = await this.loadStore();
        if (this.getAnalyticsEpoch() !== capturedEpoch) return false;
        const last = await storage.readLastSummaryAt();
        const now = (this.deps.now ?? Date.now)();
        if (last !== null) {
          if (!isSummaryRecord(last) || now < last.at || now - last.at < 24 * 60 * 60 * 1000) return false;
        }
        await storage.writeLastSummaryAt({ version: 1, at: now });
        if (this.getAnalyticsEpoch() !== capturedEpoch) return false;
        this.trackAnalytics('usage_summary', { sound_count_bucket, plays_bucket, boards_bucket });
        this.playCount = 0;
        return true;
      } catch { return false; }
    });
  }
}

function isConsentRecord(value: unknown): value is ConsentRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 2 && (value as ConsentRecord).version === 2 && typeof (value as ConsentRecord).enabled === 'boolean';
}
function isIdentityRecord(value: unknown): value is IdentityRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 2 && (value as IdentityRecord).version === 1 && validInstallId((value as IdentityRecord).installId);
}
function isSummaryRecord(value: unknown): value is { version: 1; at: number } {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 2 && (value as { version: number }).version === 1 && Number.isFinite((value as { at: number }).at) && (value as { at: number }).at >= 0;
}
function validInstallId(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
async function randomInstallId(): Promise<string> {
  // Expo Modules Core delegates to the native UUID v4 generator on device. Load it
  // only after the user has opted in; browser/host runtimes can use Web Crypto.
  try {
    const { uuid } = await import('expo-modules-core');
    const id = uuid.v4();
    if (validInstallId(id)) return id;
  } catch { /* use Web Crypto below where the native module is unavailable */ }
  const bytes = new Uint8Array(16);
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure random values are unavailable on this device.');
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const deviceService = new ProductAnalytics({
      config: () => analyticsConfiguration({ EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED: process.env.EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED, EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN: process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN }),
      activationPolicy: () => false,
  storage: async () => (await import('./storage.ts')).createDeviceAnalyticsStorage(),
});
export const initializeProductAnalytics = () => deviceService.initializeProductAnalytics();
export const getAnalyticsStatus = () => deviceService.getAnalyticsStatus();
export const subscribeAnalyticsStatus = (listener: (status: AnalyticsStatus) => void) => deviceService.subscribeAnalyticsStatus(listener);
export const setAnalyticsConsent = (enabled: boolean) => deviceService.setAnalyticsConsent(enabled);
export const trackAnalytics = <K extends AnalyticsEventName>(event: K, properties: AnalyticsEventMap[K]) => deviceService.trackAnalytics(event, properties);
export const getAnalyticsEpoch = () => deviceService.getAnalyticsEpoch();
export const recordPlaybackForSummary = () => deviceService.recordPlaybackForSummary();
export const trackUsageSummary = (counts: { soundCount: number; boardCount: number }) => deviceService.trackUsageSummary(counts);
