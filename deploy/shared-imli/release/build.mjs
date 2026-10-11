#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LOCK_PATH = path.join(HERE, 'lock.json');
const SOUND_ROOT_FILES = ['package.json', 'yarn.lock', '.yarnrc.yml', 'tsconfig.base.json'];
const SOUND_PACKAGE_FILES = [
  'shared/package.json', 'shared/tsconfig.json',
  'service/package.json', 'service/tsconfig.json',
  'worker/package.json', 'app-client/package.json',
];
const SOURCE_DIRS = ['shared/src', 'service/src'];
const IMLI_FILES = ['package.json', 'yarn.lock', '.yarnrc.yml', 'tsconfig.json'];
const SECRET_NAME = /(^|[._-])(?:\.env(?:\.|$)|secrets?|credentials?|passwords?|passwd|tokens?|api[-_.]?keys?|private[-_.]?key|id_rsa|id_ed25519|\.npmrc|\.pypirc|\.netrc)(?:$|[._-])/i;
const OMIT_PATH = /(^|\/)(?:test|tests|fixtures|__tests__)(?:\/|$)|(?:^|\/)[^/]+\.test\.[^/]+$/i;

function fail(message) { throw new Error(message); }
function sha256(data) { return createHash('sha256').update(data).digest('hex'); }

export function validateLock(lock) {
  const hash = /^[a-f0-9]{64}$/;
  const sha = /^[a-f0-9]{40}$/;
  if (lock?.schemaVersion !== 1) fail('Unsupported release lock schema.');
  if (lock.sources?.soundboard !== 'checkout') fail('Soundboard source must be this checkout.');
  if (lock.sources?.imli?.url !== 'https://github.com/SarunaZ/app-imli-server.git') fail('Imli source URL is not the approved credential-free HTTPS URL.');
  if (!sha.test(lock.sources?.imli?.commit ?? '')) fail('Imli commit pin must be a full 40-character lowercase Git SHA.');
  if (lock.build?.platform !== 'linux/amd64') fail('Release platform must be linux/amd64.');
  if (lock.build?.nodeImage !== 'node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20') fail('Node image pin is missing or unexpected.');
  if (lock.build?.yarnSoundboard !== '4.18.0' || lock.build?.yarnImli !== '4.6.0') fail('Yarn pins must match the versions applied by the release Dockerfile.');
  if (lock.build?.ytDlp?.version !== '2026.08.19' || lock.build?.ytDlp?.sha256 !== '58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a') fail('yt-dlp version and SHA-256 must match the verified release artifact.');
  const artifact = `https://github.com/yt-dlp/yt-dlp/releases/download/${lock.build.ytDlp.version}/yt-dlp_linux`;
  if (lock.build.ytDlp.url !== artifact) fail('yt-dlp URL must match the fixed official release artifact for the pinned version.');
  return lock;
}

export function validatePackageManager(packageJson, expectedVersion, name) {
  const actual = packageJson?.packageManager;
  const match = typeof actual === 'string' && /^yarn@(\d+\.\d+\.\d+)(?:\+sha512\.[A-Za-z0-9+/=_-]+)?$/.exec(actual);
  if (!match || match[1] !== expectedVersion) fail(`${name} packageManager must pin yarn@${expectedVersion} to match lock.json.`);
  return actual;
}

export function parseArgs(argv) {
  const options = { allowDirty: false, prepareOnly: false, output: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--allow-dirty') options.allowDirty = true;
    else if (arg === '--prepare-only') options.prepareOnly = true;
    else if (arg === '--output') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) fail('--output requires a directory path.');
      options.output = path.resolve(argv[++i]);
    } else if (arg === '--help' || arg === '-h') options.help = true;
    else fail(`Unknown option: ${arg}`);
  }
  if (options.prepareOnly && !options.output) fail('--prepare-only requires --output <directory>.');
  return options;
}

function runSync(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    windowsHide: true,
    env: options.env ?? process.env,
    stdio: options.silent ? ['ignore', 'pipe', 'ignore'] : 'pipe',
  });
  if (result.error || result.status !== 0) {
    const message = options.failure ?? `${command} failed${result.status ? ` with exit ${result.status}` : ''}.`;
    fail(message);
  }
  return (result.stdout ?? '').trim();
}

function git(cwd, args, extra = {}) {
  return runSync('git', args, {
    cwd,
    silent: true,
    ...extra,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never', ...(extra.env ?? {}) },
  });
}

async function hashFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function isSecretName(name) {
  return SECRET_NAME.test(name) || /^\.env(?:\.|$)/i.test(name) || /^\.(?:npmrc|pypirc|netrc)$/i.test(name) || /\.(?:pem|key|p12|pfx)$/i.test(name);
}

async function addInventoryFile(sourceRoot, relative, destinationRoot, inventory, prefix = '') {
  const normalized = relative.split(path.sep).join('/');
  if (isSecretName(path.posix.basename(normalized))) fail(`Refusing secret-like source filename: ${normalized}`);
  const components = normalized.split('/');
  let cursor = sourceRoot;
  for (let index = 0; index < components.length; index++) {
    cursor = path.join(cursor, components[index]);
    const partInfo = await lstat(cursor).catch(() => null);
    if (!partInfo || partInfo.isSymbolicLink()) fail(`Required source path is missing or contains a symlink: ${normalized}`);
    if (index < components.length - 1 && !partInfo.isDirectory()) fail(`Source path component is not a directory: ${normalized}`);
    if (index === components.length - 1 && !partInfo.isFile()) fail(`Required regular source file is missing or unsafe: ${normalized}`);
  }
  const sourcePath = cursor;
  const output = path.join(destinationRoot, ...normalized.split('/'));
  await mkdir(path.dirname(output), { recursive: true });
  await copyFile(sourcePath, output);
  inventory.push({ path: `${prefix}${normalized}`, sha256: await hashFile(output) });
}

async function walkSource(sourceRoot, relative, destinationRoot, inventory, prefix = '') {
  let abs = sourceRoot;
  const components = relative.split('/');
  for (const [index, component] of components.entries()) {
    abs = path.join(abs, component);
    const componentInfo = await lstat(abs).catch(() => null);
    if (!componentInfo || componentInfo.isSymbolicLink()) fail(`Refusing missing path or symlink in source: ${relative}`);
    if (index < components.length - 1 && !componentInfo.isDirectory()) fail(`Source path component is not a directory: ${relative}`);
  }
  const info = await lstat(abs);
  if (info.isSymbolicLink()) fail(`Refusing symlink in source: ${relative}`);
  if (info.isFile()) {
    if (!OMIT_PATH.test(relative)) await addInventoryFile(sourceRoot, relative, destinationRoot, inventory, prefix);
    return;
  }
  if (!info.isDirectory()) fail(`Refusing non-file source input: ${relative}`);
  const names = (await readdir(abs)).sort((a, b) => a.localeCompare(b, 'en'));
  for (const name of names) {
    if (isSecretName(name)) fail(`Refusing secret-like source filename: ${relative}/${name}`);
    await walkSource(sourceRoot, `${relative}/${name}`, destinationRoot, inventory, prefix);
  }
}

export async function exportSoundboard({ sourceRoot, destinationRoot, inventory = [] }) {
  for (const relative of [...SOUND_ROOT_FILES, ...SOUND_PACKAGE_FILES]) {
    await addInventoryFile(sourceRoot, relative, destinationRoot, inventory, 'soundboard/');
  }
  for (const relative of SOURCE_DIRS) await walkSource(sourceRoot, relative, destinationRoot, inventory, 'soundboard/');
  return inventory;
}

export async function exportImli({ sourceRoot, destinationRoot, inventory = [] }) {
  for (const relative of IMLI_FILES) await addInventoryFile(sourceRoot, relative, destinationRoot, inventory, 'imli/');
  await walkSource(sourceRoot, 'src', destinationRoot, inventory, 'imli/');
  return inventory;
}

export async function gitSource(sourceRoot, allowDirty) {
  const root = await realpath(sourceRoot);
  const revision = git(root, ['rev-parse', 'HEAD'], { failure: 'Could not read Soundboard checkout revision.' });
  if (!/^[a-f0-9]{40}$/i.test(revision)) fail('Soundboard checkout did not provide a full Git revision.');
  const status = git(root, ['status', '--porcelain=v1', '--untracked-files=all'], { failure: 'Could not inspect Soundboard checkout status.' });
  const dirty = status.length > 0;
  if (dirty && !allowDirty) fail('Soundboard checkout is dirty. Review changes or pass --allow-dirty for a non-publishable verification image.');
  return { root, revision: revision.toLowerCase(), dirty, publishable: !dirty };
}

async function fetchImli(lock, workRoot) {
  const checkout = path.join(workRoot, 'imli-checkout');
  await mkdir(checkout, { recursive: true });
  git(checkout, ['init', '--quiet'], { failure: 'Could not initialize temporary Imli fetch.' });
  git(checkout, ['remote', 'add', 'origin', lock.sources.imli.url], { failure: 'Could not configure the approved Imli source.' });
  git(checkout, ['config', 'core.sparseCheckout', 'true'], { failure: 'Could not configure sparse Imli checkout.' });
  const sparse = [...IMLI_FILES, 'src/'].join('\n') + '\n';
  await mkdir(path.join(checkout, '.git', 'info'), { recursive: true });
  await writeFile(path.join(checkout, '.git', 'info', 'sparse-checkout'), sparse, { mode: 0o600 });
  git(checkout, ['-c', 'credential.interactive=never', 'fetch', '--depth=1', '--filter=blob:none', 'origin', lock.sources.imli.commit], {
    failure: 'Authenticated fetch of the pinned Imli commit failed. Git used the configured credential helper noninteractively; no credentials were logged.',
  });
  git(checkout, ['checkout', '--quiet', '--detach', 'FETCH_HEAD'], { failure: 'Could not check out the pinned Imli source.' });
  const revision = git(checkout, ['rev-parse', 'HEAD'], { failure: 'Could not verify fetched Imli revision.' }).toLowerCase();
  if (revision !== lock.sources.imli.commit) fail('Fetched Imli revision does not match lock.json.');
  return { root: checkout, revision };
}

async function walkFiles(root, relative = '') {
  const output = [];
  const abs = path.join(root, relative);
  for (const name of (await readdir(abs)).sort((a, b) => a.localeCompare(b, 'en'))) {
    const child = relative ? `${relative}/${name}` : name;
    const info = await lstat(path.join(root, child));
    if (info.isSymbolicLink()) fail(`Refusing symlink in prepared context: ${child}`);
    if (info.isDirectory()) output.push(...await walkFiles(root, child));
    else if (info.isFile()) output.push(child.split(path.sep).join('/'));
    else fail(`Refusing non-regular context entry: ${child}`);
  }
  return output;
}

export async function prepareContext({ sourceRoot, workRoot, destinationRoot, allowDirty = false, lock }) {
  lock ??= validateLock(JSON.parse(await readFile(LOCK_PATH, 'utf8')));
  const sb = await gitSource(sourceRoot, allowDirty);
  const imli = await fetchImli(lock, workRoot);
  const context = path.join(workRoot, 'context');
  await mkdir(context, { recursive: false });
  const inventory = [];
  const sbContext = path.join(context, 'soundboard');
  await mkdir(sbContext, { recursive: true });
  await exportSoundboard({ sourceRoot: sb.root, destinationRoot: sbContext, inventory });
  await exportImli({ sourceRoot: imli.root, destinationRoot: path.join(context, 'imli'), inventory });
  validatePackageManager(JSON.parse(await readFile(path.join(sbContext, 'package.json'), 'utf8')), lock.build.yarnSoundboard, 'Soundboard');
  validatePackageManager(JSON.parse(await readFile(path.join(context, 'imli', 'package.json'), 'utf8')), lock.build.yarnImli, 'Imli');
  const deployRoot = path.dirname(HERE);
  for (const file of ['gateway.mjs', 'health.mjs', 'supervisor.mjs']) {
    const from = path.join(deployRoot, file);
    const to = path.join(context, file);
    const info = await lstat(from);
    if (info.isSymbolicLink() || !info.isFile()) fail(`Unsafe runtime support file: ${file}`);
    await copyFile(from, to);
    inventory.push({ path: `deploy/shared-imli/${file}`, sha256: await hashFile(to) });
  }
  const dockerfile = path.join(HERE, 'Dockerfile');
  await copyFile(dockerfile, path.join(context, 'Dockerfile'));
  inventory.push({ path: 'deploy/shared-imli/release/Dockerfile', sha256: await hashFile(path.join(context, 'Dockerfile')) });
  inventory.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  inventory.push({ path: 'deploy/shared-imli/release/lock.json', sha256: await hashFile(LOCK_PATH) });
  inventory.push({ path: 'deploy/shared-imli/release/build.mjs', sha256: await hashFile(path.join(HERE, 'build.mjs')) });
  inventory.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const sbAfterCopy = await gitSource(sb.root, allowDirty);
  if (sbAfterCopy.revision !== sb.revision) fail('Soundboard HEAD changed while preparing the release context.');
  const sourceInventoryHash = sha256(JSON.stringify(inventory));
  const manifest = {
    schemaVersion: 1,
    sources: {
      soundboard: { revision: sb.revision, dirty: sb.dirty, publishable: sb.publishable },
      imli: { url: lock.sources.imli.url, revision: imli.revision },
    },
    build: { ...lock.build, releaseLockSha256: await hashFile(LOCK_PATH) },
    inputInventorySha256: sourceInventoryHash,
    inputs: inventory,
  };
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestHash = sha256(manifestBytes);
  await writeFile(path.join(context, 'release-manifest.json'), manifestBytes, { flag: 'wx' });
  const contextFiles = await walkFiles(context);
  const contextIndex = {
    schemaVersion: 1,
    manifestSha256: manifestHash,
    files: await Promise.all(contextFiles.map(async file => ({ path: file, sha256: await hashFile(path.join(context, file)) }))),
  };
  await writeFile(path.join(context, 'context-index.json'), `${JSON.stringify(contextIndex, null, 2)}\n`, { flag: 'wx' });
  if (destinationRoot) {
    await copyPreparedContext(context, destinationRoot);
    return { context: destinationRoot, manifest, manifestHash, sourceInventoryHash };
  }
  return { context, manifest, manifestHash, sourceInventoryHash };
}

async function copyPreparedContext(source, destination) {
  const destInfo = await lstat(destination).catch(() => null);
  if (destInfo?.isSymbolicLink()) fail('--output cannot be a symlink.');
  const destStat = destInfo;
  if (destStat) {
    if (!destStat.isDirectory()) fail('--output must be a directory.');
    if ((await readdir(destination)).length > 0) fail('--output directory already exists and is not empty; refusing to overwrite user data.');
  } else {
    await mkdir(destination, { recursive: false });
  }
  const files = await walkFiles(source);
  for (const relative of files) {
    const output = path.join(destination, ...relative.split('/'));
    await mkdir(path.dirname(output), { recursive: true });
    await copyFile(path.join(source, relative), output);
  }
}

async function validateOutputPath(output, sourceRoot) {
  const absolute = path.resolve(output);
  const root = path.resolve(sourceRoot);
  const relative = path.relative(root, absolute);
  const insideRoot = relative === '' || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  if (insideRoot && !relative.startsWith(`data${path.sep}`)) fail('An output path inside the checkout must be under ignored data/.');
  const parent = path.dirname(absolute);
  let ancestor = parent;
  while (true) {
    const info = await lstat(ancestor).catch(() => null);
    if (info) {
      if (info.isSymbolicLink()) fail('--output cannot traverse a symlinked parent directory.');
      break;
    }
    const next = path.dirname(ancestor);
    if (next === ancestor) fail('Could not find an existing parent for --output.');
    ancestor = next;
  }
  await mkdir(parent, { recursive: true });
  const realParent = await realpath(parent);
  if (path.resolve(realParent) !== parent) fail('--output cannot traverse a symlinked parent directory.');
  return absolute;
}

export function dockerBuildArgs({ context, lock, manifest, manifestHash, tag }) {
  const dockerfile = [
    'buildx', 'build', '--load', '--platform', lock.build.platform,
    '--file', path.join(context, 'Dockerfile'), '--tag', tag,
    '--build-arg', `NODE_IMAGE=${lock.build.nodeImage}`,
    '--build-arg', `SOUNDBOARD_REVISION=${manifest.sources.soundboard.revision}`,
    '--build-arg', `IMLI_REVISION=${manifest.sources.imli.revision}`,
    '--build-arg', `RELEASE_MANIFEST_SHA256=${manifestHash}`,
    '--build-arg', `PUBLISHABLE=${manifest.sources.soundboard.publishable}`,
  ];
  return [...dockerfile, context];
}

async function runDocker(args) {
  await new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: 'inherit', windowsHide: true });
    child.once('error', () => reject(new Error('Could not start Docker.')));
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`Docker buildx failed with exit ${code ?? 'unknown'}.`)));
  });
}

function usage() {
  return `Usage: node deploy/shared-imli/release/build.mjs [--allow-dirty] [--prepare-only --output DIR]\n\nBuilds a local linux/amd64 Soundboard + pinned Imli image. No image is pushed.\n`;
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  if (Number(process.versions.node.split('.')[0]) !== 24) fail('Node 24 is required to run the release builder.');
  const options = parseArgs(argv);
  if (options.help) { process.stdout.write(usage()); return; }
  const lock = validateLock(JSON.parse(await readFile(LOCK_PATH, 'utf8')));
  const sourceRoot = dependencies.sourceRoot ?? path.resolve(HERE, '../../..');
  const outputPath = options.output ? await validateOutputPath(options.output, sourceRoot) : null;
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'soundboard-imli-release-'));
  try {
    const prepared = await prepareContext({ sourceRoot, workRoot: tempRoot, destinationRoot: outputPath, allowDirty: options.allowDirty, lock });
    const context = prepared.context;
    if (options.prepareOnly) {
      process.stdout.write(`${JSON.stringify({ preparedOnly: true, publishable: prepared.manifest.sources.soundboard.publishable, context, manifestSha256: prepared.manifestHash, sourceInventorySha256: prepared.sourceInventoryHash }, null, 2)}\n`);
      return;
    }
    const tag = `soundboard-imli:${prepared.manifest.sources.soundboard.revision.slice(0, 12)}-${prepared.manifest.sources.imli.revision.slice(0, 12)}-${prepared.manifestHash.slice(0, 12)}`;
    await runDocker(dockerBuildArgs({ context, lock, manifest: prepared.manifest, manifestHash: prepared.manifestHash, tag }));
    const imageId = runSync('docker', ['image', 'inspect', '--format', '{{.Id}}', tag], { failure: 'Image was built but its local image ID could not be inspected.' });
    process.stdout.write(`${JSON.stringify({ tag, imageId, publishable: prepared.manifest.sources.soundboard.publishable, manifestSha256: prepared.manifestHash, sourceInventorySha256: prepared.sourceInventoryHash, soundboardRevision: prepared.manifest.sources.soundboard.revision, imliRevision: prepared.manifest.sources.imli.revision, pushed: false }, null, 2)}\n`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(HERE, 'build.mjs')) {
  main().catch(error => {
    process.stderr.write(`release build: ${error.message}\n`);
    process.exitCode = 1;
  });
}
