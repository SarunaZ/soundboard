import assert from 'node:assert/strict';
import test from 'node:test';

const completed = { version: 1, completed: true };

function memory() {
  const state = { marker: null, failRead: false, failWrite: false };
  return { state, storage: {
    async readCompletion() { if (state.failRead) throw new Error('read denied'); return structuredClone(state.marker); },
    async writeCompletion(value) { if (state.failWrite) throw new Error('write denied'); state.marker = structuredClone(value); },
  } };
}

function authority({ failOff = false, grant = 'on' } = {}) {
  const calls = [];
  const state = { consent: 'unknown', enabled: false };
  return { calls, state, service: {
    async initializeProductAnalytics() { calls.push('initialize'); },
    async setAnalyticsConsent(enabled) {
      calls.push(enabled);
      if (!enabled && failOff) throw new Error('off storage failed');
      if (enabled && grant === 'throw') throw new Error('activation denied');
      if (enabled && grant === 'noop') return;
      state.consent = enabled ? 'on' : 'off'; state.enabled = enabled;
    },
    getAnalyticsStatus() { return { ...state }; },
  } };
}

test('completion record accepts only the exact supported strict record', async () => {
  const { hasCompletedOnboarding } = await import('./storage.ts');
  assert.equal(hasCompletedOnboarding(completed), true);
  for (const record of [null, {}, { version: 2, completed: true }, { version: 1, completed: false }, { version: 1, completed: true, consent: true }, [], 'done']) {
    assert.equal(hasCompletedOnboarding(record), false);
  }
});

test('missing, corrupt, unreadable and incomplete records show Welcome without initializing analytics', async () => {
  const { OnboardingCoordinator } = await import('./finalize.ts');
  for (const marker of [null, { version: 8, completed: true }, { version: 1, completed: true, consent: true }, { version: 1, completed: false }]) {
    const local = memory(); local.state.marker = marker;
    const analytics = authority();
    const coordinator = new OnboardingCoordinator({ storage: local.storage, analytics: analytics.service });
    assert.equal(await coordinator.resolveStartup(), 'welcome');
    assert.deepEqual(analytics.calls, []);
  }
  const local = memory(); local.state.failRead = true;
  const analytics = authority();
  assert.equal(await new OnboardingCoordinator({ storage: local.storage, analytics: analytics.service }).resolveStartup(), 'welcome');
  assert.deepEqual(analytics.calls, []);
});

test('valid completion survives a cold coordinator restart and initializes shared analytics authority', async () => {
  const { OnboardingCoordinator } = await import('./finalize.ts');
  const local = memory(); local.state.marker = completed;
  const analytics = authority();
  const coordinator = new OnboardingCoordinator({ storage: local.storage, analytics: analytics.service });
  assert.equal(await coordinator.resolveStartup(), 'ready');
  assert.deepEqual(analytics.calls, ['initialize']);
  const restarted = new OnboardingCoordinator({ storage: local.storage, analytics: analytics.service });
  assert.equal(await restarted.resolveStartup(), 'ready');
  assert.deepEqual(analytics.calls, ['initialize', 'initialize']);
});

test('analytics initialization failure never repeats a saved onboarding choice', async () => {
  const { OnboardingCoordinator } = await import('./finalize.ts');
  const local = memory(); local.state.marker = completed;
  const analytics = authority(); analytics.service.initializeProductAnalytics = async () => { throw new Error('analytics unavailable'); };
  assert.equal(await new OnboardingCoordinator({ storage: local.storage, analytics: analytics.service }).resolveStartup(), 'ready');
});

test('explicit decline persists completion separately and writes OFF without requesting an identifier or transport', async () => {
  const { OnboardingCoordinator } = await import('./finalize.ts');
  const local = memory(); const analytics = authority();
  const result = await new OnboardingCoordinator({ storage: local.storage, analytics: analytics.service }).finishOnboardingChoice(false);
  assert.equal(result.completionSaved, true);
  assert.equal(result.consent, 'off');
  assert.deepEqual(local.state.marker, completed);
  assert.deepEqual(analytics.calls, [false]);
});

test('Share cannot grant when OFF persistence fails, completion fails, or activation resolves without effective ON', async () => {
  const { OnboardingCoordinator } = await import('./finalize.ts');
  const local = memory(); local.state.failWrite = true;
  const brokenOff = authority({ failOff: true });
  const first = await new OnboardingCoordinator({ storage: local.storage, analytics: brokenOff.service }).finishOnboardingChoice(true);
  assert.equal(first.consent, 'off');
  assert.equal(first.completionSaved, false);
  assert.deepEqual(brokenOff.calls, [false]);

  const offFailure = memory(); const failedOff = authority({ failOff: true });
  const deniedAfterOffFailure = await new OnboardingCoordinator({ storage: offFailure.storage, analytics: failedOff.service }).finishOnboardingChoice(true);
  assert.equal(deniedAfterOffFailure.consent, 'off');
  assert.equal(deniedAfterOffFailure.completionSaved, true);
  assert.deepEqual(offFailure.state.marker, completed);
  assert.deepEqual(failedOff.calls, [false]);

  for (const grant of ['noop', 'throw']) {
    const writable = memory(); const service = authority({ grant });
    const result = await new OnboardingCoordinator({ storage: writable.storage, analytics: service.service }).finishOnboardingChoice(true);
    assert.equal(result.consent, 'off');
    assert.equal(result.sharingUnavailable, true);
    assert.deepEqual(writable.state.marker, completed);
    assert.equal(service.calls.includes(true), true);
    assert.equal(service.calls.at(-1), false, 'failed or cancelled grant must explicitly close the authority');
  }
});

test('cold restart after either button preserves completion; unavailable Share is not a latent opt-in', async () => {
  const { OnboardingCoordinator } = await import('./finalize.ts');
  for (const share of [false, true]) {
    const local = memory(); const analytics = authority({ grant: 'throw' });
    const result = await new OnboardingCoordinator({ storage: local.storage, analytics: analytics.service }).finishOnboardingChoice(share);
    assert.equal(result.consent, 'off');
    assert.equal(await new OnboardingCoordinator({ storage: local.storage, analytics: analytics.service }).resolveStartup(), 'ready');
    assert.equal(analytics.state.consent, 'off');
  }
});

test('conflicting simultaneous choices serialize to the first explicit tap', async () => {
  const { OnboardingCoordinator } = await import('./finalize.ts');
  const local = memory(); const analytics = authority();
  let release;
  const originalWrite = local.storage.writeCompletion;
  local.storage.writeCompletion = async (value) => { await new Promise((resolve) => { release = resolve; }); await originalWrite(value); };
  const coordinator = new OnboardingCoordinator({ storage: local.storage, analytics: analytics.service });
  const first = coordinator.finishOnboardingChoice(false);
  const conflicting = coordinator.finishOnboardingChoice(true);
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  release();
  const [left, right] = await Promise.all([first, conflicting]);
  assert.deepEqual(left, right);
  assert.equal(left.consent, 'off');
  assert.deepEqual(analytics.calls, [false]);
});

test('completion storage uses an isolated marker separate from portable sound data', async () => {
  const { createOnboardingStorage } = await import('./storage.ts');
  const disk = new Map([['document://play-library/clip-index.json', 'user library']]);
  const paths = { document: { uri: 'document://' } };
  let failWrite = false;
  class Directory {
    constructor(parent, name) { this.uri = `${parent.uri}${name}/`; }
    get exists() { return [...disk.keys()].some((key) => key.startsWith(this.uri)); }
    create() {}
  }
  class File {
    constructor(parent, name) { this.uri = `${parent.uri}${name}`; this.name = name; }
    get exists() { return disk.has(this.uri); }
    textSync() { return disk.get(this.uri); }
    create({ overwrite }) { if (!overwrite && disk.has(this.uri)) throw new Error('already exists'); disk.set(this.uri, ''); }
    write(value) { if (failWrite) throw new Error('disk full'); disk.set(this.uri, value); }
    moveSync(target, { overwrite }) {
      if (disk.has(target.uri) && !overwrite) throw new Error('target exists');
      disk.set(target.uri, disk.get(this.uri)); disk.delete(this.uri);
    }
  }
  const firstProcess = createOnboardingStorage({ Directory, File, Paths: paths });
  assert.equal(await firstProcess.readCompletion(), null);
  await firstProcess.writeCompletion(completed);
  assert.deepEqual([...disk.keys()].sort(), ['document://play-library/clip-index.json', 'document://play-onboarding/completion.json']);
  const coldRestart = createOnboardingStorage({ Directory, File, Paths: paths });
  assert.deepEqual(await coldRestart.readCompletion(), completed);

  failWrite = true;
  await assert.rejects(coldRestart.writeCompletion({ version: 1, completed: true }), /disk full/);
  assert.deepEqual(await coldRestart.readCompletion(), completed, 'a failed replacement must preserve the last durable choice');

  const failingStorage = createOnboardingStorage({ Directory: class extends Directory { constructor(parent, name) { super(parent, name); } }, File: class extends File { constructor(parent, name) { super(parent, name); } }, Paths: { document: { uri: 'failed://' } } });
  // Inject failure into the writer after stage creation; no completion marker can be read after restart.
  await assert.rejects(failingStorage.writeCompletion(completed), /disk full/);
  assert.equal(await createOnboardingStorage({ Directory, File, Paths: { document: { uri: 'failed://' } } }).readCompletion(), null);
  assert.equal(disk.get('document://play-library/clip-index.json'), 'user library');
});
