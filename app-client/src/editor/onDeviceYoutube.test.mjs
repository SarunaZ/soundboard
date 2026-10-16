import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const watch = 'https://www.youtube.com/watch?v=OjNpRbNdR7E&list=PLabc&si=secret';
const shorts = 'https://www.youtube.com/shorts/jlPQtJXy9t8?feature=share';

async function harness(t, { enabled = true, platform = 'android', extract, extractorVersion, privateRelease } = {}) {
  const directory = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? '.', 'soundboard-on-device-youtube-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const state = { calls: [], opens: [], disposed: [], extract };
  const mocks = {
    'expo.mjs': `export function requireOptionalNativeModule(name) { globalThis.__youtube.calls.push(['require', name]); return globalThis.__youtube.native; }\n`,
    'react-native.mjs': `export const Platform = { OS: globalThis.__youtube.platform };\n`,
    'catalog.mjs': `let i = 0; export function generatedClipId() { return '00000000-0000-4000-8000-' + String(++i).padStart(12, '0'); }\n`,
    'fs.mjs': `export class File { constructor(uri) { this.uri = uri; } }\n`,
    'local-audio.mjs': `export async function openLocalAudioFile(file, signal, title) { globalThis.__youtube.calls.push(['open', file.uri, title]); if (signal?.aborted) { const error = new Error('cancelled'); error.name = 'AbortError'; throw error; } if (globalThis.__youtube.openError) throw globalThis.__youtube.openError; if (globalThis.__youtube.openPending) { globalThis.__youtube.markOpenStarted(); return new Promise((resolve) => { globalThis.__youtube.resolveOpen = () => { const source = { id: 'local', uri: file.uri, title: title.slice(0, 100), durationMs: 10000, peaks: [] }; globalThis.__youtube.opens.push(source); resolve(source); }; }); } const source = { id: 'local', uri: file.uri, title: title.slice(0, 100), durationMs: 10000, peaks: [] }; globalThis.__youtube.opens.push(source); return source; }\nexport async function disposeLocalAudioSource(source) { globalThis.__youtube.disposed.push(source); }\n`,
  };
  const paths = {};
  for (const [name, source] of Object.entries(mocks)) {
    paths[name] = join(directory, name);
    await writeFile(paths[name], source);
  }
  const source = (await readFile(join(appRoot, 'src/editor/onDeviceYoutube.ts'), 'utf8'))
    .replace("from 'expo';", `from '${pathToFileURL(paths['expo.mjs']).href}';`)
    .replace("from 'react-native';", `from '${pathToFileURL(paths['react-native.mjs']).href}';`)
    .replace("from './catalog';", `from '${pathToFileURL(paths['catalog.mjs']).href}';`)
    .replace("from 'expo-file-system';", `from '${pathToFileURL(paths['fs.mjs']).href}';`)
    .replace("from './localAudio';", `from '${pathToFileURL(paths['local-audio.mjs']).href}';`)
    .replace("from './protocol';", `from '${pathToFileURL(join(appRoot, 'src/editor/protocol.ts')).href}';`);
  const modulePath = join(directory, 'onDeviceYoutube.ts');
  await writeFile(modulePath, source);
  globalThis.__youtube = {
    calls: state.calls,
    opens: state.opens,
    disposed: state.disposed,
    platform,
    openError: null,
    openPending: false,
    markOpenStarted: null,
    resolveOpen: null,
    native: {
      enabled,
      ...(privateRelease === undefined ? {} : { privateRelease }),
      bundledExtractorVersion: extractorVersion,
      async extract(...args) {
        state.calls.push(['extract', ...args]);
        if (state.extract) return state.extract(...args);
        return { uri: 'file:///cache/native.m4a', title: 'A native title', durationMs: 12000 };
      },
      async cancel(id) { state.calls.push(['cancel', id]); },
      async release(id) { state.calls.push(['release', id]); },
    },
  };
  t.after(() => { delete globalThis.__youtube; });
  return { state, async load() { return import(pathToFileURL(modulePath).href); } };
}

test('validates and canonicalizes Watch and Shorts links before native extraction', async (t) => {
  const { state, load } = await harness(t);
  const api = await load();
  assert.equal(api.isOnDeviceYoutubeAvailable(), true);
  await api.openYoutubeOnDevice(watch);
  await api.openYoutubeOnDevice(shorts);
  const requests = state.calls.filter(([kind]) => kind === 'extract');
  assert.equal(requests[0][2], 'https://www.youtube.com/watch?v=OjNpRbNdR7E');
  assert.equal(requests[1][2], 'https://www.youtube.com/watch?v=jlPQtJXy9t8');
  assert.equal(state.opens.length, 2);
  assert.equal(state.calls.filter(([kind]) => kind === 'release').length, 2);
});

test('opens a native M4A result through the existing local audio editor path', async (t) => {
  const { state, load } = await harness(t, {
    extract: async () => ({ uri: 'file:///cache/native.m4a', title: 'AAC source', durationMs: 12000 }),
  });
  const source = await (await load()).openYoutubeOnDevice(watch);
  assert.equal(source.uri, 'file:///cache/native.m4a');
  assert.equal(source.title, 'AAC source');
  assert.deepEqual(state.calls.find(([kind]) => kind === 'open'), ['open', 'file:///cache/native.m4a', 'AAC source']);
  assert.equal(state.calls.filter(([kind]) => kind === 'release').length, 1);
});

test('rejects non-YouTube or malformed links without calling native or falling back to a server', async (t) => {
  const { state, load } = await harness(t);
  const api = await load();
  await assert.rejects(api.openYoutubeOnDevice('https://example.com/watch?v=OjNpRbNdR7E'), /YouTube links only/);
  await assert.rejects(api.openYoutubeOnDevice('https://youtube.com/playlist?list=PLabc'), /single YouTube video/);
  await assert.rejects(api.openYoutubeOnDevice('https://youtube.com/watch?v=short'), /single YouTube video/);
  assert.equal(state.calls.some(([kind]) => kind === 'extract'), false);
  assert.equal(state.calls.some(([kind]) => /fetch|session|api/i.test(kind)), false);
});

test('requires enabled Android native implementation', async (t) => {
  const disabled = await harness(t, { enabled: false });
  const disabledApi = await disabled.load();
  assert.equal(disabledApi.isOnDeviceYoutubeAvailable(), false);
  await assert.rejects(disabledApi.openYoutubeOnDevice(watch), /unavailable in this build/);
  const ios = await harness(t, { platform: 'ios' });
  assert.equal((await ios.load()).isOnDeviceYoutubeAvailable(), false);
});

test('detects only an explicitly private native release profile', async (t) => {
  const missing = await harness(t);
  assert.equal((await missing.load()).isPrivateYoutubeRelease(), false);
  const ordinary = await harness(t, { privateRelease: false });
  assert.equal((await ordinary.load()).isPrivateYoutubeRelease(), false);
  const privateRelease = await harness(t, { privateRelease: true });
  assert.equal((await privateRelease.load()).isPrivateYoutubeRelease(), true);
});

test('native extraction failures are sanitized, released, and never use the server path', async (t) => {
  const { state, load } = await harness(t, { extract: async () => { throw new Error('secret session token response'); } });
  const api = await load();
  await assert.rejects(api.openYoutubeOnDevice(watch), (error) => {
    assert.match(error.message, /could not complete/);
    assert.match(error.message, /Diagnostic: SBYT_UNKNOWN/);
    assert.equal(error.message.includes('secret'), false);
    return true;
  });
  assert.equal(state.calls.some(([kind]) => kind === 'release'), true);
  assert.equal(state.calls.some(([kind]) => /fetch|session|api/i.test(kind)), false);
});

test('only exact documented native errors are shown to the user', async (t) => {
  const { load: loadSafe } = await harness(t, { extract: async () => { throw new Error('The extracted audio is larger than 32 MiB.'); } });
  await assert.rejects((await loadSafe()).openYoutubeOnDevice(watch), /exceeds the 32 MiB limit/);
  const { load: loadWrapped } = await harness(t, { extract: async () => { throw new Error('NativeError: The extracted audio is larger than 32 MiB.'); } });
  await assert.rejects((await loadWrapped()).openYoutubeOnDevice(watch), (error) => {
    assert.match(error.message, /Diagnostic: SBYT_UNKNOWN/);
    assert.doesNotMatch(error.message, /NativeError|32 MiB/);
    return true;
  });
});

test('wrapped Expo coded exceptions preserve safe stage and reason diagnostics', async (t) => {
  const { load } = await harness(t, {
    extract: async () => {
      const error = new Error('CodedException: socket failed at https://private.example/token');
      error.code = 'ERR_SBYT_METADATA_NETWORK';
      throw error;
    },
  });
  await assert.rejects((await load()).openYoutubeOnDevice(watch), (error) => {
    assert.match(error.message, /^Could not read video information: network\/TLS failure\./);
    assert.match(error.message, /Diagnostic: SBYT_METADATA_NETWORK\./);
    assert.match(error.message, /Bundled extractor: 2025\.11\.12\./);
    assert.doesNotMatch(error.message, /socket failed|private\.example|token/);
    return true;
  });
});

test('accepts only a plain object code from the finite stage/reason vocabulary', async (t) => {
  const { load } = await harness(t, {
    extract: async () => { throw { code: 'ERR_SBYT_OUTPUT_FORMAT', message: 'raw stderr and secret' }; },
  });
  await assert.rejects((await load()).openYoutubeOnDevice(watch), (error) => {
    assert.match(error.message, /^Could not prepare audio: unsupported audio format\./);
    assert.match(error.message, /Diagnostic: SBYT_OUTPUT_FORMAT\./);
    assert.doesNotMatch(error.message, /raw stderr|secret/);
    return true;
  });
});

test('a valid UNKNOWN reason retains its native stage in the diagnostic', async (t) => {
  const { load } = await harness(t, {
    extract: async () => { throw { code: 'ERR_SBYT_METADATA_UNKNOWN', message: 'raw native detail' }; },
  });
  await assert.rejects((await load()).openYoutubeOnDevice(watch), (error) => {
    assert.match(error.message, /^Could not read video information: unknown extraction problem\./);
    assert.match(error.message, /Diagnostic: SBYT_METADATA_UNKNOWN\./);
    assert.doesNotMatch(error.message, /raw native detail/);
    return true;
  });
});

test('untrusted messages, malformed codes, and code-like message text always fall back safely', async (t) => {
  for (const cause of [
    { code: 'ERR_SBYT_METADATA_NETWORK_EXTRA', message: 'ERR_SBYT_DOWNLOAD_ACCESS' },
    { code: 'ERR_SBYT_METADATA_NETWORK\n', message: 'private raw output' },
    { code: 'XERR_SBYT_METADATA_NETWORK', message: 'private raw output' },
    { message: 'ERR_SBYT_METADATA_NETWORK' },
    { code: 'ERR_SBYT_METADATA_NETWORK<script>', message: 'raw token value' },
  ]) {
    const { load } = await harness(t, { extract: async () => { throw cause; } });
    await assert.rejects((await load()).openYoutubeOnDevice(watch), (error) => {
      assert.match(error.message, /On-device YouTube loading could not complete/);
      assert.match(error.message, /Diagnostic: SBYT_UNKNOWN/);
      assert.doesNotMatch(error.message, /private raw output|raw token value|ERR_SBYT_METADATA_NETWORK/);
      return true;
    });
  }
});

test('diagnostic text uses the bundled version constant and safe limit/access wording', async (t) => {
  const cases = [
    ['ERR_SBYT_METADATA_TOO_LONG', '5-minute limit'],
    ['ERR_SBYT_OUTPUT_TOO_LARGE', '32 MiB limit'],
    ['ERR_SBYT_DOWNLOAD_TIMEOUT', 'timed out'],
    ['ERR_SBYT_METADATA_LIVE_SOURCE', 'live or upcoming'],
    ['ERR_SBYT_DOWNLOAD_ACCESS', 'does not bypass YouTube sign-in, bot, or access restrictions'],
  ];
  for (const [code, expected] of cases) {
    const { load } = await harness(t, { extract: async () => { throw { code, message: 'ignore arbitrary native message' }; } });
    await assert.rejects((await load()).openYoutubeOnDevice(watch), (error) => {
      assert.match(error.message, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.match(error.message, /Bundled extractor: 2025\.11\.12\./);
      assert.doesNotMatch(error.message, /ignore arbitrary native message/);
      return true;
    });
  }
  const { load } = await harness(t, {
    extractorVersion: '2025.11.12\nattacker-controlled-native-value',
    extract: async () => { throw { code: 'ERR_SBYT_DOWNLOAD_NETWORK', message: 'private raw output' }; },
  });
  await assert.rejects((await load()).openYoutubeOnDevice(watch), (error) => {
    assert.match(error.message, /Bundled extractor: 2025\.11\.12\./);
    assert.doesNotMatch(error.message, /attacker-controlled-native-value|private raw output/);
    return true;
  });
});

test('new safe diagnostic reasons survive native wrapping and display only fixed category labels', async (t) => {
  const cases = [
    ['HTTP_UNAUTHORIZED', 'HTTP 401 unauthorized response'],
    ['HTTP_FORBIDDEN', 'HTTP 403 forbidden response'],
    ['HTTP_NOT_FOUND', 'HTTP 404 not found response'],
    ['HTTP_RATE_LIMIT', 'HTTP 429 rate limit response'],
    ['HTTP_SERVER', 'HTTP 5xx server response'],
    ['HTTP_OTHER', 'HTTP 4xx client response'],
    ['SIGNATURE', 'signature decryption failure'],
    ['JS_CHALLENGE', 'JavaScript challenge failure'],
    ['PO_TOKEN', 'required PO token missing'],
    ['TOOL_MISSING', 'required media tool missing'],
    ['IO', 'device storage write failure'],
    ['PYTHON', 'extractor Python exception'],
  ];
  for (const [reason, label] of cases) {
    const privateDetail = `https://private.invalid/audio?token=secret-${reason}`;
    const { load } = await harness(t, {
      extract: async () => { throw { code: `ERR_SBYT_DOWNLOAD_${reason}`, message: privateDetail }; },
    });
    await assert.rejects((await load()).openYoutubeOnDevice(watch), (error) => {
      assert.ok(error.message.includes(label));
      assert.match(error.message, new RegExp(`Diagnostic: SBYT_DOWNLOAD_${reason}\\.`));
      assert.ok(!error.message.includes(privateDetail));
      assert.doesNotMatch(error.message, /token=secret/);
      return true;
    });
  }
});

test('rejects malformed native metadata and releases each native request', async (t) => {
  for (const result of [
    { uri: 'content://private/native.m4a', title: 'Title', durationMs: 1000 },
    { uri: 'file:///cache/native.wav', title: 'Title', durationMs: 1000 },
    { uri: 'file:///cache/native.m4a', title: 'Title', durationMs: Number.NaN },
    { uri: 'file:///cache/native.m4a', title: 'Title', durationMs: 300_001 },
  ]) {
    const { state, load } = await harness(t, { extract: async () => result });
    await assert.rejects((await load()).openYoutubeOnDevice(watch), /invalid audio metadata/);
    assert.equal(state.calls.filter(([kind]) => kind === 'release').length, 1);
    assert.equal(state.calls.some(([kind]) => kind === 'open'), false);
  }
});

test('local open errors release the native temp while retaining useful local validation', async (t) => {
  const { state, load } = await harness(t);
  globalThis.__youtube.openError = new Error('Audio sources must be 32 MB or smaller.');
  await assert.rejects((await load()).openYoutubeOnDevice(watch), /32 MB/);
  assert.equal(state.calls.filter(([kind]) => kind === 'release').length, 1);
});

test('an already-aborted request never reaches the native module', async (t) => {
  const { state, load } = await harness(t);
  const api = await load();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api.openYoutubeOnDevice(watch, controller.signal), { name: 'AbortError' });
  assert.equal(state.calls.some(([kind]) => ['extract', 'cancel', 'release'].includes(kind)), false);
});

test('aborting extraction calls cancel and waits for extraction to settle before release', async (t) => {
  let settleExtract;
  const { state, load } = await harness(t, { extract: () => new Promise((resolve) => { settleExtract = resolve; }) });
  const api = await load();
  const controller = new AbortController();
  const pending = api.openYoutubeOnDevice(watch, controller.signal);
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(state.calls.some(([kind]) => kind === 'cancel'), true);
  assert.equal(state.calls.some(([kind]) => kind === 'release'), false);
  settleExtract({ uri: 'file:///cache/native.m4a', title: 'Title', durationMs: 1000 });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.ok(state.calls.findIndex(([kind]) => kind === 'cancel') < state.calls.findIndex(([kind]) => kind === 'release'));
  assert.equal(state.calls.some(([kind]) => kind === 'open'), false);
});

test('cancellation during local staging disposes a late source and releases native temp safely', async (t) => {
  const { state, load } = await harness(t);
  let markOpenStarted;
  state.waitForOpen = new Promise((resolve) => { markOpenStarted = resolve; });
  globalThis.__youtube.openPending = true;
  globalThis.__youtube.markOpenStarted = markOpenStarted;
  const api = await load();
  const controller = new AbortController();
  const pending = api.openYoutubeOnDevice(watch, controller.signal);
  await state.waitForOpen;
  controller.abort();
  globalThis.__youtube.resolveOpen();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(state.disposed.length, 1);
  assert.equal(state.calls.filter(([kind]) => kind === 'release').length, 1);
});
