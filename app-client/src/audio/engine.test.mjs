import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const enginePath = fileURLToPath(new URL('./engine.ts', import.meta.url));
const stateUrl = new URL('./playbackState.ts', import.meta.url).href;

async function makeEngine(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'soundboard-engine-'));
  const fakePath = path.join(directory, 'fakeAudioContext.mjs');
  const sourcePath = path.join(directory, 'engine.ts');
  const engineSource = readFileSync(enginePath, 'utf8')
    .replace(
      "import AudioContext from 'react-native-audio-api/lib/module/core/AudioContext';",
      "import AudioContext from './fakeAudioContext.mjs';",
    )
    .replace(
      "import { PlaybackStateStore, type PlaybackSnapshot } from './playbackState';",
      `import { PlaybackStateStore } from '${stateUrl}';`,
    );

  writeFileSync(fakePath, `
    export default class FakeAudioContext {
      constructor() { return globalThis.__soundboardAudioHarness.context; }
    }
  `);
  writeFileSync(sourcePath, engineSource);

  const harness = createHarness();
  globalThis.__soundboardAudioHarness = harness;
  const engine = await import(`${pathToFileURL(sourcePath).href}?instance=${Math.random()}`);
  t.after(() => {
    delete globalThis.__soundboardAudioHarness;
    rmSync(directory, { recursive: true, force: true });
  });
  return { engine, harness };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function createHarness() {
  const harness = {
    sources: [],
    gains: [],
    startThrows: false,
    decode: (uri) => Promise.resolve({ duration: uri.length }),
  };

  harness.context = {
    currentTime: 10,
    destination: {},
    decodeAudioData: (uri) => harness.decode(uri),
    createGain: () => {
      const gain = {
        gain: {
          value: 1,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
        },
        connect() {},
        disconnected: false,
        disconnect() { this.disconnected = true; },
      };
      harness.gains.push(gain);
      return gain;
    },
    createBufferSource: () => {
      const source = {
        buffer: null,
        onEnded: null,
        stopTimes: [],
        disconnected: false,
        connect() {},
        start() {
          if (harness.startThrows) throw new Error('start failed');
        },
        stop(time) { this.stopTimes.push(time); },
        disconnect() { this.disconnected = true; },
        end() { this.onEnded?.({}); },
      };
      harness.sources.push(source);
      return source;
    },
  };
  return harness;
}

test('stop during decode invalidates pending playback and does not create a source', async (t) => {
  const { engine, harness } = await makeEngine(t);
  const pendingDecode = deferred();
  harness.decode = () => pendingDecode.promise;

  const pendingPlay = engine.play('slow-clip', 'slow-pad');
  engine.stop();
  pendingDecode.resolve({ duration: 3 });

  assert.deepEqual(await pendingPlay, { cacheHit: false, started: false });
  assert.equal(harness.sources.length, 0);
  assert.deepEqual(engine.getPlaybackSnapshot(), { status: 'idle' });
});

test('latest decode wins when requests resolve out of order', async (t) => {
  const { engine, harness } = await makeEngine(t);
  const olderDecode = deferred();
  const latestDecode = deferred();
  harness.decode = (uri) => uri === 'older' ? olderDecode.promise : latestDecode.promise;

  const older = engine.play('older', 'pad-old');
  const latest = engine.play('latest', 'pad-latest');
  latestDecode.resolve({ duration: 4 });
  assert.equal((await latest).started, true);
  olderDecode.resolve({ duration: 7 });

  assert.equal((await older).started, false);
  assert.equal(harness.sources.length, 1);
  const snapshot = engine.getPlaybackSnapshot();
  assert.equal(snapshot.status === 'playing' ? snapshot.padId : null, 'pad-latest');
});

test('old ended callback cannot clear the latest voice; natural end disconnects and clears', async (t) => {
  const { engine, harness } = await makeEngine(t);

  await engine.play('first', 'pad-first');
  const oldSource = harness.sources[0];
  const oldGain = harness.gains[0];
  await engine.play('second', 'pad-second');
  const latestSource = harness.sources[1];
  const latestGain = harness.gains[1];

  assert.equal(oldSource.stopTimes.length, 1);
  oldSource.end();
  let snapshot = engine.getPlaybackSnapshot();
  assert.equal(snapshot.status === 'playing' ? snapshot.padId : null, 'pad-second');
  assert.equal(oldSource.disconnected, true);
  assert.equal(oldGain.disconnected, true);

  latestSource.end();
  snapshot = engine.getPlaybackSnapshot();
  assert.deepEqual(snapshot, { status: 'idle' });
  assert.equal(latestSource.disconnected, true);
  assert.equal(latestGain.disconnected, true);
});

test('a source start failure disconnects the partial voice and leaves playback idle', async (t) => {
  const { engine, harness } = await makeEngine(t);
  harness.startThrows = true;

  await assert.rejects(engine.play('broken', 'pad-broken'), /start failed/);
  assert.equal(harness.sources[0].disconnected, true);
  assert.equal(harness.gains[0].disconnected, true);
  assert.deepEqual(engine.getPlaybackSnapshot(), { status: 'idle' });
});
