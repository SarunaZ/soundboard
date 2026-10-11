import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseArgs, preflight, validateImageReference, validateManifestPins } from './preflight.mjs';

const soundboard = 'a'.repeat(40);
const lockBytes = readFileSync(new URL('../release/lock.json', import.meta.url));
const lock = JSON.parse(lockBytes.toString('utf8'));
const imli = lock.sources.imli.commit;
const manifest = {
  schemaVersion: 1,
  build: structuredClone(lock.build),
  sources: {
    soundboard: { revision: soundboard, dirty: false, publishable: true },
    imli: { revision: imli, url: lock.sources.imli.url },
  },
};
const pinnedManifest = structuredClone(manifest);
pinnedManifest.build.releaseLockSha256 = createHash('sha256').update(lockBytes).digest('hex');
const manifestBytes = `${JSON.stringify(pinnedManifest, null, 2)}\n`;
const manifestHash = createHash('sha256').update(manifestBytes).digest('hex');
const imageInfo = {
  Id: `sha256:${'c'.repeat(64)}`,
  Os: 'linux', Architecture: 'amd64',
  Config: {
    User: 'node',
    Entrypoint: ['/usr/bin/tini', '--', 'node', '/opt/shared-imli/supervisor.mjs'],
    Healthcheck: { Test: ['CMD', 'node', '-e', "fetch('http://127.0.0.1:4000/__shared/ready')"] },
    Labels: {
      'org.soundboard.source.revision': soundboard,
      'org.soundboard.source.imli.revision': imli,
      'org.soundboard.release.manifest.sha256': manifestHash,
      'org.soundboard.release.publishable': 'true',
    },
  },
};

function mockDocker({ info = imageInfo, manifestText = manifestBytes, inspectFails = false, runFails = false } = {}) {
  const calls = [];
  const docker = args => {
    calls.push(args);
    if (args[0] === 'image') return inspectFails ? { ok: false } : { ok: true, stdout: JSON.stringify(info) };
    return runFails ? { ok: false } : { ok: true, stdout: manifestText };
  };
  return { docker, calls };
}

test('accepts a local image reference and an immutable sha256 ID', () => {
  assert.equal(validateImageReference('soundboard-imli:release-abc'), 'soundboard-imli:release-abc');
  assert.equal(validateImageReference(`sha256:${'d'.repeat(64)}`), `sha256:${'d'.repeat(64)}`);
  assert.equal(validateImageReference('registry.example/soundboard-imli:release-abc'), 'registry.example/soundboard-imli:release-abc');
  assert.throws(() => parseArgs(['--image', '--help']));
  assert.throws(() => validateImageReference('https://registry.example/image:tag'));
  assert.throws(() => validateImageReference('user:password@registry.example/image:tag'));
  assert.throws(() => validateImageReference('image:tag;echo-secret'));
  assert.throws(() => validateImageReference('image tag'));
});

test('checks metadata and reads manifest in a networkless read-only container', async () => {
  const { docker, calls } = mockDocker();
  const result = await preflight('soundboard-imli:release', { docker, lock, lockBytes });
  assert.equal(result.ok, true);
  assert.equal(result.imageId, imageInfo.Id);
  assert.ok(result.checks.every(item => item.passed));
  assert.ok(calls[1].includes('--pull=never'));
  assert.ok(calls[1].includes('--network') && calls[1].includes('none'));
  assert.ok(calls[1].includes('--read-only'));
  assert.ok(calls[1].includes(imageInfo.Id));
  assert.equal(calls[1].includes('soundboard-imli:release'), false);
});

test('fails closed for a dirty or non-publishable source manifest', async () => {
  const dirty = structuredClone(pinnedManifest);
  dirty.sources.soundboard.dirty = true;
  dirty.sources.soundboard.publishable = false;
  const dirtyText = `${JSON.stringify(dirty, null, 2)}\n`;
  const dirtyHash = createHash('sha256').update(dirtyText).digest('hex');
  const info = structuredClone(imageInfo);
  info.Config.Labels['org.soundboard.release.manifest.sha256'] = dirtyHash;
  info.Config.Labels['org.soundboard.release.publishable'] = 'false';
  const { docker } = mockDocker({ info, manifestText: dirtyText });
  const result = await preflight('image:dirty', { docker, lock, lockBytes });
  assert.equal(result.ok, false);
  assert.equal(result.checks.find(item => item.name === 'Soundboard source is clean and publishable').passed, false);
  assert.equal(result.checks.find(item => item.name === 'publishable image label').passed, false);
});

test('fails closed for missing labels, wrong architecture, and manifest hash mismatch', async () => {
  const info = structuredClone(imageInfo);
  delete info.Config.Labels['org.soundboard.source.imli.revision'];
  info.Architecture = 'arm64';
  info.Config.User = 'root';
  const { docker } = mockDocker({ info, manifestText: `${manifestBytes} ` });
  const result = await preflight('image:bad', { docker, lock, lockBytes });
  assert.equal(result.ok, false);
  assert.equal(result.checks.find(item => item.name === 'linux/amd64 image').passed, false);
  assert.equal(result.checks.find(item => item.name === 'node runtime user').passed, false);
  assert.equal(result.checks.find(item => item.name === 'Imli revision label').passed, false);
  assert.equal(result.checks.find(item => item.name === 'manifest SHA-256 matches image label').passed, false);
});

test('does not run a manifest container when Docker did not resolve an immutable image ID', async () => {
  const info = structuredClone(imageInfo);
  info.Id = 'not-an-image-id';
  const { docker, calls } = mockDocker({ info });
  const result = await preflight('image:mutable', { docker, lock, lockBytes });
  assert.equal(result.ok, false);
  assert.equal(calls.length, 1);
  assert.equal(result.imageId, null);
});

test('fails closed when Docker cannot inspect or run the isolated manifest reader', async () => {
  assert.equal((await preflight('image:missing', { ...mockDocker({ inspectFails: true }), lock, lockBytes })).ok, false);
  assert.equal((await preflight('image:unreadable', { ...mockDocker({ runFails: true }), lock, lockBytes })).ok, false);
});

test('rejects a corrupted lock even when the manifest matches the corrupted values', () => {
  const corrupted = structuredClone(lock);
  corrupted.build.nodeImage = 'node:latest';
  const corruptedBytes = Buffer.from(JSON.stringify(corrupted));
  const matchingManifest = structuredClone(pinnedManifest);
  matchingManifest.build.nodeImage = corrupted.build.nodeImage;
  matchingManifest.build.releaseLockSha256 = createHash('sha256').update(corruptedBytes).digest('hex');
  assert.equal(validateManifestPins(matchingManifest, corrupted, createHash('sha256').update(corruptedBytes).digest('hex')), false);
});
