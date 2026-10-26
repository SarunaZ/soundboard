#!/usr/bin/env node
// Generate app-play's offline notices from an installed dependency tree.
// Run from the isolated final install, for example:
// node scripts/generate-play-notices.mjs /tmp/dependency-audit-work/app-play
// The script deliberately reads package manifests and files from that tree;
// it never infers or writes license prose.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const appRoot = resolve(process.argv[2] ?? 'app-play');
const repoRoot = resolve(process.argv[3] ?? '.');
const outPath = resolve(process.argv[4] ?? 'app-play/src/data/openSourceNotices.json');
const appManifest = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'));
const roots = Object.keys(appManifest.dependencies ?? {}).sort();
const graphEdges = [];
const packagePath = (fromDir, name) => {
  let dir = resolve(fromDir);
  while (true) {
    const candidate = join(dir, 'node_modules', ...name.split('/'), 'package.json');
    if (existsSync(candidate)) return realpathSync(candidate);
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};
const descriptors = new Map();
const queue = roots.map(name => ({ name, fromDir: appRoot, fromKey: `${appManifest.name ?? 'app-play'}@${appManifest.version ?? 'unknown'}`, relationship: 'dependency' }));
while (queue.length) {
  const item = queue.shift();
  const manifestPath = packagePath(item.fromDir, item.name);
  if (!manifestPath) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const key = `${manifest.name ?? item.name}@${manifest.version ?? 'unknown'}`;
  graphEdges.push({ from: item.fromKey, to: key, relationship: item.relationship });
  if (descriptors.has(key)) continue;
  const dir = dirname(manifestPath);
  descriptors.set(key, { key, name: manifest.name ?? item.name, version: manifest.version ?? 'unknown', manifest, dir, manifestPath });
  for (const relation of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const name of Object.keys(manifest[relation] ?? {}).sort()) queue.push({ name, fromDir: dir, fromKey: key, relationship: relation });
  }
}

const textNames = /^(LICENSE|LICENCE|COPYING|COPYRIGHT|NOTICE)(?:[._-].*)?$/i;
const isText = path => /\.(?:txt|md|markdown)$/i.test(path) || !/\.[^/]+$/.test(path);
function collectTexts(dir) {
  const result = [];
  // Only inspect the top-level package directory. These conventional names
  // contain the package's shipped license/copyright/notice material.
  let entries = [];
  try { entries = readdirSync(dir); } catch { return result; }
  for (const entry of entries) {
    if (!textNames.test(entry) || !isText(entry)) continue;
    const path = join(dir, entry);
    try {
      const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n').trim();
      if (text) result.push({ file: entry, text });
    } catch { /* binary or inaccessible candidates are omitted, never synthesized */ }
  }
  return result.sort((a, b) => a.file.localeCompare(b.file));
}
function licenseMetadata(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return null;
}
const records = [...descriptors.values()].map(({ name, version, manifest, dir }) => ({
  name,
  version,
  category: 'build/runtime dependency',
  license: licenseMetadata(manifest.license ?? manifest.licenses ?? null),
  source: typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url ?? null,
  texts: collectTexts(dir),
})).sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

// Apply only pinned package-version overrides, and only when the installed
// package did not ship conventional license/copyright/notice text itself.
const overridesPath = join(repoRoot, 'app-play/src/data/openSourceNoticeOverrides.json');
if (existsSync(overridesPath)) {
  const overrides = JSON.parse(readFileSync(overridesPath, 'utf8')).overrides ?? [];
  for (const override of overrides) {
    const record = records.find(item => item.name === override.name && item.version === override.version);
    if (record && record.texts.length === 0 && typeof override.text === 'string' && override.provenance?.url && override.provenance?.blobSha) {
      record.texts.push({ file: override.file, text: override.text, provenance: override.provenance });
    }
  }
}

// FFmpeg is a separately built native dependency rather than an npm package.
const ffmpegLicensePath = join(repoRoot, 'scripts/native-ffmpeg/LICENSE');
if (existsSync(ffmpegLicensePath)) records.push({
  name: 'FFmpeg', version: '8.0.3', category: 'native runtime dependency',
  license: 'LGPL-2.1-or-later', source: 'https://ffmpeg.org/releases/ffmpeg-8.0.3.tar.xz',
  sourceSha256: '6136812ea6d4e68bdba27e33c2a94382711cdf4f8602ffef056ff792bd6f9818',
  buildNote: 'Locally rebuilt for this app with GPL components disabled and no external codec libraries. This is a modified local build.',
  texts: [{ file: 'scripts/native-ffmpeg/LICENSE', text: readFileSync(ffmpegLicensePath, 'utf8').replace(/\r\n/g, '\n').trim() }],
});
records.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
graphEdges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.relationship.localeCompare(b.relationship));
const graphSha256 = createHash('sha256').update(JSON.stringify(graphEdges)).digest('hex');
const missingTexts = records.filter(record => record.texts.length === 0).map(({ name, version, license }) => ({ name, version, license }));
const output = {
  generatedFrom: 'FINAL isolated install dependency closure; dependencies, optionalDependencies, and installed peerDependencies',
  packageCount: records.length,
  dependencyGraphSha256: graphSha256,
  dependencyEdgeCount: graphEdges.length,
  scope: 'App Play JavaScript/runtime and Expo build dependency closure plus the separately built FFmpeg native runtime. This inventory does not complete Android native attribution review and is not a legal-compliance guarantee or source-distribution claim.',
  missingTexts,
  packages: records,
};
writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outPath, packageCount: records.length, npmPackageCount: descriptors.size, dependencyEdgeCount: graphEdges.length, graphSha256: output.dependencyGraphSha256, bytes: Buffer.byteLength(JSON.stringify(output)), missingTexts }, null, 2));
