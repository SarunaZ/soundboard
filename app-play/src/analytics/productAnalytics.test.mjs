import assert from 'node:assert/strict';
import test from 'node:test';

const fixedInstallId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const projectToken = 'phc_1234567890abcdef';

function memoryStorage(initialConsent = null) {
  const state = { consent: initialConsent, identity: null, lastSummary: null };
  return {
    state,
    store: {
      async readConsent() { return state.consent; },
      async writeConsent(value) { state.consent = structuredClone(value); },
      async deleteConsent() { state.consent = null; },
      async readIdentity() { return state.identity; },
      async writeIdentity(value) { state.identity = structuredClone(value); },
      async deleteIdentity() { state.identity = null; },
      async readLastSummaryAt() { return state.lastSummary; },
      async writeLastSummaryAt(value) { state.lastSummary = structuredClone(value); },
    },
  };
}

function fakeTransport(events = []) {
  return {
    enqueue(event, properties, id, epoch) { events.push({ event, properties: structuredClone(properties), id, epoch }); },
    revoke() { events.push({ revoked: true }); },
  };
}

test('startup does not construct the analytics transport before consent', async () => {
  const { ProductAnalytics } = await import('./productAnalytics.ts');
  const native = memoryStorage();
  let transportConstructions = 0;
  const service = new ProductAnalytics({
    config: () => ({ enabled: true, projectToken }),
    storage: async () => native.store,
    createTransport: async () => { transportConstructions++; return fakeTransport(); },
  });
  service.trackAnalytics('creation_started', { source: 'file' });
  await service.initializeProductAnalytics();
  assert.equal(service.getAnalyticsStatus().consent, 'unknown');
  assert.equal(service.getAnalyticsEpoch(), null);
  assert.equal(transportConstructions, 0);
});

test('missing, corrupt, unreadable, or invalid config stays closed', async () => {
  const { ProductAnalytics, analyticsConfiguration } = await import('./productAnalytics.ts');
  assert.deepEqual(analyticsConfiguration({ EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED: 'true' }), { enabled: false, projectToken: '' });
  assert.deepEqual(analyticsConfiguration({ EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED: 'TRUE', EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN: projectToken }), { enabled: false, projectToken });
  for (const readConsent of [async () => ({ version: 9, enabled: true }), async () => { throw new Error('bad file'); }]) {
    const native = memoryStorage();
    native.store.readConsent = readConsent;
    let transports = 0;
    const service = new ProductAnalytics({ config: () => ({ enabled: true, projectToken }), storage: async () => native.store, createTransport: async () => { transports++; return fakeTransport(); } });
    await service.initializeProductAnalytics();
    assert.equal(service.getAnalyticsEpoch(), null);
    assert.equal(transports, 0);
  }
  const disabled = new ProductAnalytics({ config: () => ({ enabled: false, projectToken }), storage: async () => { throw new Error('must not read'); } });
  await disabled.initializeProductAnalytics();
  assert.equal(disabled.getAnalyticsStatus().enabled, false);
});

test('explicit opt-in persists consent and a separate installation ID before transport creation; no pre-consent events backfill', async () => {
  const { ProductAnalytics } = await import('./productAnalytics.ts');
  const native = memoryStorage();
  const events = [];
  let service;
  service = new ProductAnalytics({
    config: () => ({ enabled: true, projectToken }), storage: async () => native.store,
    randomInstallId: () => fixedInstallId,
    createTransport: async (_token, id, epoch, isCurrent) => {
      assert.deepEqual(native.state.consent, { version: 2, enabled: true });
      assert.deepEqual(native.state.identity, { version: 1, installId: fixedInstallId });
      assert.equal(isCurrent(epoch), true);
      return fakeTransport(events);
    },
  });
  service.trackAnalytics('creation_started', { source: 'file' });
  await service.initializeProductAnalytics();
  assert.equal(events.length, 0);
  await service.setAnalyticsConsent(true);
  assert.equal(service.getAnalyticsStatus().enabled, true);
  assert.equal(service.getAnalyticsEpoch(), 1);
  service.trackAnalytics('creation_started', { source: 'file' });
  assert.deepEqual(events[0], { event: 'creation_started', properties: { source: 'file' }, id: fixedInstallId, epoch: 1 });
});

test('revoke closes the gate synchronously, cancels pending opt-in and deletes the local identity', async () => {
  const { ProductAnalytics } = await import('./productAnalytics.ts');
  const native = memoryStorage();
  let resolveTransport;
  const events = [];
  const service = new ProductAnalytics({
    config: () => ({ enabled: true, projectToken }), storage: async () => native.store, randomInstallId: () => fixedInstallId,
    createTransport: async () => new Promise((resolve) => { resolveTransport = () => resolve(fakeTransport(events)); }),
  });
  await service.initializeProductAnalytics();
  const optingIn = service.setAnalyticsConsent(true);
  while (!resolveTransport) await new Promise((resolve) => setImmediate(resolve));
  const revoking = service.setAnalyticsConsent(false);
  assert.equal(service.getAnalyticsEpoch(), null);
  assert.equal(service.getAnalyticsStatus().enabled, false);
  resolveTransport();
  await Promise.all([optingIn, revoking]);
  assert.equal(native.state.consent.enabled, false);
  assert.equal(native.state.identity, null);
  assert.equal(events.some((event) => event.event), false);
});

test('restart restores only opt-in identity; summary count remains in memory and rollback is rejected', async () => {
  const { ProductAnalytics } = await import('./productAnalytics.ts');
  const native = memoryStorage({ version: 2, enabled: true });
  native.state.identity = { version: 1, installId: fixedInstallId };
  const events = [];
  let clock = 100_000_000;
  const service = new ProductAnalytics({ config: () => ({ enabled: true, projectToken }), storage: async () => native.store, now: () => clock, createTransport: async () => fakeTransport(events) });
  await service.initializeProductAnalytics();
  service.recordPlaybackForSummary();
  assert.equal(await service.trackUsageSummary({ soundCount: 10, boardCount: 2 }), true);
  assert.deepEqual(events[0].properties, { sound_count_bucket: '1_10', plays_bucket: '1_10', boards_bucket: '2_5' });
  assert.equal(await service.trackUsageSummary({ soundCount: 10, boardCount: 2 }), false);
  clock -= 1;
  assert.equal(await service.trackUsageSummary({ soundCount: 10, boardCount: 2 }), false);
  clock += 24 * 60 * 60 * 1000 + 1;
  assert.equal(await service.trackUsageSummary({ soundCount: 0, boardCount: 0 }), true);
  assert.equal(events[1].properties.plays_bucket, '0');
});

test('device activation policy ignores legacy opt-in, removes its identifier, and blocks Settings grants without SDK use', async () => {
  const { ProductAnalytics } = await import('./productAnalytics.ts');
  const native = memoryStorage({ version: 1, enabled: true });
  native.state.identity = { version: 1, installId: fixedInstallId };
  let reads = 0;
  native.store.readConsent = async () => { reads++; return native.state.consent; };
  let transports = 0;
  const service = new ProductAnalytics({
    config: () => ({ enabled: true, projectToken }), activationPolicy: () => false,
    storage: async () => native.store, createTransport: async () => { transports++; return fakeTransport(); },
  });
  await service.initializeProductAnalytics();
  assert.deepEqual(service.getAnalyticsStatus(), { consent: 'off', configured: false, enabled: false });
  assert.equal(reads, 0);
  await assert.rejects(service.setAnalyticsConsent(true), /activation policy/);
  await service.setAnalyticsConsent(false);
  assert.deepEqual(service.getAnalyticsStatus(), { consent: 'off', configured: false, enabled: false });
  assert.equal(reads, 0);
  assert.equal(transports, 0);
  assert.equal(native.state.identity, null);
});

test('analytics adapter exceptions never interrupt the app action being observed', async () => {
  const { ProductAnalytics } = await import('./productAnalytics.ts');
  const native = memoryStorage();
  const service = new ProductAnalytics({
    config: () => ({ enabled: true, projectToken }), storage: async () => native.store,
    randomInstallId: () => fixedInstallId,
    createTransport: async () => ({ enqueue() { throw new Error('transport failure with private details'); }, revoke() {} }),
  });
  await service.initializeProductAnalytics();
  await service.setAnalyticsConsent(true);
  assert.doesNotThrow(() => service.trackAnalytics('creation_started', { source: 'mic' }));
});

test('concurrent usage summary calls are serialized to one event per 24 hour window', async () => {
  const { ProductAnalytics } = await import('./productAnalytics.ts');
  const native = memoryStorage();
  const events = [];
  const service = new ProductAnalytics({
    config: () => ({ enabled: true, projectToken }), storage: async () => native.store,
    randomInstallId: () => fixedInstallId, createTransport: async () => fakeTransport(events), now: () => 200_000_000,
  });
  await service.initializeProductAnalytics();
  await service.setAnalyticsConsent(true);
  const results = await Promise.all([
    service.trackUsageSummary({ soundCount: 4, boardCount: 1 }),
    service.trackUsageSummary({ soundCount: 4, boardCount: 1 }),
  ]);
  assert.deepEqual(results, [true, false]);
  assert.equal(events.filter((event) => event.event === 'usage_summary').length, 1);
});
