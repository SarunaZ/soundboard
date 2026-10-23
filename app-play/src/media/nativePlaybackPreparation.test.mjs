import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const modulePath = fileURLToPath(new URL('./nativePlaybackPreparation.ts', import.meta.url));
const dspUrl = new URL('./playbackDsp.ts', import.meta.url).href;

async function loadFacade(t, { platform = 'android', module = null } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'soundboard-native-prep-'));
  const facadeFile = path.join(directory, 'nativePlaybackPreparation.ts');
  writeFileSync(path.join(directory, 'fakeExpo.mjs'), 'export function requireOptionalNativeModule() { return globalThis.__nativePreparationModule; }');
  writeFileSync(path.join(directory, 'fakeReactNative.mjs'), "export const Platform = { get OS() { return globalThis.__nativePreparationPlatform; } };");
  const source = readFileSync(modulePath, 'utf8')
    .replace("from 'expo';", "from './fakeExpo.mjs';")
    .replace("from 'react-native';", "from './fakeReactNative.mjs';")
    .replace("from './playbackDsp';", `from '${dspUrl}';`);
  writeFileSync(facadeFile, source);
  globalThis.__nativePreparationPlatform = platform;
  globalThis.__nativePreparationModule = module;
  const facade = await import(`${pathToFileURL(facadeFile).href}?run=${Math.random()}`);
  t.after(() => {
    delete globalThis.__nativePreparationPlatform;
    delete globalThis.__nativePreparationModule;
    rmSync(directory, { recursive: true, force: true });
  });
  return facade;
}

function makeNativeModule(poll) {
  const calls = { starts: 0, polls: 0, cancels: 0 };
  return {
    calls,
    startPlaybackPreparation(channels, gain, sampleRate) {
      calls.starts += 1;
      assert.equal(channels.length, 1);
      assert.equal(gain, 2);
      assert.equal(sampleRate, 48_000);
      return 'job-1';
    },
    pollPlaybackPreparation(jobId) {
      assert.equal(jobId, 'job-1');
      calls.polls += 1;
      return poll(calls);
    },
    cancelPlaybackPreparation(jobId) {
      assert.equal(jobId, 'job-1');
      calls.cancels += 1;
    },
  };
}

test('facade copies completed native output and validates its shape', async (t) => {
  const channel = new Float32Array([0.2, -0.4]);
  const native = makeNativeModule(() => ({
    state: 'ready', processed: true, clipGain: 1, peakBound: 0.7,
    channels: [new Float32Array([0.2, -0.4]).buffer],
  }));
  const facade = await loadFacade(t, { module: native });
  const result = await facade.prepareNativePlaybackPcm([channel], 2, 48_000);
  assert.equal(native.calls.starts, 1);
  assert.equal(result.processed, true);
  assert.ok(Math.abs(result.channels[0][0] - 0.2) < 1e-7);
  assert.ok(Math.abs(result.channels[0][1] + 0.4) < 1e-7);
  assert.equal(native.calls.cancels, 0);
});

test('facade accepts a quiet result without allocating returned PCM', async (t) => {
  const native = makeNativeModule(() => ({ state: 'ready', processed: false, clipGain: 2, peakBound: 0.2, channels: [] }));
  const facade = await loadFacade(t, { module: native });
  const result = await facade.prepareNativePlaybackPcm([new Float32Array(4)], 2, 48_000);
  assert.deepEqual(result, { processed: false, clipGain: 2, peakBound: 0.2, channels: [] });
});

test('cancellation signals native job and waits for terminal status', async (t) => {
  const native = makeNativeModule((calls) => calls.cancels ? { state: 'cancelled' } : { state: 'pending' });
  const facade = await loadFacade(t, { module: native });
  const result = await facade.prepareNativePlaybackPcm([new Float32Array(4)], 2, 48_000, () => native.calls.polls >= 2);
  assert.equal(result, null);
  assert.equal(native.calls.cancels, 1);
  assert.equal(native.calls.polls, 3);
});

test('already cancelled work never starts a native preparation job', async (t) => {
  const native = makeNativeModule(() => ({ state: 'pending' }));
  const facade = await loadFacade(t, { module: native });
  const result = await facade.prepareNativePlaybackPcm([new Float32Array(4)], 2, 48_000, () => true);
  assert.equal(result, null);
  assert.equal(native.calls.starts, 0);
  assert.equal(native.calls.polls, 0);
});

test('native completion racing cancellation is discarded and never returned', async (t) => {
  const native = makeNativeModule((calls) => calls.cancels
    ? { state: 'ready', processed: true, clipGain: 1, peakBound: 0.7, channels: [new Float32Array(4).buffer] }
    : { state: 'pending' });
  const facade = await loadFacade(t, { module: native });
  const result = await facade.prepareNativePlaybackPcm([new Float32Array(4)], 2, 48_000, () => native.calls.polls >= 2);
  assert.equal(result, null);
  assert.equal(native.calls.cancels, 1);
});

test('native failures and invalid output are surfaced', async (t) => {
  const failed = makeNativeModule(() => ({ state: 'failed', message: 'native allocation failed' }));
  const facade = await loadFacade(t, { module: failed });
  await assert.rejects(facade.prepareNativePlaybackPcm([new Float32Array(4)], 2, 48_000), /native allocation failed/);

  const malformed = makeNativeModule(() => ({ state: 'ready', processed: true, clipGain: 1, peakBound: Number.NaN, channels: [new Float32Array(4).buffer] }));
  const otherFacade = await loadFacade(t, { module: malformed });
  await assert.rejects(otherFacade.prepareNativePlaybackPcm([new Float32Array(4)], 2, 48_000), /invalid peak bound/);

  const malformedQuiet = makeNativeModule(() => ({ state: 'ready', processed: false, clipGain: 1, peakBound: 0.2, channels: [new Float32Array(4).buffer] }));
  const quietFacade = await loadFacade(t, { module: malformedQuiet });
  await assert.rejects(quietFacade.prepareNativePlaybackPcm([new Float32Array(4)], 2, 48_000), /audio for an unprocessed clip/);

  const invalidFlag = makeNativeModule(() => ({ state: 'ready', processed: 'false', clipGain: 1, peakBound: 0.2, channels: [] }));
  const flagFacade = await loadFacade(t, { module: invalidFlag });
  await assert.rejects(flagFacade.prepareNativePlaybackPcm([new Float32Array(4)], 2, 48_000), /invalid processing status/);
});

test('Android with no registered module errors instead of falling back', async (t) => {
  const facade = await loadFacade(t);
  await assert.rejects(facade.prepareNativePlaybackPcm([new Float32Array(4)], 2, 48_000), /Rebuild and reinstall/);
  assert.throws(facade.assertNativePlaybackPreparationAvailable, /Rebuild and reinstall/);
});

test('Android with an older registered module gives rebuild guidance for the missing API', async (t) => {
  const facade = await loadFacade(t, { module: { startPlaybackPreparation() {} } });
  await assert.rejects(facade.prepareNativePlaybackPcm([new Float32Array(4)], 2, 48_000), /Rebuild and reinstall/);
  assert.throws(facade.assertNativePlaybackPreparationAvailable, /Rebuild and reinstall/);
});
