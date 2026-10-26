import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { calculateMixHeadroom, createSoftLimiterCurve, LIMITER_CEILING, playbackGainFromControl, processClipPcm, safeClipGain, softLimitSample } from './playbackDsp.ts';

const enginePath = fileURLToPath(new URL('./playbackEngine.ts', import.meta.url));
const dspUrl = new URL('./playbackDsp.ts', import.meta.url).href;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function makeBuffer({ duration, length, numberOfChannels, sampleRate, value = 1, lazy = false }) {
  const channels = Array.from({ length: numberOfChannels }, () => lazy
    ? new Proxy({ length }, { get(target, key) { return key === 'length' ? target.length : key === Symbol.iterator ? undefined : 0; } })
    : new Float32Array(length).fill(value));
  return {
    duration, length, numberOfChannels, sampleRate,
    getChannelData: (index) => channels[index],
    copyToChannel(source, index) { channels[index].set(source); },
  };
}

function makeHarness() {
  const h = { time: 5, sources: [], gains: [], shapers: [], outputBufferCreations: 0, activeDecodes: 0, maxConcurrentDecodes: 0, deferEndedOnStop: false, resumePromise: null, decode: (uri) => Promise.resolve({
    ...makeBuffer({ duration: 2, length: 96_000, numberOfChannels: 2, sampleRate: 48_000 }), uri,
  }) };
  h.context = {
    state: 'running',
    resumeCalls: 0,
    suspendCalls: 0,
    async resume() { this.resumeCalls += 1; await h.resumePromise; this.state = 'running'; },
    async suspend() { this.suspendCalls += 1; this.state = 'suspended'; },
    get currentTime() { return h.time; },
    destination: {},
    decodeAudioData: (uri) => h.decode(uri),
    createGain: () => {
      const node = { gain: { value: 1, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; } }, connect() {}, disconnect() { this.disconnected = true; } };
      h.gains.push(node);
      return node;
    },
    createWaveShaper: () => { const node = { curve: null, oversample: 'none', connect() {} }; h.shapers.push(node); return node; },
    createBuffer: (numberOfChannels, length, sampleRate) => {
      h.outputBufferCreations += 1;
      return makeBuffer({ duration: length / sampleRate, length, numberOfChannels, sampleRate, value: 0 });
    },
    createBufferSource: () => {
      const source = { buffer: null, loop: false, onEnded: null, starts: [], stops: [], connect() {},
        start(when) { this.starts.push(when); }, stop(when) { this.stops.push(when); if (when <= h.time + 0.01) { if (h.deferEndedOnStop) this.pendingEnded = true; else queueMicrotask(() => this.onEnded?.({})); } },
        disconnect() { this.disconnected = true; }, end() { this.onEnded?.({}); } };
      h.sources.push(source);
      return source;
    },
  };
  return h;
}

async function loadEngine(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'soundboard-playback-'));
  const fakePath = path.join(directory, 'fakeContext.mjs');
  const fakeReactNative = path.join(directory, 'fakeReactNative.mjs');
  const fakeAudioManager = path.join(directory, 'fakeAudioManager.mjs');
  const fakePreparation = path.join(directory, 'fakePreparation.mjs');
  const engineFile = path.join(directory, 'playbackEngine.ts');
  const source = readFileSync(enginePath, 'utf8')
    .replace("from 'react-native-audio-api/lib/module/core/AudioContext';", "from './fakeContext.mjs';")
    .replace("from './playbackDsp';", `from '${dspUrl}';`)
    .replace("from 'react-native';", "from './fakeReactNative.mjs';")
    .replace("from 'react-native-audio-api/lib/module/system/AudioManager';", "from './fakeAudioManager.mjs';")
    .replace("from './nativePlaybackPreparation';", "from './fakePreparation.mjs';");
  writeFileSync(fakePath, 'export default class FakeAudioContext { constructor() { return globalThis.__playbackHarness.context; } }');
  writeFileSync(fakeReactNative, "export const Platform = { get OS() { return globalThis.__playbackHarness.platform; } };");
  writeFileSync(fakeAudioManager, 'export default globalThis.__playbackHarness.audioManager;');
  writeFileSync(fakePreparation, `
    import { conservativePeakBound, conservativePeakEstimate, LIMITER_CEILING, processClipPcm } from '${dspUrl}';
    export function assertNativePlaybackPreparationAvailable() {
      const h = globalThis.__playbackHarness;
      if (h.platform === 'android' && !h.nativeAvailable) throw new Error('Native playback preparation is unavailable. Rebuild and reinstall the Android app to enable boosted playback.');
    }
    export async function prepareNativePlaybackPcm(channels, gain, sampleRate, shouldCancel) {
      const h = globalThis.__playbackHarness;
      h.nativeCalls += 1;
      if (h.nativePrepare) return h.nativePrepare(channels, gain, sampleRate, shouldCancel);
      let peak = 0;
      let finite = true;
      for (const channel of channels) for (const sample of channel) {
        if (!Number.isFinite(sample)) finite = false;
        else peak = Math.max(peak, Math.abs(sample));
      }
      if (finite && conservativePeakEstimate(peak * gain) <= LIMITER_CEILING) {
        return { processed: false, clipGain: gain, peakBound: conservativePeakBound(peak * gain), channels: [] };
      }
      const result = await processClipPcm(channels, gain, sampleRate, shouldCancel);
      return { processed: true, clipGain: 1, peakBound: result.peak, channels: result.channels };
    }
  `);
  writeFileSync(engineFile, source);
  const harness = makeHarness();
  harness.platform = 'ios';
  harness.nativeAvailable = true;
  harness.nativeCalls = 0;
  harness.nativePrepare = null;
  harness.audioManager = {
    observeCalls: [], listeners: [],
    observeAudioInterruptions(value) { this.observeCalls.push(value); },
    addSystemEventListener(name, callback) { this.listeners.push({ name, callback }); return { remove() {} }; },
  };
  globalThis.__playbackHarness = harness;
  const engine = await import(`${pathToFileURL(engineFile).href}?run=${Math.random()}`);
  t.after(() => {
    engine.stop();
    if (harness.deferEndedOnStop) harness.sources.forEach((source) => source.end());
    delete globalThis.__playbackHarness;
    rmSync(directory, { recursive: true, force: true });
  });
  return { engine, harness };
}

test('soft limiter curve is a bounded final-stage fail-safe', () => {
  assert.equal(softLimitSample(0), 0);
  assert.equal(softLimitSample(0.1), 0.1);
  assert.equal(softLimitSample(-0.5), -0.5);
  for (const sample of [1, 1.5, 2, -1, -1.5, -2]) {
    assert.ok(Math.abs(softLimitSample(sample)) <= 0.9991);
  }
  assert.equal(softLimitSample(Number.NaN), 0);
  const curve = createSoftLimiterCurve();
  assert.ok(curve instanceof Float32Array);
  assert.ok(Math.abs(curve[0]) <= 1);
  assert.ok(curve.at(-1) <= 1);
  assert.equal(safeClipGain(0, true), 0);
  assert.equal(safeClipGain(2, true), 2);
  assert.equal(playbackGainFromControl(0, true), 0);
  assert.equal(playbackGainFromControl(1, true), 1);
  assert.ok(Math.abs(playbackGainFromControl(1.5, true) - 10 ** (6 / 20)) < 1e-12);
  assert.ok(Math.abs(playbackGainFromControl(2, true) - 10 ** (12 / 20)) < 1e-12);
  assert.equal(playbackGainFromControl(0.5, true), 0.5);
});

test('quiet 200% clips start from decoded PCM without offline buffer processing', async (t) => {
  const { engine, harness } = await loadEngine(t);
  const decoded = makeBuffer({ duration: 2, length: 96_000, numberOfChannels: 2, sampleRate: 48_000, value: 0.1 });
  harness.decode = () => Promise.resolve(decoded);
  await engine.play('quiet-boost', 'pad-quiet-boost', { gain: 2 });
  assert.equal(harness.outputBufferCreations, 0);
  assert.equal(harness.sources[0].buffer, decoded);
  assert.ok(Math.abs(harness.gains.at(-1).gain.value - 10 ** (12 / 20)) < 1e-6);
});

test('a suspended AudioContext resumes before a cold pad is scheduled', async (t) => {
  const { engine, harness } = await loadEngine(t);
  const resume = deferred();
  harness.resumePromise = resume.promise;
  harness.context.state = 'suspended';
  const pending = engine.play('cold', 'pad-cold');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.sources.length, 0, 'audio must wait for native output to resume');
  resume.resolve();
  await pending;
  assert.equal(harness.context.resumeCalls, 1);
  assert.equal(harness.context.state, 'running');
  assert.equal(harness.sources.length, 1);
});

test('a superseding pad during context resume never starts the old request', async (t) => {
  const { engine, harness } = await loadEngine(t);
  const resume = deferred();
  harness.resumePromise = resume.promise;
  harness.context.state = 'suspended';
  const old = engine.play('old-during-resume', 'pad-old');
  const latest = engine.play('latest-during-resume', 'pad-latest');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.sources.length, 0);
  resume.resolve();
  await Promise.all([old, latest]);
  assert.equal(harness.sources.length, 1);
  assert.equal(engine.getPlaybackSnapshot().voices[0].padId, 'pad-latest');
});

test('stop during context resume prevents the pending pad from starting', async (t) => {
  const { engine, harness } = await loadEngine(t);
  const resume = deferred();
  harness.resumePromise = resume.promise;
  harness.context.state = 'suspended';
  const pending = engine.play('stopped-during-resume', 'pad-stopped');
  await new Promise((resolve) => setTimeout(resolve, 0));
  engine.stop();
  resume.resolve();
  await pending;
  assert.equal(harness.sources.length, 0);
  assert.deepEqual(engine.getPlaybackSnapshot(), { voices: [], pendingProtected: [], active: false });
});

test('a cancelled deferred resume is suspended after it finishes in the background', async (t) => {
  const { engine, harness } = await loadEngine(t);
  const resume = deferred();
  harness.context.state = 'suspended';
  harness.resumePromise = resume.promise;
  const pending = engine.play('resume-cancelled', 'pad-resume-cancelled');
  await new Promise((resolve) => setImmediate(resolve));
  engine.stop();
  await new Promise((resolve) => setTimeout(resolve, 55));
  assert.equal(harness.context.suspendCalls, 0, 'do not suspend while resume is still pending');
  resume.resolve();
  await pending;
  await new Promise((resolve) => setTimeout(resolve, 55));
  assert.equal(harness.context.state, 'suspended');
  assert.equal(harness.sources.length, 0);
});

test('a rejected context resume rejects play while a pending decode stays inert', async (t) => {
  const { engine, harness } = await loadEngine(t);
  const resume = deferred();
  const decode = deferred();
  harness.resumePromise = resume.promise;
  harness.context.state = 'suspended';
  harness.decode = () => decode.promise;
  const pending = engine.play('decode-pending-on-resume-failure', 'pad-resume-failure');
  await new Promise((resolve) => setTimeout(resolve, 0));
  resume.reject(new Error('resume failed'));
  await assert.rejects(pending, /resume failed/);
  assert.equal(harness.sources.length, 0);
  decode.resolve(makeBuffer({ duration: 1, length: 48_000, numberOfChannels: 1, sampleRate: 48_000 }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.sources.length, 0);
  assert.deepEqual(engine.getPlaybackSnapshot(), { voices: [], pendingProtected: [], active: false });
});

test('the shared final shaper uses its stateless curve after a source ends', async (t) => {
  const { engine, harness } = await loadEngine(t);
  await engine.play('first', 'pad-first');
  const first = harness.sources[0];
  first.end();
  await engine.play('second', 'pad-second');
  assert.equal(harness.shapers[0].oversample, 'none');
  assert.equal(harness.sources.length, 2);
  assert.equal(first.disconnected, true);
  assert.equal(engine.getPlaybackSnapshot().voices[0].padId, 'pad-second');
});

test('offline PCM gain preserves quiet linearity at 0, 100, 150 and 200 percent', async () => {
  const input = new Float32Array(2048).fill(0.1);
  const outputs = [];
  for (const control of [0, 1, 1.5, 2]) {
    const result = await processClipPcm([input], playbackGainFromControl(control, true), 48_000);
    outputs.push(result.channels[0]);
    assert.ok(result.peak <= LIMITER_CEILING + 1e-6);
  }
  assert.equal(outputs[0][0], 0);
  assert.ok(Math.abs(outputs[1][0] - 0.1) < 1e-7);
  assert.ok(Math.abs(outputs[2][0] / outputs[1][0] - 10 ** (6 / 20)) < 1e-5);
  assert.ok(Math.abs(outputs[3][0] / outputs[1][0] - 10 ** (12 / 20)) < 1e-5);
  const rms = (samples) => Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
  const rmsDb = (samples) => 20 * Math.log10(rms(samples));
  assert.ok(Math.abs((rmsDb(outputs[2]) - rmsDb(outputs[1])) - 6) < 1e-4);
  assert.ok(Math.abs((rmsDb(outputs[3]) - rmsDb(outputs[1])) - 12) < 1e-4);
  assert.ok(Math.abs(outputs[3][0] / 0.1 - 10 ** (12 / 20)) < 1e-5);
});

test('look-ahead limits impulses and linked stereo without hard clipping', async () => {
  const left = new Float32Array(4096);
  const right = new Float32Array(4096);
  left[1024] = 2;
  right.fill(0.25);
  const result = await processClipPcm([left, right], 1, 48_000);
  assert.ok(result.peak <= LIMITER_CEILING + 1e-6);
  assert.ok(result.channels[0][1024] > 0.6 && result.channels[0][1024] <= LIMITER_CEILING);
  assert.ok(Math.abs(result.channels[1][1024] / 0.25 - result.channels[0][1024] / 2) < 1e-5);
  assert.ok(result.channels[1][3000] > result.channels[1][1024] * 1.5, 'the linked release should recover after the transient');
});

test('4x reconstruction estimate and mix headroom bound a repeating Fs/4 phase sequence', async () => {
  const amplitude = 0.7;
  const phase = Float32Array.from({ length: 256 }, (_, index) => [amplitude, amplitude, -amplitude, -amplitude][index % 4]);
  const protectedClip = await processClipPcm([phase], 1, 48_000);
  assert.ok(protectedClip.peak <= LIMITER_CEILING + 1e-6);
  const headroom = calculateMixHeadroom(Array(8).fill(protectedClip.peak));
  assert.ok(protectedClip.peak * headroom * 8 <= LIMITER_CEILING + 1e-6);
});

test('non-finite input samples are sanitized and every output remains finite', async () => {
  const input = new Float32Array([0.2, Number.NaN, Number.POSITIVE_INFINITY, -0.4, 0.1]);
  const result = await processClipPcm([input], 1, 44_100);
  assert.ok(Math.abs(result.channels[0][0] - 0.2) < 1e-7);
  assert.equal(result.channels[0][1], 0);
  assert.equal(result.channels[0][2], 0);
  assert.ok(Math.abs(result.channels[0][3] + 0.4) < 1e-7);
  assert.ok([...result.channels[0]].every(Number.isFinite));
});

test('decode completing after stop cannot start stale playback', async (t) => {
  const { engine, harness } = await loadEngine(t);
  const decode = deferred();
  harness.decode = () => decode.promise;
  const pending = engine.play('slow', 'pad-slow');
  engine.stop();
  decode.resolve(makeBuffer({ duration: 1, length: 48_000, numberOfChannels: 1, sampleRate: 48_000 }));
  await pending;
  assert.equal(harness.sources.length, 0);
  assert.equal(harness.outputBufferCreations, 0);
  assert.deepEqual(engine.getPlaybackSnapshot(), { voices: [], pendingProtected: [], active: false });
});

test('stopping during asynchronous clip DSP cancels before a derived buffer can start', async (t) => {
  const { engine, harness } = await loadEngine(t);
  harness.decode = () => Promise.resolve(makeBuffer({ duration: 8, length: 400_000, numberOfChannels: 1, sampleRate: 48_000, value: 0.8 }));
  const pending = engine.play('dsp-slow', 'pad-dsp-slow', { gain: 2 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  engine.stop();
  await pending;
  assert.equal(harness.sources.length, 0);
  assert.deepEqual(engine.getPlaybackSnapshot(), { voices: [], pendingProtected: [], active: false });
});

test('Android delegates analysis to native preparation and reuses prepared PCM', async (t) => {
  const { engine, harness } = await loadEngine(t);
  harness.platform = 'android';
  harness.decode = () => Promise.resolve(makeBuffer({ duration: 1, length: 48_000, numberOfChannels: 1, sampleRate: 48_000, value: 0.8 }));
  let prepared = 0;
  harness.nativePrepare = async (channels) => {
    prepared += 1;
    return { processed: true, clipGain: 1, peakBound: 0.7, channels: [new Float32Array(channels[0].length).fill(0.7)] };
  };
  await engine.play('native-hot', 'pad-native-hot', { gain: 2 });
  const firstBuffer = harness.sources[0].buffer;
  assert.equal(harness.nativeCalls, 1);
  assert.equal(prepared, 1);
  assert.ok(Math.abs(firstBuffer.getChannelData(0)[0] - 0.7) < 1e-7);
  await engine.play('native-hot', 'pad-native-hot-again', { gain: 2 });
  assert.equal(harness.nativeCalls, 1, 'prepared PCM should be reused from cache');
  assert.equal(harness.sources.at(-1).buffer, firstBuffer);
});

test('Android missing native preparation gives rebuild guidance without JS fallback', async (t) => {
  const { engine, harness } = await loadEngine(t);
  harness.platform = 'android';
  harness.nativeAvailable = false;
  await assert.rejects(engine.play('missing-native', 'pad-missing-native'), /Rebuild and reinstall/);
  assert.equal(harness.nativeCalls, 0);
  assert.equal(harness.sources.length, 0);
});

test('quiet Android +12 dB boost keeps decoded PCM and converted gain after native inspection', async (t) => {
  const { engine, harness } = await loadEngine(t);
  harness.platform = 'android';
  const decoded = makeBuffer({ duration: 1, length: 48_000, numberOfChannels: 1, sampleRate: 48_000, value: 0.1 });
  harness.decode = () => Promise.resolve(decoded);
  await engine.play('native-quiet', 'pad-native-quiet', { gain: 2 });
  assert.equal(harness.sources[0].buffer, decoded);
  assert.equal(harness.outputBufferCreations, 0);
  assert.ok(Math.abs(harness.gains.at(-1).gain.value - 10 ** (12 / 20)) < 1e-6);
});

test('a superseding Android request cancels pending preparation before a stale source can start', async (t) => {
  const { engine, harness } = await loadEngine(t);
  harness.platform = 'android';
  harness.decode = () => Promise.resolve(makeBuffer({ duration: 1, length: 32, numberOfChannels: 1, sampleRate: 48_000, value: 0.8 }));
  let calls = 0;
  harness.nativePrepare = async (channels, gain, sampleRate, shouldCancel) => {
    calls += 1;
    if (calls === 1) {
      while (!shouldCancel()) await new Promise((resolve) => setTimeout(resolve, 2));
      return null;
    }
    return { processed: false, clipGain: gain, peakBound: 0.1, channels: [] };
  };
  const old = engine.play('old-native', 'pad-old-native', { gain: 2 });
  while (calls === 0) await new Promise((resolve) => setTimeout(resolve, 1));
  const latest = engine.play('latest-native', 'pad-latest-native', { gain: 2 });
  await Promise.all([old, latest]);
  assert.equal(calls, 2);
  assert.equal(harness.sources.length, 1);
  assert.equal(engine.getPlaybackSnapshot().voices[0].padId, 'pad-latest-native');
});

test('latest request wins when cold decodes resolve out of order', async (t) => {
  const { engine, harness } = await loadEngine(t);
  const oldDecode = deferred();
  const newDecode = deferred();
  harness.decode = (uri) => uri === 'old' ? oldDecode.promise : newDecode.promise;
  const oldPlay = engine.play('old', 'old-pad');
  const newPlay = engine.play('new', 'new-pad');
  newDecode.resolve(makeBuffer({ duration: 2, length: 10, numberOfChannels: 1, sampleRate: 5 }));
  await newPlay;
  oldDecode.resolve(makeBuffer({ duration: 2, length: 10, numberOfChannels: 1, sampleRate: 5 }));
  await oldPlay;
  assert.equal(harness.sources.length, 1);
  assert.equal(engine.getPlaybackSnapshot().voices[0].padId, 'new-pad');
});

test('same-pad tap restarts, native clock drives progress, and repeat three starts exactly three passes', async (t) => {
  const { engine, harness } = await loadEngine(t);
  await engine.play('clip', 'same-pad', { soundId: 'saved-clip', repeat: 'three' });
  const first = harness.sources[0];
  harness.time = 6;
  let snapshot = engine.getPlaybackSnapshot();
  assert.equal(snapshot.voices[0].position, 1);
  assert.equal(snapshot.voices[0].progress, 0.5);
  assert.equal(snapshot.voices[0].soundId, 'saved-clip');
  first.end();
  assert.equal(first.stops[0], 11);
  assert.deepEqual(engine.getPlaybackSnapshot(), { voices: [], pendingProtected: [], active: false });

  await engine.play('clip', 'same-pad');
  const previous = harness.sources[1];
  await engine.play('clip', 'same-pad');
  assert.equal(previous.stops.length, 1);
  assert.equal(engine.getPlaybackSnapshot().voices.length, 1);
  assert.equal(engine.getPlaybackSnapshot().voices[0].position, 0);
});

test('cached monophonic restart waits for the old voice fade stop before starting', async (t) => {
  const { engine, harness } = await loadEngine(t);
  harness.deferEndedOnStop = true;
  await engine.play('cached', 'pad-old');
  const oldSource = harness.sources[0];
  await engine.play('cached', 'pad-new');
  const replacement = harness.sources[1];
  assert.equal(oldSource.stops.length, 1);
  assert.equal(replacement.starts[0], oldSource.stops[0]);
  assert.ok(replacement.starts[0] > harness.time);
  assert.equal(engine.getPlaybackSnapshot().voices.find((voice) => voice.padId === 'pad-new').position, 0);
  oldSource.end();
});

test('loop progress wraps on AudioContext time; overlap is bounded and master changes live', async (t) => {
  const { engine, harness } = await loadEngine(t);
  await engine.play('loop', 'loop-pad', { repeat: 'loop' });
  harness.time = 7.5;
  assert.equal(engine.getPlaybackSnapshot().voices[0].position, 0.5);
  engine.setMasterVolume(0.4);
  assert.equal(harness.gains[0].gain.value, 0.4);
  for (let index = 0; index < 9; index += 1) await engine.play(`clip-${index}`, `pad-${index}`, { allowOverlap: true });
  assert.equal(engine.getPlaybackSnapshot().voices.length, 8);
  assert.equal(harness.sources.filter((source) => source.stops.length > 0).length, 2);
  engine.stop();
  assert.equal(engine.getPlaybackSnapshot().active, false);
});

test('overlapping cold decodes both start, and gain headroom bounds an aligned maxed mix', async (t) => {
  const { engine, harness } = await loadEngine(t);
  const firstDecode = deferred();
  const secondDecode = deferred();
  harness.decode = (uri) => uri === 'first' ? firstDecode.promise : secondDecode.promise;
  const first = engine.play('first', 'pad-first', { allowOverlap: true });
  const second = engine.play('second', 'pad-second', { allowOverlap: true });
  firstDecode.resolve(makeBuffer({ duration: 3, length: 30, numberOfChannels: 1, sampleRate: 10 }));
  secondDecode.resolve(makeBuffer({ duration: 3, length: 30, numberOfChannels: 1, sampleRate: 10 }));
  await Promise.all([first, second]);
  assert.deepEqual(engine.getPlaybackSnapshot().voices.map((voice) => voice.padId).sort(), ['pad-first', 'pad-second']);
  const voiceGains = harness.gains.slice(1).map((node) => node.gain.value);
  assert.ok(voiceGains.every((gain) => Math.abs(gain - 0.5) < 1e-6));
  assert.ok(2 * 0.5 <= 1, 'two full scale aligned voices stay within the WaveShaper domain');
});

test('voice-cap replacement also schedules after the fading voice stops', async (t) => {
  const { engine, harness } = await loadEngine(t);
  harness.deferEndedOnStop = true;
  for (let index = 0; index < 8; index += 1) await engine.play('shared', `pad-${index}`, { allowOverlap: true });
  const retired = harness.sources[0];
  await engine.play('shared', 'pad-new', { allowOverlap: true });
  const replacement = harness.sources.at(-1);
  assert.equal(retired.stops.length, 1);
  assert.equal(replacement.starts[0], retired.stops[0]);
  retired.end();
});

test('large decoded buffers have a combined playback memory ceiling', async (t) => {
  const { engine, harness } = await loadEngine(t);
  harness.decode = (uri) => Promise.resolve(makeBuffer({ duration: 10, length: uri === 'large-a' ? 21_000_000 : 14_000_000, numberOfChannels: 1, sampleRate: 48_000, value: 0 }));
  await engine.play('large-a', 'pad-a', { allowOverlap: true });
  await engine.play('large-b', 'pad-b', { allowOverlap: true });
  assert.deepEqual(engine.getPlaybackSnapshot().voices.map((voice) => voice.padId), ['pad-b']);
  assert.equal(harness.sources[0].stops.length, 1);

  harness.decode = () => Promise.resolve(makeBuffer({ duration: 10, length: 33_600_000, numberOfChannels: 1, sampleRate: 48_000, value: 0, lazy: true }));
  await assert.rejects(engine.play('too-large', 'pad-large', { allowOverlap: true }), /too large to play safely/);
});

test('protected pad survives monophonic B then C replacement and overlap changes', async (t) => {
  const { engine, harness } = await loadEngine(t);
  await engine.play('A', 'pad-A', { protected: true, soundId: 'sound-A' });
  await engine.play('B', 'pad-B');
  await engine.play('C', 'pad-C');
  assert.deepEqual(engine.getPlaybackSnapshot().voices.map(({ padId, protected: locked }) => [padId, locked]), [['pad-A', true], ['pad-C', false]]);
  await engine.play('D', 'pad-D', { allowOverlap: true });
  assert.deepEqual(engine.getPlaybackSnapshot().voices.map(({ padId }) => padId), ['pad-A', 'pad-C', 'pad-D']);
  await engine.play('E', 'pad-E', { allowOverlap: false });
  assert.deepEqual(engine.getPlaybackSnapshot().voices.map(({ padId }) => padId), ['pad-A', 'pad-E']);
  assert.equal(harness.sources[0].stops.length, 0, 'protected source was never scheduled to stop');
});

test('multiple protected sounds coexist and pad or sound aliases cannot retrigger them', async (t) => {
  const { engine, harness } = await loadEngine(t);
  await engine.play('A', 'pad-A', { protected: true, soundId: 'sound-A' });
  await engine.play('B', 'pad-B', { protected: true, soundId: 'sound-B' });
  await engine.play('again', 'pad-A', { protected: true, soundId: 'other-id' });
  await engine.play('alias', 'pad-alias', { soundId: 'sound-A' });
  assert.equal(harness.sources.length, 2);
  assert.deepEqual(engine.getPlaybackSnapshot().voices.map(({ protected: locked }) => locked), [true, true]);
});

test('protected pending requests survive ordinary replacement and can be stopped by pad', async (t) => {
  const { engine, harness } = await loadEngine(t);
  const decode = deferred();
  harness.decode = (uri) => uri === 'pending' ? decode.promise : Promise.resolve(makeBuffer({ duration: 1, length: 20, numberOfChannels: 1, sampleRate: 20 }));
  const pending = engine.play('pending', 'pad-protected-pending', { protected: true, soundId: 'reserved' });
  await engine.play('ordinary', 'pad-ordinary');
  decode.resolve(makeBuffer({ duration: 1, length: 20, numberOfChannels: 1, sampleRate: 20 }));
  await pending;
  assert.deepEqual(engine.getPlaybackSnapshot().voices.map(({ padId }) => padId), ['pad-ordinary', 'pad-protected-pending']);
  engine.stopPad('pad-protected-pending');
  assert.equal(engine.getPlaybackSnapshot().voices.some(({ padId }) => padId === 'pad-protected-pending'), false);
  await engine.play('alias', 'pad-alias', { soundId: 'reserved' });
  assert.equal(engine.getPlaybackSnapshot().voices.some(({ padId }) => padId === 'pad-alias'), true, 'reservation unlocks when stopped');
});

test('protected once and three repeats unlock on natural completion; stop all clears loop locks', async (t) => {
  const { engine, harness } = await loadEngine(t);
  await engine.play('once', 'pad-once', { protected: true, repeat: 'once' });
  harness.sources[0].end();
  assert.deepEqual(engine.getPlaybackSnapshot(), { voices: [], pendingProtected: [], active: false });
  await engine.play('three', 'pad-three', { protected: true, repeat: 'three' });
  const three = harness.sources[1];
  assert.equal(three.stops[0], harness.time + three.buffer.duration * 3);
  three.end();
  assert.deepEqual(engine.getPlaybackSnapshot(), { voices: [], pendingProtected: [], active: false });
  await engine.play('loop', 'pad-loop', { protected: true, repeat: 'loop' });
  engine.stop();
  assert.deepEqual(engine.getPlaybackSnapshot(), { voices: [], pendingProtected: [], active: false });
  await engine.play('unlocked', 'pad-loop');
  assert.equal(engine.getPlaybackSnapshot().voices[0].protected, false);
});

test('stopPad cancels a pending protected decode and stop all cancels all protected requests', async (t) => {
  const { engine, harness } = await loadEngine(t);
  const decodeA = deferred();
  const decodeB = deferred();
  harness.decode = (uri) => uri === 'A' ? decodeA.promise : decodeB.promise;
  const pendingA = engine.play('A', 'pad-A', { protected: true, soundId: 'A' });
  const pendingB = engine.play('B', 'pad-B', { protected: true, soundId: 'B' });
  assert.deepEqual(engine.getPlaybackSnapshot().pendingProtected, [{ padId: 'pad-A', soundId: 'A' }, { padId: 'pad-B', soundId: 'B' }]);
  engine.stopPad('pad-A');
  assert.deepEqual(engine.getPlaybackSnapshot().pendingProtected, [{ padId: 'pad-B', soundId: 'B' }]);
  decodeA.resolve(makeBuffer({ duration: 1, length: 20, numberOfChannels: 1, sampleRate: 20 }));
  decodeB.resolve(makeBuffer({ duration: 1, length: 20, numberOfChannels: 1, sampleRate: 20 }));
  await Promise.all([pendingA, pendingB]);
  assert.deepEqual(engine.getPlaybackSnapshot().voices.map(({ padId }) => padId), ['pad-B']);
  const pendingC = deferred();
  harness.decode = () => pendingC.promise;
  const requestC = engine.play('C', 'pad-C', { protected: true });
  assert.equal(engine.getPlaybackSnapshot().active, true);
  engine.stop();
  assert.equal(engine.getPlaybackSnapshot().active, false);
  pendingC.resolve(makeBuffer({ duration: 1, length: 20, numberOfChannels: 1, sampleRate: 20 }));
  await requestC;
  assert.deepEqual(engine.getPlaybackSnapshot(), { voices: [], pendingProtected: [], active: false });
});

test('voice cap refuses playback rather than stealing protected voices', async (t) => {
  const { engine, harness } = await loadEngine(t);
  for (let index = 0; index < 8; index += 1) await engine.play(`protected-${index}`, `pad-${index}`, { protected: true });
  await assert.rejects(engine.play('ninth', 'pad-ninth'), /protected voice limit/);
  assert.equal(engine.getPlaybackSnapshot().voices.length, 8);
  assert.ok(harness.sources.slice(0, 8).every((source) => source.stops.length === 0));
});

test('system audio interruption stops and unlocks protected playback', async (t) => {
  const { engine, harness } = await loadEngine(t);
  await engine.play('protected', 'pad-protected', { protected: true, soundId: 'sound-protected', repeat: 'loop' });
  const manager = harness.audioManager;
  assert.deepEqual(manager.observeCalls, ['gainTransientMayDuck']);
  assert.deepEqual(manager.listeners.map(({ name }) => name), ['interruption', 'duck']);
  manager.listeners.find(({ name }) => name === 'interruption').callback({ type: 'began', shouldResume: false });
  assert.deepEqual(engine.getPlaybackSnapshot(), { voices: [], pendingProtected: [], active: false });
  assert.deepEqual(manager.observeCalls, ['gainTransientMayDuck', false]);
  await engine.play('retrigger', 'pad-protected', { soundId: 'sound-protected' });
  assert.deepEqual(manager.observeCalls, ['gainTransientMayDuck', false, 'gainTransientMayDuck']);
  assert.equal(harness.sources.length, 2, 'audio focus loss clears the pad and sound reservations');
});

test('audio focus is abandoned after a one-shot ends and requested again for the next tap', async (t) => {
  const { engine, harness } = await loadEngine(t);
  await engine.play('one-shot', 'pad-one-shot');
  assert.deepEqual(harness.audioManager.observeCalls, ['gainTransientMayDuck']);
  harness.sources[0].end();
  assert.deepEqual(harness.audioManager.observeCalls, ['gainTransientMayDuck', false]);
  await engine.play('next-tap', 'pad-next-tap');
  assert.deepEqual(harness.audioManager.observeCalls, ['gainTransientMayDuck', false, 'gainTransientMayDuck']);
  engine.stop();
  assert.deepEqual(harness.audioManager.observeCalls, ['gainTransientMayDuck', false, 'gainTransientMayDuck', false]);
});

test('idle playback context suspends after the last fade and resumes before the next source', async (t) => {
  const { engine, harness } = await loadEngine(t);
  await engine.play('first', 'pad-first');
  harness.sources[0].end();
  await new Promise((resolve) => setTimeout(resolve, 55));
  assert.equal(harness.context.state, 'suspended');
  assert.equal(harness.context.suspendCalls, 1);
  await engine.play('second', 'pad-second');
  assert.equal(harness.context.resumeCalls, 1);
  assert.equal(harness.context.state, 'running');
});

test('audio focus duck stops current sounds without automatic resume', async (t) => {
  const { engine, harness } = await loadEngine(t);
  await engine.play('ducked', 'pad-ducked', { repeat: 'loop' });
  harness.audioManager.listeners.find(({ name }) => name === 'duck').callback({});
  assert.deepEqual(engine.getPlaybackSnapshot(), { voices: [], pendingProtected: [], active: false });
  assert.deepEqual(harness.audioManager.observeCalls, ['gainTransientMayDuck', false]);
});

test('Stop remains safe if Android audio-focus release throws', async (t) => {
  const { engine, harness } = await loadEngine(t);
  await engine.play('focus-release', 'pad-focus-release');
  const original = harness.audioManager.observeAudioInterruptions;
  harness.audioManager.observeAudioInterruptions = function observe(value) {
    this.observeCalls.push(value);
    if (value === false) throw new Error('native focus release failed');
  };
  assert.doesNotThrow(() => engine.stop());
  harness.audioManager.observeAudioInterruptions = original;
});

test('distinct cold decodes are bounded and queued taps do not decode after Stop all', async (t) => {
  const { engine, harness } = await loadEngine(t);
  const gateA = deferred();
  const gateB = deferred();
  const decodeCalls = [];
  harness.decode = async (uri) => {
    decodeCalls.push(uri);
    harness.activeDecodes += 1;
    harness.maxConcurrentDecodes = Math.max(harness.maxConcurrentDecodes, harness.activeDecodes);
    await (uri === 'cold-a' ? gateA.promise : gateB.promise);
    harness.activeDecodes -= 1;
    return { ...makeBuffer({ duration: 2, length: 96_000, numberOfChannels: 2, sampleRate: 48_000 }), uri };
  };
  const first = engine.play('cold-a', 'pad-cold-a', { allowOverlap: true });
  const second = engine.play('cold-b', 'pad-cold-b', { allowOverlap: true });
  const third = engine.play('cold-c', 'pad-cold-c', { allowOverlap: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.activeDecodes, 2);
  engine.stop();
  gateA.resolve(); gateB.resolve();
  await Promise.all([first, second, third]);
  assert.equal(harness.maxConcurrentDecodes, 2);
  assert.deepEqual(decodeCalls, ['cold-a', 'cold-b']);
  assert.equal(engine.getPlaybackSnapshot().active, false);
});

test('synchronous resume failure releases a protected reservation for retry', async (t) => {
  const { engine, harness } = await loadEngine(t);
  harness.context.state = 'suspended';
  harness.context.resume = () => { throw new Error('resume threw synchronously'); };
  await assert.rejects(engine.play('retry', 'pad-retry', { protected: true, soundId: 'retry-id' }), /resume threw synchronously/);
  harness.context.resume = async function resume() { this.state = 'running'; };
  await engine.play('retry', 'pad-retry', { protected: true, soundId: 'retry-id' });
  assert.equal(engine.getPlaybackSnapshot().voices[0].protected, true);
});

test('protectPad promotes the active voice without restarting its playback', async (t) => {
  const { engine, harness } = await loadEngine(t);
  await engine.play('already-playing', 'pad-promote', { soundId: 'sound-promote' });
  const source = harness.sources[0];
  harness.time = 6;
  assert.equal(engine.getPlaybackSnapshot().voices[0].position, 1);
  assert.equal(engine.protectPad('pad-promote'), true);
  assert.equal(harness.sources.length, 1);
  assert.equal(engine.getPlaybackSnapshot().voices[0].position, 1);
  assert.equal(engine.getPlaybackSnapshot().voices[0].protected, true);
  await engine.play('alias', 'another-pad', { soundId: 'sound-promote' });
  assert.equal(harness.sources.length, 1, 'sound identity alias is reserved by promoted voice');
  engine.stopPad('pad-promote');
  assert.equal(engine.getPlaybackSnapshot().active, false);
  assert.equal(source.stops.length, 1);
});

test('protectPad promotes a pending decode and protects it from monophonic replacement', async (t) => {
  const { engine, harness } = await loadEngine(t);
  const decode = deferred();
  harness.decode = (uri) => uri === 'pending-promote' ? decode.promise : Promise.resolve(makeBuffer({ duration: 1, length: 20, numberOfChannels: 1, sampleRate: 20 }));
  const pending = engine.play('pending-promote', 'pad-pending-promote', { soundId: 'sound-pending-promote' });
  assert.equal(engine.protectPad('pad-pending-promote'), true);
  assert.deepEqual(engine.getPlaybackSnapshot().pendingProtected, [{ padId: 'pad-pending-promote', soundId: 'sound-pending-promote' }]);
  assert.equal(engine.getPlaybackSnapshot().active, true, 'pending protected playback keeps global Stop all available');
  await engine.play('normal-after-promotion', 'pad-normal');
  decode.resolve(makeBuffer({ duration: 1, length: 20, numberOfChannels: 1, sampleRate: 20 }));
  await pending;
  assert.deepEqual(engine.getPlaybackSnapshot().pendingProtected, []);
  assert.deepEqual(engine.getPlaybackSnapshot().voices.map(({ padId, protected: locked }) => [padId, locked]), [['pad-normal', false], ['pad-pending-promote', true]]);
  const promotedSource = harness.sources[1];
  await engine.play('B', 'pad-B');
  await engine.play('C', 'pad-C');
  assert.deepEqual(engine.getPlaybackSnapshot().voices.map(({ padId, protected: locked }) => [padId, locked]), [['pad-pending-promote', true], ['pad-C', false]]);
  assert.equal(promotedSource.stops.length, 0, 'monophonic taps cannot stop the promoted source');
  promotedSource.end();
  await engine.play('sound-alias-after-natural-end', 'pad-alias-after-end', { soundId: 'sound-pending-promote' });
  assert.equal(engine.getPlaybackSnapshot().voices.some(({ padId }) => padId === 'pad-alias-after-end'), true, 'natural completion releases the migrated alias reservation');
  await engine.play('protected-again', 'pad-pending-promote', { protected: true, soundId: 'sound-pending-promote' });
  engine.stop();
  await engine.play('alias-after-stop-all', 'pad-after-stop-all', { soundId: 'sound-pending-promote' });
  assert.equal(engine.getPlaybackSnapshot().voices.some(({ padId }) => padId === 'pad-after-stop-all'), true, 'Stop all clears the migrated reservation');
  assert.equal(engine.protectPad('missing-pad'), false);
});
