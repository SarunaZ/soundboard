import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const forbiddenMarker = /soundboard-youtube|yt-dlp|youtube-dl|YoutubeExtractor|NativeYoutube|onDeviceYoutube|youtubeUrl|youtube\.com|youtu\.be/i;
const forbiddenArtifactMarker = /soundboard-youtube|yt-dlp|youtube-dl|YoutubeExtractor|NativeYoutube|onDeviceYoutube|youtubeUrl|youtube\.com|youtu\.be|com[./]yausername|libpython|quickjs|youtubedl/i;
const forbiddenSegments = new Set(['.git', '.expo', 'node_modules', 'android', 'ios', 'build', 'dist', '.yarn']);
const allowedAppPlayFiles = new Set([
  'index.ts', 'App.tsx', 'app.json', 'app.config.js', 'package.json', 'tsconfig.json', '.gitignore', 'README.md',
  'assets/stimyz/icon.png',
  'assets/stimyz/android-icon-foreground.png',
  'assets/stimyz/android-icon-monochrome.png',
  'assets/stimyz/stimmyz-logo-transparent.png',
]);
const allowedAppPlayTrees = new Set(['src/ui', 'src/types', 'src/data', 'src/media', 'plugins', 'modules-empty']);
const allowedDevLeaves = new Set([
  'app-client/src/audio/engine.ts',
  'app-client/src/audio/playbackState.ts',
  'app-client/src/editor/catalog.ts',
  'app-client/src/editor/importValidation.ts',
  'app-client/src/transfer/folderTransfer.ts',
  'app-client/src/editor/localAudioPcm.ts',
  'app-client/src/limits.ts',
  'app-client/src/keyboard/keyboardGeometry.ts',
  'app-client/src/keyboard/useKeyboardInputReveal.ts',
  'app-client/src/board/reorderGeometry.ts',
  'app-client/src/types/react-native-audio-api.d.ts',
]);
const allowedRootFiles = new Set([
  'package.json', '.yarnrc.yml', 'yarn.lock', 'scripts/check-elf-page-alignment.py',
  'scripts/assert-play-gradle-security-versions.cjs', 'play-stage-inventory.json',
  '.yarn/patches/metro-npm-0.84.4-security.patch',
  '.yarn/patches/node-forge-npm-1.4.0-security.patch',
  'scripts/native-ffmpeg/build-android.sh',
  'scripts/native-ffmpeg/README.md',
  'scripts/native-ffmpeg/LICENSE',
  'scripts/native-tests/ffmpeg_decode_probe.c',
]);
const reviewedYarnPatches = new Map([
  ['.yarn/patches/metro-npm-0.84.4-security.patch', '37d98e433105f341e41c06972389b8f551e65ed7c85e9dee770c22493eb131f0'],
  ['.yarn/patches/node-forge-npm-1.4.0-security.patch', '61370a7c0f2ee74e29b3b60ee14a1645270f914b584f1f1c59d3e693cf736280'],
]);
export const allowedDeviceAudioModuleFiles = new Set([
  'app-play/play-native-modules/soundboard-device-audio/package.json',
  'app-play/play-native-modules/soundboard-device-audio/index.js',
  'app-play/play-native-modules/soundboard-device-audio/index.d.ts',
  'app-play/play-native-modules/soundboard-device-audio/expo-module.config.json',
  'app-play/play-native-modules/soundboard-device-audio/android/build.gradle',
  'app-play/play-native-modules/soundboard-device-audio/android/src/main/cpp/CMakeLists.txt',
  'app-play/play-native-modules/soundboard-device-audio/android/src/main/cpp/playback_dsp.h',
  'app-play/play-native-modules/soundboard-device-audio/android/src/main/cpp/playback_dsp.cpp',
  'app-play/play-native-modules/soundboard-device-audio/android/src/main/cpp/playback_dsp_jni.cpp',
  'app-play/play-native-modules/soundboard-device-audio/android/src/main/java/dev/sarunas/soundboard/deviceaudio/CaptureStatus.kt',
  'app-play/play-native-modules/soundboard-device-audio/android/src/main/java/dev/sarunas/soundboard/deviceaudio/PcmWavWriter.kt',
  'app-play/play-native-modules/soundboard-device-audio/android/src/main/java/dev/sarunas/soundboard/deviceaudio/PlaybackPreparation.kt',
  'app-play/play-native-modules/soundboard-device-audio/android/src/main/java/dev/sarunas/soundboard/deviceaudio/NativePlaybackDsp.kt',
  'app-play/play-native-modules/soundboard-device-audio/android/src/test/java/dev/sarunas/soundboard/deviceaudio/PlaybackPreparationTest.kt',
  'app-play/play-native-modules/soundboard-device-audio/android/src/main/java/dev/sarunas/soundboard/deviceaudio/DeviceAudioCaptureService.kt',
  'app-play/play-native-modules/soundboard-device-audio/android/src/main/java/dev/sarunas/soundboard/deviceaudio/DeviceAudioConsentActivity.kt',
  'app-play/play-native-modules/soundboard-device-audio/android/src/main/java/dev/sarunas/soundboard/deviceaudio/SoundboardDeviceAudioModule.kt',
]);
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
  const audioApiPlugin = (appConfig.plugins ?? []).find((plugin) => Array.isArray(plugin) ? plugin[0] === 'react-native-audio-api' : plugin === 'react-native-audio-api');
  const audioApiOptions = Array.isArray(audioApiPlugin) ? audioApiPlugin[1] : null;
  if (audioApiOptions?.androidForegroundService !== false || !Array.isArray(audioApiOptions.androidPermissions) || audioApiOptions.androidPermissions.length !== 0 || audioApiOptions.iosBackgroundMode !== false) {
    throw new Error('Play audio API must disable its optional background services, permissions and iOS background mode.');
  }
  if (blocked.includes('android.permission.POST_NOTIFICATIONS')) throw new Error('Play must allow notifications for device-audio recording Stop controls.');
  if ((appConfig.plugins ?? []).includes('./plugins/withDeviceAudioCapture')) throw new Error('Device-audio capture must be configured dynamically, not in the static app.json configuration.');
  if (appConfig.android?.minSdkVersion !== 24) throw new Error('Play Android minSdkVersion must remain 24 for the native playback core.');
  if (appConfig.android?.targetSdkVersion !== 36 || appConfig.android?.compileSdkVersion !== 36) throw new Error('Play Android target and compile SDK versions must be 36.');
}

export function isAllowedPath(relative) {
  const normalized = relative.replaceAll('\\', '/').replace(/^\.\//, '');
  if (allowedDeviceAudioModuleFiles.has(normalized)) return true;
  if (allowedRootFiles.has(normalized)) return true;
  if (normalized.split('/').some((segment) => forbiddenSegments.has(segment))) return false;
  if (/(^|\/)\.env([^/]*$|\/)|\.(?:keystore|jks|pem|p12|pfx|key|mobileprovision)$/i.test(normalized)) return false;
  if (/\.test\.(?:mjs|cjs|js|jsx|ts|tsx)$/i.test(normalized)) return false;
  if (allowedWorkspaceManifests.has(normalized) || allowedDevLeaves.has(normalized)) return true;
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
  for (const [relative, expectedHash] of reviewedYarnPatches) {
    const stagedPatch = files.find((entry) => entry.relative === relative);
    if (!stagedPatch) throw new Error(`Reviewed Yarn patch is missing from the Play stage: ${relative}`);
    const actualHash = createHash('sha256').update(fs.readFileSync(stagedPatch.full)).digest('hex');
    if (actualHash !== expectedHash) throw new Error(`Reviewed Yarn patch hash changed in the Play stage: ${relative}`);
  }
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
  const logoPath = path.join(root, 'app-play/assets/stimyz/stimmyz-logo-transparent.png');
  if (!fs.existsSync(logoPath) || !fs.statSync(logoPath).isFile()) throw new Error('Play transparent Stimmyz logo asset is missing from the stage.');
  const logoSignature = fs.readFileSync(logoPath).subarray(0, 8);
  if (!logoSignature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Play transparent Stimmyz logo asset must be a PNG.');
  validateRecordingPermissionPolicy(appConfig);
  const dynamicConfigPath = path.join(root, 'app-play/app.config.js');
  if (!fs.existsSync(dynamicConfigPath)) throw new Error('Play dynamic app config is missing from the stage.');
  const dynamicConfig = fs.readFileSync(dynamicConfigPath, 'utf8');
  if (!/EXPO_PUBLIC_DEVICE_AUDIO_CAPTURE_ENABLED\s*!==\s*['"]false['"]/.test(dynamicConfig)) throw new Error('Play capture plugin must be enabled by default and support an explicit false diagnostic override.');
  if (!dynamicConfig.includes('./plugins/withDeviceAudioCapture')) throw new Error('Play device-audio config plugin is missing from the dynamic configuration.');
  if (!fs.existsSync(path.join(root, 'app-play/plugins/withDeviceAudioCapture.js'))) throw new Error('Play device-audio config plugin is missing from the stage.');
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
  const nativeModuleFiles = collectFiles(nativeModulesPath).map(({ relative }) => `app-play/play-native-modules/${relative}`);
  if (nativeModuleFiles.length !== allowedDeviceAudioModuleFiles.size || nativeModuleFiles.some((relative) => !allowedDeviceAudioModuleFiles.has(relative))) {
    throw new Error('Play nativeModulesDir must contain only the exact device-audio module file allowlist.');
  }
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
