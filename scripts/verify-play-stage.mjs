import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const forbiddenMarker = /soundboard-youtube|yt-dlp|youtube-dl|YoutubeExtractor|NativeYoutube|onDeviceYoutube|youtubeUrl|youtube\.com|youtu\.be/i;
const forbiddenArtifactMarker = /soundboard-youtube|yt-dlp|youtube-dl|YoutubeExtractor|NativeYoutube|onDeviceYoutube|youtubeUrl|youtube\.com|youtu\.be|com[./]yausername|libpython|quickjs|youtubedl/i;
const forbiddenSegments = new Set(['.git', '.expo', 'node_modules', 'android', 'ios', 'build', 'dist', '.yarn']);
const allowedAppPlayFiles = new Set([
  'index.ts', 'App.tsx', 'app.json', 'package.json', 'tsconfig.json', '.gitignore', 'README.md',
  'assets/stimyz/icon.png',
  'assets/stimyz/android-icon-foreground.png',
  'assets/stimyz/android-icon-monochrome.png',
]);
const allowedAppPlayTrees = new Set(['src/ui', 'src/types', 'src/data', 'src/media', 'plugins', 'modules-empty']);
const allowedDevLeaves = new Set([
  'app-client/src/audio/engine.ts',
  'app-client/src/audio/playbackState.ts',
  'app-client/src/editor/catalog.ts',
  'app-client/src/editor/importValidation.ts',
  'app-client/src/editor/localAudioPcm.ts',
  'app-client/src/limits.ts',
  'app-client/src/keyboard/keyboardGeometry.ts',
  'app-client/src/keyboard/useKeyboardInputReveal.ts',
  'app-client/src/board/reorderGeometry.ts',
  'app-client/src/types/react-native-audio-api.d.ts',
]);
const allowedRootFiles = new Set(['package.json', '.yarnrc.yml', 'yarn.lock', 'play-stage-inventory.json']);
const allowedWorkspaceManifests = new Map([
  ['shared/package.json', '@soundboard/shared'],
  ['service/package.json', '@soundboard/service'],
  ['worker/package.json', '@soundboard/media-worker'],
  ['app-client/package.json', 'app-client'],
]);
const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];
const semverIdentifier = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)';
const safeSemver = new RegExp(`^(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-${semverIdentifier}(?:\\.${semverIdentifier})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);

export function validateReleaseMetadata(appConfig) {
  if (typeof appConfig?.version !== 'string' || appConfig.version.length > 128 || appConfig.version.trim() !== appConfig.version || !safeSemver.test(appConfig.version)) {
    throw new Error('Play version must be a safe semantic version string.');
  }
  if (!Number.isSafeInteger(appConfig.android?.versionCode) || appConfig.android.versionCode < 1 || appConfig.android.versionCode > 2_100_000_000) {
    throw new Error('Play Android versionCode must be a positive integer no greater than 2100000000.');
  }
}

export function validateRecordingPermissionPolicy(appConfig) {
  const blocked = appConfig.android?.blockedPermissions ?? [];
  if (!Array.isArray(blocked) || blocked.includes('android.permission.RECORD_AUDIO')) {
    throw new Error('Play must allow RECORD_AUDIO for local sound recording.');
  }
  const audioPlugin = (appConfig.plugins ?? []).find((plugin) => Array.isArray(plugin) ? plugin[0] === 'expo-audio' : plugin === 'expo-audio');
  const options = Array.isArray(audioPlugin) ? audioPlugin[1] : null;
  if (options?.recordAudioAndroid !== true) throw new Error('Play expo-audio must enable Android recording permission.');
  if (typeof options.microphonePermission !== 'string' || !options.microphonePermission.trim()) {
    throw new Error('Play expo-audio must provide the iOS microphone permission message.');
  }
  if (options.enableBackgroundRecording !== false || options.enableBackgroundPlayback !== false) {
    throw new Error('Play audio must keep background recording and playback disabled.');
  }
}

export function isAllowedPath(relative) {
  const normalized = relative.replaceAll('\\', '/').replace(/^\.\//, '');
  if (normalized.split('/').some((segment) => forbiddenSegments.has(segment))) return false;
  if (/(^|\/)\.env([^/]*$|\/)|\.(?:keystore|jks|pem|p12|pfx|key|mobileprovision)$/i.test(normalized)) return false;
  if (/\.test\.(?:mjs|cjs|js|jsx|ts|tsx)$/i.test(normalized)) return false;
  if (allowedRootFiles.has(normalized) || allowedWorkspaceManifests.has(normalized) || allowedDevLeaves.has(normalized)) return true;
  if (!normalized.startsWith('app-play/')) return false;
  const inApp = normalized.slice('app-play/'.length);
  if (allowedAppPlayFiles.has(inApp)) return true;
  return [...allowedAppPlayTrees].some((tree) => inApp.startsWith(`${tree}/`));
}

export function resolveLocalImport(fromPath, specifier, exists = fs.existsSync) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromPath), specifier);
  const candidates = path.extname(base)
    ? [base]
    : [...sourceExtensions.map((extension) => `${base}${extension}`), ...sourceExtensions.map((extension) => path.join(base, `index${extension}`))];
  return candidates.find(exists) ?? null;
}

function collectFiles(root) {
  const output = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(root, full).replaceAll('\\', '/');
      if (entry.isSymbolicLink()) throw new Error(`Reparse/symlink path entered the Play stage: ${relative}`);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) output.push({ full, relative });
      else throw new Error(`Unsupported filesystem entry in Play stage: ${relative}`);
    }
  };
  visit(root);
  return output;
}

export function verifyStage(root) {
  root = path.resolve(root);
  if (!fs.statSync(root).isDirectory()) throw new Error('Play stage is not a directory.');
  const files = collectFiles(root);
  if (!files.length) throw new Error('Play stage is empty.');
  for (const { full, relative } of files) {
    if (!isAllowedPath(relative)) throw new Error(`Path is outside the Play build allowlist: ${relative}`);
    if (forbiddenArtifactMarker.test(relative)) throw new Error(`Forbidden extractor marker in staged path: ${relative}`);
    const content = fs.readFileSync(full);
    if (relative !== 'app-play/package.json' && !allowedWorkspaceManifests.has(relative) && forbiddenArtifactMarker.test(content.toString('utf8'))) throw new Error(`Forbidden extractor marker in staged file: ${relative}`);
  }

  for (const [relative, expectedName] of allowedWorkspaceManifests) {
    const manifestPath = path.join(root, relative);
    if (!fs.existsSync(manifestPath)) throw new Error(`Required Yarn workspace manifest is missing: ${relative}`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.name !== expectedName) throw new Error(`Unexpected Yarn workspace manifest name at ${relative}.`);
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies };
    if (Object.hasOwn(dependencies, 'soundboard-youtube')) throw new Error(`Forbidden native module dependency in workspace manifest: ${relative}`);
  }

  const appManifestPath = path.join(root, 'app-play', 'app.json');
  const appManifest = JSON.parse(fs.readFileSync(appManifestPath, 'utf8'));
  const appConfig = appManifest.expo ?? appManifest;
  if (appConfig.android?.package !== 'dev.sarunas.soundboard.play') throw new Error('Play Android package must be dev.sarunas.soundboard.play.');
  validateReleaseMetadata(appConfig);
  const iconReferences = [
    ['icon', appConfig.icon],
    ['android.adaptiveIcon.foregroundImage', appConfig.android?.adaptiveIcon?.foregroundImage],
    ['android.adaptiveIcon.monochromeImage', appConfig.android?.adaptiveIcon?.monochromeImage],
  ];
  for (const [label, reference] of iconReferences) {
    if (typeof reference !== 'string' || !reference.startsWith('./')) {
      throw new Error(`Play ${label} must reference a local staged asset.`);
    }
    const resolved = path.resolve(path.dirname(appManifestPath), reference);
    const relative = path.relative(root, resolved).replaceAll('\\', '/');
    if (!relative.startsWith('app-play/') || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error(`Play ${label} asset is missing from the stage: ${reference}`);
    }
  }
  validateRecordingPermissionPolicy(appConfig);
  if (appConfig.android?.allowBackup !== false) throw new Error('Play must disable Android backup.');
  if (appConfig.android?.usesCleartextTraffic !== false) throw new Error('Play must disable cleartext traffic.');

  const packagePath = path.join(root, 'app-play', 'package.json');
  const appPackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const dependencies = { ...appPackage.dependencies, ...appPackage.devDependencies, ...appPackage.optionalDependencies };
  if (Object.keys(dependencies).some((name) => name === 'soundboard-youtube')) throw new Error('Play app dependencies include the YouTube native module.');
  const autolinking = appPackage.expo?.autolinking;
  if (autolinking?.nativeModulesDir !== './play-native-modules') throw new Error('Play autolinking must use the isolated play-native-modules directory.');
  for (const platform of ['android', 'ios']) {
    if (!autolinking?.[platform]?.exclude?.includes('soundboard-youtube')) throw new Error(`Play ${platform} autolinking does not exclude soundboard-youtube.`);
  }
  const nativeModulesPath = path.join(root, 'app-play', 'play-native-modules');
  if (!fs.existsSync(nativeModulesPath) || fs.readdirSync(nativeModulesPath).length) throw new Error('Play nativeModulesDir must exist and contain no native modules.');
  const rootPackagePath = path.join(root, 'package.json');
  const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));
  if (!rootPackage.workspaces?.includes('app-play')) throw new Error('Root package does not declare app-play as a workspace.');

  const sourceFiles = files.filter(({ relative }) => /\.(?:[cm]?[jt]sx?)$/i.test(relative));
  for (const { full, relative } of sourceFiles) {
    const text = fs.readFileSync(full, 'utf8');
    const imports = [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
    for (const specifier of imports) {
      if (!specifier.startsWith('.')) continue;
      const resolved = resolveLocalImport(full, specifier);
      if (!resolved) throw new Error(`Unresolved relative import '${specifier}' from ${relative}`);
      const resolvedRelative = path.relative(root, resolved).replaceAll('\\', '/');
      if (!isAllowedPath(resolvedRelative)) throw new Error(`Import escapes Play allowlist: ${relative} -> ${resolvedRelative}`);
    }
  }
  return { files: files.length, sourceFiles: sourceFiles.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyStage(process.argv[2]);
    process.stdout.write(`Play stage verified: ${result.files} files, ${result.sourceFiles} source files.\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
