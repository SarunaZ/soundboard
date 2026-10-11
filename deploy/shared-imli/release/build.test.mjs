import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dockerBuildArgs, exportImli, exportSoundboard, gitSource, parseArgs, validateLock, validatePackageManager } from './build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCK = JSON.parse(await readFile(path.join(HERE, 'lock.json'), 'utf8'));

async function temporary(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'soundboard-release-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function put(root, relative, contents = relative) {
  const file = path.join(root, ...relative.split('/'));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
}

test('release pins reject mutable or mismatched values', () => {
  assert.equal(validateLock(LOCK), LOCK);
  assert.throws(() => validateLock({ ...LOCK, sources: { ...LOCK.sources, imli: { ...LOCK.sources.imli, commit: 'latest' } } }), /full 40-character/);
  assert.throws(() => validateLock({ ...LOCK, build: { ...LOCK.build, ytDlp: { ...LOCK.build.ytDlp, version: 'latest' } } }), /match the verified/);
  assert.throws(() => validateLock({ ...LOCK, sources: { ...LOCK.sources, imli: { ...LOCK.sources.imli, url: 'https://user:pass@example.test/repo.git' } } }), /credential-free/);
});

test('CLI requires explicit output for prepare-only and recognizes dirty opt-in', () => {
  assert.throws(() => parseArgs(['--prepare-only']), /requires --output/);
  assert.throws(() => parseArgs(['--push']), /Unknown option/);
  assert.deepEqual(parseArgs(['--prepare-only', '--output', 'context', '--allow-dirty']), {
    allowDirty: true, prepareOnly: true, output: path.resolve('context'),
  });
});

test('packageManager Yarn versions must match the lock and may carry a Corepack hash', () => {
  assert.equal(validatePackageManager({ packageManager: 'yarn@4.18.0' }, LOCK.build.yarnSoundboard, 'Soundboard'), 'yarn@4.18.0');
  assert.equal(validatePackageManager({ packageManager: `yarn@4.6.0+sha512.${'a'.repeat(64)}` }, LOCK.build.yarnImli, 'Imli'), `yarn@4.6.0+sha512.${'a'.repeat(64)}`);
  assert.throws(() => validatePackageManager({ packageManager: 'yarn@4.19.0' }, LOCK.build.yarnSoundboard, 'Soundboard'), /match lock.json/);
  assert.throws(() => validatePackageManager({ packageManager: 'yarn@4.18.0+sha1.deadbeef' }, LOCK.build.yarnSoundboard, 'Soundboard'), /match lock.json/);
});

test('Soundboard and Imli exports contain only allowlisted regular build files', async t => {
  const root = await temporary(t);
  const sound = path.join(root, 'sound-src');
  const imli = path.join(root, 'imli-src');
  const soundOut = path.join(root, 'sound-out');
  const imliOut = path.join(root, 'imli-out');
  const inventory = [];
  for (const file of ['package.json', 'yarn.lock', '.yarnrc.yml', 'tsconfig.base.json', 'shared/package.json', 'shared/tsconfig.json', 'service/package.json', 'service/tsconfig.json', 'worker/package.json', 'app-client/package.json', 'shared/src/index.ts', 'service/src/index.ts', 'service/src/editor/contracts.ts', 'service/src/worker/health.ts', 'service/src/worker/health.test.ts']) await put(sound, file);
  await put(sound, '.env', 'must not be included');
  await put(sound, 'service/src/editor/contracts.test.ts', 'test fixture must not ship');
  await put(sound, 'service/src/editor/fixtures/sample.wav', 'fixture must not ship');
  for (const file of ['package.json', 'yarn.lock', '.yarnrc.yml', 'tsconfig.json', 'src/index.ts']) await put(imli, file);
  await put(imli, '.env', 'must not be included');
  await mkdir(soundOut, { recursive: true });
  await mkdir(imliOut, { recursive: true });
  await exportSoundboard({ sourceRoot: sound, destinationRoot: soundOut, inventory });
  await exportImli({ sourceRoot: imli, destinationRoot: imliOut, inventory });
  assert.equal(await readFile(path.join(soundOut, 'service/src/editor/contracts.ts'), 'utf8'), 'service/src/editor/contracts.ts');
  assert.equal(await readFile(path.join(soundOut, 'service/src/worker/health.ts'), 'utf8'), 'service/src/worker/health.ts');
  await assert.rejects(readFile(path.join(soundOut, 'service/src/worker/health.test.ts')));
  assert.equal(await readFile(path.join(imliOut, 'src/index.ts'), 'utf8'), 'src/index.ts');
  assert.equal(inventory.some(item => item.path.includes('.env')), false);
  assert.equal(inventory.some(item => item.path.includes('.test.')), false);
  assert.equal(inventory.some(item => item.path.includes('fixtures')), false);
});

test('release context copies the gateway health runtime and installs a readiness health check', async () => {
  const builder = await readFile(path.join(HERE, 'build.mjs'), 'utf8');
  const dockerfile = await readFile(path.join(HERE, 'Dockerfile'), 'utf8');
  const runtime = await readFile(path.join(HERE, '..', 'health.mjs'), 'utf8');
  assert.match(builder, /\['gateway\.mjs', 'health\.mjs', 'supervisor\.mjs'\]/);
  assert.match(dockerfile, /COPY --chown=node:node gateway\.mjs health\.mjs supervisor\.mjs/);
  assert.match(dockerfile, /__shared\/ready/);
  assert.match(runtime, /MAX_RESPONSE_BYTES = 1_024/);
});

test('allowlisted exports reject secret filenames and symlinks', async t => {
  const root = await temporary(t);
  const sound = path.join(root, 'sound');
  const out = path.join(root, 'out');
  for (const file of ['package.json', 'yarn.lock', '.yarnrc.yml', 'tsconfig.base.json', 'shared/package.json', 'shared/tsconfig.json', 'service/package.json', 'service/tsconfig.json', 'worker/package.json', 'app-client/package.json']) await put(sound, file);
  await put(sound, 'shared/src/token.secret', 'x');
  await mkdir(out, { recursive: true });
  await assert.rejects(exportSoundboard({ sourceRoot: sound, destinationRoot: out }), /secret-like/);
  await rm(path.join(sound, 'shared/src/token.secret'));
  await put(sound, 'shared/src/linked/file.ts', 'target');
  await symlink(path.join(sound, 'shared/src/linked'), path.join(sound, 'shared/src/link'), 'junction');
  await assert.rejects(exportSoundboard({ sourceRoot: sound, destinationRoot: out }), /symlink/);

  const ancestorSound = path.join(root, 'ancestor-sound');
  const sharedTarget = path.join(root, 'shared-target');
  for (const file of ['package.json', 'yarn.lock', '.yarnrc.yml', 'tsconfig.base.json', 'service/package.json', 'service/tsconfig.json', 'worker/package.json', 'app-client/package.json']) await put(ancestorSound, file);
  for (const file of ['package.json', 'tsconfig.json', 'src/index.ts']) await put(sharedTarget, file);
  await symlink(sharedTarget, path.join(ancestorSound, 'shared'), 'junction');
  await assert.rejects(exportSoundboard({ sourceRoot: ancestorSound, destinationRoot: path.join(root, 'ancestor-out') }), /symlink/);
});

test('dirty checkouts require explicit opt-in and remain non-publishable', async t => {
  const root = await temporary(t);
  execFileSync('git', ['init', '--quiet', root]);
  await put(root, 'tracked.txt', 'clean');
  execFileSync('git', ['-C', root, 'add', 'tracked.txt']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Release Test', '-c', 'user.email=release-test@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  const clean = await gitSource(root, false);
  assert.equal(clean.publishable, true);
  await writeFile(path.join(root, 'tracked.txt'), 'changed');
  await assert.rejects(gitSource(root, false), /dirty/);
  const dirty = await gitSource(root, true);
  assert.equal(dirty.publishable, false);
  assert.equal(dirty.dirty, true);
});

test('Docker build command is local-only and records revision inventory labels', () => {
  const manifest = { sources: { soundboard: { revision: 'a'.repeat(40), publishable: false }, imli: { revision: LOCK.sources.imli.commit } } };
  const args = dockerBuildArgs({ context: 'C:/tmp/release', lock: LOCK, manifest, manifestHash: 'b'.repeat(64), tag: 'soundboard-imli:test' });
  assert.ok(args.includes('--load'));
  assert.ok(args.includes('--platform') && args.includes('linux/amd64'));
  assert.ok(args.includes('PUBLISHABLE=false'));
  assert.ok(args.includes(`RELEASE_MANIFEST_SHA256=${'b'.repeat(64)}`));
  assert.equal(args.includes('--push'), false);
  assert.equal(args.at(-1), 'C:/tmp/release');
});
