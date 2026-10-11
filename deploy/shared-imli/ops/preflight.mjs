#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateLock } from '../release/build.mjs';

const LABELS = {
  soundboard: 'org.soundboard.source.revision',
  imli: 'org.soundboard.source.imli.revision',
  manifest: 'org.soundboard.release.manifest.sha256',
  publishable: 'org.soundboard.release.publishable',
};
const FULL_SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const HERE = path.dirname(fileURLToPath(import.meta.url));

function check(name, passed, detail) { return { name, passed, detail }; }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

export function validateImageReference(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255 || /\s/.test(value) || value.startsWith('-')) {
    throw new Error('Image must be a local Docker reference or sha256 image ID.');
  }
  if (/^sha256:[a-f0-9]{64}$/.test(value)) return value;
  // Deliberately accept only ordinary Docker name/tag/digest characters. This
  // is passed as one spawn argument and can never become a Docker option.
  if (!/^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/.test(value) || value.includes('://') || (value.includes('@') && !/@sha256:[a-f0-9]{64}$/.test(value))) {
    throw new Error('Image must be a local Docker reference or sha256 image ID.');
  }
  return value;
}

export function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--image') throw new Error('Usage: node deploy/shared-imli/ops/preflight.mjs --image <LOCAL_IMAGE>');
  return { image: validateImageReference(argv[1]) };
}

function runDocker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.error || result.status !== 0) return { ok: false, stdout: '' };
  return { ok: true, stdout: result.stdout ?? '' };
}

function inspectConfig(inspect, checks) {
  const config = inspect?.Config ?? {};
  const labels = config.Labels ?? {};
  const entrypoint = config.Entrypoint;
  checks.push(check('linux/amd64 image', inspect?.Os === 'linux' && inspect?.Architecture === 'amd64', `${inspect?.Os ?? 'unknown'}/${inspect?.Architecture ?? 'unknown'}`));
  checks.push(check('node runtime user', config.User === 'node', config.User ? 'configured' : 'missing'));
  checks.push(check('tini supervisor entrypoint', Array.isArray(entrypoint) && entrypoint[0] === '/usr/bin/tini' && entrypoint.includes('/opt/shared-imli/supervisor.mjs'), Array.isArray(entrypoint) && entrypoint[0] === '/usr/bin/tini' ? 'present' : 'missing or unexpected'));
  const healthTest = config.Healthcheck?.Test;
  checks.push(check('readiness Docker healthcheck', Array.isArray(healthTest) && healthTest.join(' ').includes('/__shared/ready'), Array.isArray(healthTest) && healthTest.join(' ').includes('/__shared/ready') ? 'configured' : 'missing or unexpected'));
  checks.push(check('publishable image label', labels[LABELS.publishable] === 'true', labels[LABELS.publishable] === 'true' ? 'true' : 'not true'));
  for (const [name, key] of [['Soundboard revision label', LABELS.soundboard], ['Imli revision label', LABELS.imli]]) {
    checks.push(check(name, FULL_SHA.test(labels[key] ?? ''), FULL_SHA.test(labels[key] ?? '') ? 'full commit SHA' : 'missing or invalid'));
  }
  checks.push(check('manifest hash label', HASH.test(labels[LABELS.manifest] ?? ''), HASH.test(labels[LABELS.manifest] ?? '') ? 'sha256 present' : 'missing or invalid'));
  return labels;
}

export function validateManifestPins(manifest, lock, lockHash) {
  try { validateLock(lock); } catch { return false; }
  const build = manifest?.build;
  const lockedBuild = lock?.build;
  return manifest?.schemaVersion === 1 && lock?.schemaVersion === 1
    && manifest.sources?.imli?.revision === lock.sources?.imli?.commit
    && manifest.sources?.imli?.url === lock.sources?.imli?.url
    && build?.platform === lockedBuild?.platform
    && build?.nodeImage === lockedBuild?.nodeImage
    && build?.yarnSoundboard === lockedBuild?.yarnSoundboard
    && build?.yarnImli === lockedBuild?.yarnImli
    && build?.ytDlp?.version === lockedBuild?.ytDlp?.version
    && build?.ytDlp?.url === lockedBuild?.ytDlp?.url
    && build?.ytDlp?.sha256 === lockedBuild?.ytDlp?.sha256
    && build?.releaseLockSha256 === lockHash;
}

export async function preflight(image, { docker = runDocker, lock, lockBytes } = {}) {
  const checks = [];
  let imageInfo;
  const inspected = docker(['image', 'inspect', '--format', '{{json .}}', image]);
  if (!inspected.ok) {
    checks.push(check('local image inspect', false, 'image unavailable or Docker inspect failed'));
    return { ok: false, checks };
  }
  try { imageInfo = JSON.parse(inspected.stdout); }
  catch {
    checks.push(check('local image inspect', false, 'Docker returned invalid metadata'));
    return { ok: false, checks };
  }
  checks.push(check('local image inspect', true, 'metadata read'));
  const labels = inspectConfig(imageInfo, checks);
  const imageId = imageInfo.Id;
  const validImageId = /^sha256:[a-f0-9]{64}$/.test(imageId ?? '');
  checks.push(check('resolved local image ID', validImageId, validImageId ? imageId : 'missing or invalid'));
  if (!validImageId) return { ok: false, checks, imageId: null };

  const manifestRead = docker([
    'run', '--rm', '--pull=never', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges', '--pids-limit', '32', '--memory', '64m',
    '--entrypoint', 'cat', imageId,
    '/opt/shared-imli/release-manifest.json',
  ]);
  if (!manifestRead.ok) {
    checks.push(check('embedded release manifest', false, 'isolated read-only container failed'));
    return { ok: false, checks, imageId };
  }
  let manifest;
  try { manifest = JSON.parse(manifestRead.stdout); }
  catch {
    checks.push(check('embedded release manifest', false, 'missing or invalid JSON'));
    return { ok: false, checks, imageId };
  }
  const bytes = Buffer.from(manifestRead.stdout, 'utf8');
  const manifestHash = sha256(bytes);
  checks.push(check('embedded release manifest', true, 'JSON parsed'));
  checks.push(check('manifest SHA-256 matches image label', manifestHash === labels[LABELS.manifest], manifestHash === labels[LABELS.manifest] ? 'matches' : 'mismatch'));
  checks.push(check('Soundboard source is clean and publishable', manifest.sources?.soundboard?.dirty === false && manifest.sources?.soundboard?.publishable === true, manifest.sources?.soundboard?.publishable === true && manifest.sources?.soundboard?.dirty === false ? 'clean' : 'dirty or non-publishable'));
  checks.push(check('Soundboard revision matches label', manifest.sources?.soundboard?.revision === labels[LABELS.soundboard] && FULL_SHA.test(manifest.sources?.soundboard?.revision ?? ''), manifest.sources?.soundboard?.revision === labels[LABELS.soundboard] ? 'matches' : 'missing or mismatch'));
  checks.push(check('Imli revision matches label', manifest.sources?.imli?.revision === labels[LABELS.imli] && FULL_SHA.test(manifest.sources?.imli?.revision ?? ''), manifest.sources?.imli?.revision === labels[LABELS.imli] ? 'matches' : 'missing or mismatch'));
  const pinsMatch = Boolean(lock && lockBytes && validateManifestPins(manifest, lock, sha256(lockBytes)));
  checks.push(check('release manifest pins match release lock', pinsMatch, pinsMatch ? 'match' : 'missing or mismatch'));
  return { ok: checks.every(item => item.passed), checks, imageId };
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  let image;
  try {
    ({ image } = parseArgs(argv));
  } catch {
    const result = { ok: false, checks: [check('arguments', false, 'expected --image <LOCAL_IMAGE>')] };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 1;
  }
  let lock;
  let lockBytes;
  try {
    lockBytes = await readFile(path.join(HERE, '..', 'release', 'lock.json'));
    lock = validateLock(JSON.parse(lockBytes.toString('utf8')));
  } catch {
    const result = { ok: false, checks: [check('release lock', false, 'missing or invalid local release lock')] };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 1;
  }
  const result = await preflight(image, { ...dependencies, lock, lockBytes });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url.toLowerCase() === pathToFileURL(process.argv[1]).href.toLowerCase()) {
  process.exitCode = await main();
}
