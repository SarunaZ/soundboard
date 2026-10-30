import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedDeviceAudioModuleFiles, isAllowedPath, forbiddenMarker, resolveLocalImport, validateRecordingPermissionPolicy, validateReleaseMetadata, verifyStage } from './verify-play-stage.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('the Play stage accepts only declared profile inputs and explicit shared leaves', () => {
  assert.equal(isAllowedPath('app-play/App.tsx'), true);
  assert.equal(isAllowedPath('app-play/src/media/localAudio.ts'), true);
  assert.equal(isAllowedPath('app-play/src/analytics/productAnalytics.ts'), true);
  assert.equal(isAllowedPath('app-play/src/onboarding/storage.ts'), true);
  assert.equal(isAllowedPath('app-play/src/onboarding/finalize.ts'), true);
  assert.equal(isAllowedPath('app-play/src/private.ts'), false);
  assert.equal(isAllowedPath('app-play/assets/stimyz/icon.png'), true);
  assert.equal(isAllowedPath('app-play/assets/stimyz/android-icon-foreground.png'), true);
  assert.equal(isAllowedPath('app-play/assets/stimyz/android-icon-monochrome.png'), true);
  assert.equal(isAllowedPath('app-play/assets/stimyz/stimmyz-logo-transparent.png'), true);
  assert.equal(isAllowedPath('app-play/assets/stimyz/extra.png'), false);
  assert.equal(isAllowedPath('app-client/src/audio/engine.ts'), true);
  assert.equal(isAllowedPath('app-client/src/transfer/folderTransfer.ts'), true);
  assert.equal(isAllowedPath('app-client/src/transfer/other.ts'), false);
  assert.equal(isAllowedPath('app-client/src/board/reorderGeometry.ts'), true);
  assert.equal(isAllowedPath('app-client/src/board/Board.tsx'), false);
  assert.equal(isAllowedPath('app-client/package.json'), true);
  assert.equal(isAllowedPath('service/package.json'), true);
  assert.equal(isAllowedPath('.yarn/patches/metro-npm-0.84.4-security.patch'), true);
  assert.equal(isAllowedPath('.yarn/patches/node-forge-npm-1.4.0-security.patch'), true);
  assert.equal(isAllowedPath('.yarn/patches/unreviewed.patch'), false);
  assert.equal(isAllowedPath('.yarn/cache/unreviewed.zip'), false);
  assert.equal(isAllowedPath('scripts/native-ffmpeg/build-android.sh'), true);
  assert.equal(isAllowedPath('scripts/native-ffmpeg/README.md'), true);
  assert.equal(isAllowedPath('scripts/native-ffmpeg/LICENSE'), true);
  assert.equal(isAllowedPath('scripts/native-tests/ffmpeg_decode_probe.c'), true);
  assert.equal(isAllowedPath('scripts/assert-play-gradle-security-versions.cjs'), true);
  assert.equal(isAllowedPath('scripts/native-ffmpeg/unreviewed.sh'), false);
  assert.equal(isAllowedPath('app-client/src/editor/EditorScreen.tsx'), false);
  assert.equal(isAllowedPath('app-client/modules/soundboard-youtube/index.js'), false);
  assert.equal(isAllowedPath('app-play/android/app/build.gradle'), false);
  assert.equal(isAllowedPath('app-play/play-native-modules/soundboard-device-audio/android/build.gradle'), true);
  assert.equal(isAllowedPath('app-play/play-native-modules/foreign/android/build.gradle'), false);
  assert.equal(isAllowedPath('app-play/play-native-modules/soundboard-device-audio/android/src/main/AndroidManifest.xml'), false);
  assert.equal(isAllowedPath('app-play/.env.local'), false);
  for (const relative of [
    'app-play/play-native-modules/soundboard-device-audio/android/src/main/cpp/CMakeLists.txt',
    'app-play/play-native-modules/soundboard-device-audio/android/src/main/cpp/playback_dsp.h',
    'app-play/play-native-modules/soundboard-device-audio/android/src/main/cpp/playback_dsp.cpp',
    'app-play/play-native-modules/soundboard-device-audio/android/src/main/cpp/playback_dsp_jni.cpp',
    'app-play/play-native-modules/soundboard-device-audio/android/src/main/java/dev/sarunas/soundboard/deviceaudio/PlaybackPreparation.kt',
    'app-play/play-native-modules/soundboard-device-audio/android/src/main/java/dev/sarunas/soundboard/deviceaudio/NativePlaybackDsp.kt',
    'app-play/play-native-modules/soundboard-device-audio/android/src/test/java/dev/sarunas/soundboard/deviceaudio/PlaybackPreparationTest.kt',
  ]) assert.ok(allowedDeviceAudioModuleFiles.has(relative), `missing Play native allowlist entry: ${relative}`);
});

test('extractor and YouTube source markers are rejected case-insensitively', () => {
  for (const text of ['soundboard-youtube', 'yt-dlp', 'YoutubeExtractor', 'youtube.com/watch']) {
    assert.equal(forbiddenMarker.test(text), true, text);
  }
  assert.equal(forbiddenMarker.test('expo-audio'), false);
});

test('relative imports resolve from the staged file location', () => {
  const stageRoot = path.resolve(process.cwd(), 'temporary-stage');
  const board = path.join(stageRoot, 'app-play/src/ui/Board.tsx');
  const library = path.join(stageRoot, 'app-play/src/data/library.ts');
  const existing = new Set([board, library]);
  assert.equal(
    resolveLocalImport(board, '../data/library', (candidate) => existing.has(candidate)),
    library,
  );
  assert.equal(resolveLocalImport(board, '../unknown', () => false), null);
});

test('release metadata accepts the 1.0.5 Play update', () => {
  assert.doesNotThrow(() => validateReleaseMetadata({ version: '1.0.5', android: { versionCode: 6 } }));
});

test('release metadata rejects unsafe versions and non-positive or fractional codes', () => {
  for (const version of ['', 'v1.0.1', '1.0', '01.0.1', '1.0.1/evil', '1.0.1\n']) {
    assert.throws(() => validateReleaseMetadata({ version, android: { versionCode: 2 } }), /semantic version/);
  }
  for (const versionCode of [0, -1, 1.5, 2_100_000_001, Number.MAX_SAFE_INTEGER + 1, '2', null]) {
    assert.throws(() => validateReleaseMetadata({ version: '1.0.1', android: { versionCode } }), /positive integer/);
  }
});

test('Play recording policy requires foreground mic permission and keeps capture out of static app.json', () => {
  const config = {
    android: { blockedPermissions: ['android.permission.READ_MEDIA_AUDIO'], minSdkVersion: 24, targetSdkVersion: 36, compileSdkVersion: 36 },
    plugins: [['expo-audio', {
      microphonePermission: 'Stimmyz uses microphone access to record sounds you choose to save.',
      recordAudioAndroid: true,
      enableBackgroundRecording: false,
      enableBackgroundPlayback: false,
    }], ['react-native-audio-api', { androidPermissions: [], androidForegroundService: false, iosBackgroundMode: false }]],
  };
  assert.doesNotThrow(() => validateRecordingPermissionPolicy(config));
  assert.throws(() => validateRecordingPermissionPolicy({ ...config, android: { blockedPermissions: ['android.permission.RECORD_AUDIO'] } }), /allow RECORD_AUDIO/);
  const replaceAudio = (options) => ({ ...config, plugins: [['expo-audio', options], config.plugins[1]] });
  assert.throws(() => validateRecordingPermissionPolicy(replaceAudio({ ...config.plugins[0][1], recordAudioAndroid: false })), /enable Android recording/);
  assert.throws(() => validateRecordingPermissionPolicy(replaceAudio({ ...config.plugins[0][1], microphonePermission: false })), /iOS microphone/);
  assert.throws(() => validateRecordingPermissionPolicy(replaceAudio({ ...config.plugins[0][1], enableBackgroundRecording: true })), /background recording/);
  assert.throws(() => validateRecordingPermissionPolicy({ ...config, android: { blockedPermissions: ['android.permission.POST_NOTIFICATIONS'] } }), /allow notifications/);
  assert.throws(() => validateRecordingPermissionPolicy({ ...config, plugins: [] }), /expo-audio/);
  assert.throws(() => validateRecordingPermissionPolicy({ ...config, plugins: [config.plugins[0], ['react-native-audio-api', { ...config.plugins[1][1], androidForegroundService: true }]] }), /disable its optional background services/);
});

test('stage verifier accepts the isolated Play profile and rejects extractor source', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soundboard-play-stage-'));
  const reviewedPatches = new Map([
    ['.yarn/patches/metro-npm-0.84.4-security.patch', '.yarn/patches/metro-npm-0.84.4-security.patch'],
    ['.yarn/patches/node-forge-npm-1.4.0-security.patch', '.yarn/patches/node-forge-npm-1.4.0-security.patch'],
  ]);
  const write = (relative, value) => {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, value);
  };
  try {
    write('package.json', JSON.stringify({ workspaces: ['app-play'] }));
    for (const [relative, source] of reviewedPatches) {
      write(relative, fs.readFileSync(path.resolve(__dirname, '..', source)));
    }
    for (const [relative, name] of [
      ['shared/package.json', '@soundboard/shared'],
      ['service/package.json', '@soundboard/service'],
      ['worker/package.json', '@soundboard/media-worker'],
      ['app-client/package.json', 'app-client'],
    ]) write(relative, JSON.stringify({ name, scripts: relative === 'app-client/package.json' ? { test: 'onDeviceYoutube.test.mjs' } : {} }));
    write('app-play/app.json', JSON.stringify({ expo: {
      version: '1.0.5',
      icon: './assets/stimyz/icon.png',
      android: {
        package: 'dev.sarunas.soundboard.play', versionCode: 6, allowBackup: false, usesCleartextTraffic: false,
        minSdkVersion: 24, targetSdkVersion: 36, compileSdkVersion: 36,
        adaptiveIcon: {
          foregroundImage: './assets/stimyz/android-icon-foreground.png',
          monochromeImage: './assets/stimyz/android-icon-monochrome.png',
        },
      },
      plugins: [['expo-audio', { microphonePermission: 'Record local sounds.', recordAudioAndroid: true, enableBackgroundRecording: false, enableBackgroundPlayback: false }], ['react-native-audio-api', { androidPermissions: [], androidForegroundService: false, iosBackgroundMode: false }]],
    } }));
    write('app-play/app.config.js', "const enabled = process.env.EXPO_PUBLIC_DEVICE_AUDIO_CAPTURE_ENABLED !== 'false';\nmodule.exports = ({ config }) => ({ ...config, plugins: [...(config.plugins ?? []), ...(enabled ? ['./plugins/withDeviceAudioCapture'] : [])] });\n");
    write('app-play/package.json', JSON.stringify({
      dependencies: { expo: '~57.0.13' },
      expo: { autolinking: {
        nativeModulesDir: './play-native-modules',
        android: { exclude: ['soundboard-youtube'] },
        ios: { exclude: ['soundboard-youtube'] },
      } },
    }));
    write('app-play/index.ts', "import './App';\n");
    write('app-play/App.tsx', 'export default function App() {}\n');
    write('app-play/assets/stimyz/icon.png', 'test-icon');
    write('app-play/assets/stimyz/android-icon-foreground.png', 'test-foreground');
    write('app-play/assets/stimyz/android-icon-monochrome.png', 'test-monochrome');
    write('app-play/assets/stimyz/stimmyz-logo-transparent.png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    write('app-play/src/ui/BrandHeader.tsx', "const logo = require('../../assets/stimyz/stimmyz-logo-transparent.png');\n");
    write('app-play/src/analytics/schema.ts', 'export const eventSchema = true;\n');
    write('app-play/src/analytics/productAnalytics.ts', "import { eventSchema } from './schema';\nexport const configured = eventSchema;\n");
    write('app-play/src/onboarding/storage.ts', 'export const completionVersion = 1;\n');
    write('app-play/plugins/withDeviceAudioCapture.js', 'module.exports = () => {};\n');
    for (const relative of allowedDeviceAudioModuleFiles) {
      write(relative, relative.endsWith('.json') ? '{}' : '// device audio module test fixture\n');
    }
    assert.deepEqual(verifyStage(root), { files: 38, sourceFiles: 10 });

    write('.yarn/patches/metro-npm-0.84.4-security.patch', 'changed patch');
    assert.throws(() => verifyStage(root), /Reviewed Yarn patch hash changed/);
    write('.yarn/patches/metro-npm-0.84.4-security.patch', fs.readFileSync(path.resolve(__dirname, '..', '.yarn/patches/metro-npm-0.84.4-security.patch')));

    fs.rmSync(path.join(root, 'app-play/assets/stimyz/icon.png'));
    assert.throws(() => verifyStage(root), /Play icon asset is missing from the stage/);
    write('app-play/assets/stimyz/icon.png', 'test-icon');
    fs.rmSync(path.join(root, 'app-play/assets/stimyz/stimmyz-logo-transparent.png'));
    assert.throws(() => verifyStage(root), /Play transparent Stimmyz logo asset is missing from the stage/);
    write('app-play/assets/stimyz/stimmyz-logo-transparent.png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    write('app-play/app.json', JSON.stringify({ expo: {
      version: '1.0.1',
      android: { package: 'dev.sarunas.soundboard', versionCode: 3, allowBackup: false, usesCleartextTraffic: false },
    } }));
    assert.throws(() => verifyStage(root), /Play Android package/);
    write('app-play/app.json', JSON.stringify({ expo: {
      version: '1.0.1',
      android: { package: 'dev.sarunas.soundboard.play', versionCode: 3, allowBackup: false, usesCleartextTraffic: false },
    } }));

    write('app-play/src/ui/Bad.tsx', 'const source = "yt-dlp";\n');
    assert.throws(() => verifyStage(root), /Forbidden extractor marker in staged file/);
    fs.rmSync(path.join(root, 'app-play/src'), { recursive: true, force: true });
    write('app-client/modules/soundboard-youtube/index.js', 'module.exports = {};\n');
    assert.throws(() => verifyStage(root), /outside the Play build allowlist/);
    fs.rmSync(path.join(root, 'app-client'), { recursive: true, force: true });
    write('app-play/play-native-modules/soundboard-device-audio/android/src/main/AndroidManifest.xml', '<manifest />');
    assert.throws(() => verifyStage(root), /outside the Play build allowlist/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Play analytics build configuration is opt-in, validates public tokens and keeps them out of stage metadata', (t) => {
  const powershell = process.platform === 'win32' ? 'pwsh.exe' : 'pwsh';
  const probe = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' });
  if (probe.error?.code === 'ENOENT') { t.skip('PowerShell is unavailable for the build-script integration check.'); return; }
  assert.equal(probe.status, 0, probe.stderr);
  const repo = path.resolve(__dirname, '..');
  const stage = path.join(repo, 'data', `play-analytics-config-test-${process.pid}`);
  const dockerTestRoot = path.join(repo, 'data', `play-analytics-docker-argv-test-${process.pid}`);
  const fakeDockerBin = path.join(dockerTestRoot, 'bin');
  const fakeDockerLog = path.join(dockerTestRoot, 'docker-argv.jsonl');
  const dockerBuildStages = [path.join(dockerTestRoot, 'diagnostics-stage'), path.join(dockerTestRoot, 'ordinary-stage')];
  const invoke = (...args) => spawnSync(powershell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(repo, 'scripts', 'build-play-android.ps1'), '-StageOnly', '-StagePath', stage, ...args,
  ], { cwd: repo, encoding: 'utf8' });
  try {
    const disabled = invoke();
    assert.equal(disabled.status, 0, `${disabled.stdout}\n${disabled.stderr}`);
    const inventoryPath = path.join(stage, 'play-stage-inventory.json');
    const disabledInventory = fs.readFileSync(inventoryPath, 'utf8');
    assert.equal(JSON.parse(disabledInventory).analyticsEnabled, false);
    assert.equal(JSON.parse(disabledInventory).analyticsHost, 'https://eu.i.posthog.com');
    assert.equal(Object.hasOwn(JSON.parse(disabledInventory), 'productAnalyticsDiagnosticsEnabled'), false);
    fs.rmSync(stage, { recursive: true, force: true });

    const enabled = invoke('-EnableProductAnalytics', '-PostHogProjectToken', 'phc_public_test_project_token_123456');
    assert.equal(enabled.status, 0, `${enabled.stdout}\n${enabled.stderr}`);
    const enabledInventory = fs.readFileSync(path.join(stage, 'play-stage-inventory.json'), 'utf8');
    assert.equal(JSON.parse(enabledInventory).analyticsEnabled, true);
    assert.equal(JSON.parse(enabledInventory).productAnalyticsDiagnosticsEnabled, false);
    assert.equal(enabledInventory.includes('phc_public_test_project_token_123456'), false);
    fs.rmSync(stage, { recursive: true, force: true });

    const diagnosticEnabled = invoke('-EnableProductAnalytics', '-AnalyticsDiagnostics', '-PostHogProjectToken', 'phc_public_test_project_token_123456');
    assert.equal(diagnosticEnabled.status, 0, `${diagnosticEnabled.stdout}\n${diagnosticEnabled.stderr}`);
    const diagnosticInventory = fs.readFileSync(path.join(stage, 'play-stage-inventory.json'), 'utf8');
    assert.equal(JSON.parse(diagnosticInventory).productAnalyticsDiagnosticsEnabled, true);
    assert.equal(diagnosticInventory.includes('phc_public_test_project_token_123456'), false);
    fs.rmSync(stage, { recursive: true, force: true });

    const diagnosticsWithoutAnalytics = invoke('-AnalyticsDiagnostics');
    assert.notEqual(diagnosticsWithoutAnalytics.status, 0);
    assert.match(diagnosticsWithoutAnalytics.stderr, /only together with -EnableProductAnalytics/);
    assert.equal(fs.existsSync(stage), false);

    const invalid = invoke('-EnableProductAnalytics', '-PostHogProjectToken', 'not-a-project-token');
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /requires a valid public PostHog project token/);
    assert.equal(fs.existsSync(stage), false);

    fs.mkdirSync(fakeDockerBin, { recursive: true });
    fs.writeFileSync(path.join(fakeDockerBin, 'docker.ps1'), [
      '$record = ConvertTo-Json -InputObject @($args) -Compress',
      '[System.IO.File]::AppendAllText($env:DOCKER_ARGV_LOG, $record + [Environment]::NewLine)',
      'Write-Output "sha256:fake-build-image"',
      '$global:LASTEXITCODE = 0',
      '',
    ].join('\n'));
    const runFakeDockerBuild = (buildStage, extraArgs) => spawnSync(powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(repo, 'scripts', 'build-play-android.ps1'), '-StagePath', buildStage,
      '-EnableProductAnalytics', '-PostHogProjectToken', 'phc_public_test_project_token_123456', ...extraArgs,
    ], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${fakeDockerBin}${path.delimiter}${process.env.PATH}`, DOCKER_ARGV_LOG: fakeDockerLog },
    });
    const diagnosticBuild = runFakeDockerBuild(dockerBuildStages[0], ['-AnalyticsDiagnostics']);
    assert.equal(diagnosticBuild.status, 0, `${diagnosticBuild.stdout}\n${diagnosticBuild.stderr}`);
    const ordinaryBuild = runFakeDockerBuild(dockerBuildStages[1], []);
    assert.equal(ordinaryBuild.status, 0, `${ordinaryBuild.stdout}\n${ordinaryBuild.stderr}`);
    const dockerCalls = fs.readFileSync(fakeDockerLog, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const runCalls = dockerCalls.filter((args) => args[0] === 'run');
    assert.equal(runCalls.length, 2);
    const diagnosticArgs = runCalls[0];
    const diagnosticEnvIndex = diagnosticArgs.indexOf('EXPO_PUBLIC_PRODUCT_ANALYTICS_DIAGNOSTICS=true');
    const imageIndex = diagnosticArgs.indexOf('soundboard-android:local');
    assert.notEqual(diagnosticEnvIndex, -1);
    assert.ok(diagnosticEnvIndex < imageIndex, 'diagnostics env must be a Docker option before the image name');
    assert.equal(diagnosticArgs[imageIndex + 1], 'bash');
    assert.equal(runCalls[1].includes('EXPO_PUBLIC_PRODUCT_ANALYTICS_DIAGNOSTICS=true'), false);
    assert.equal(dockerCalls.some((args) => args.includes('phc_public_test_project_token_123456')), false, 'the project token must be forwarded through the process environment, not Docker argv');
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
    const dataRoot = path.resolve(repo, 'data') + path.sep;
    for (const target of [dockerTestRoot, ...dockerBuildStages]) {
      const fullTarget = path.resolve(target);
      if (!fullTarget.startsWith(dataRoot)) throw new Error(`Refusing cleanup outside data/: ${fullTarget}`);
      fs.rmSync(fullTarget, { recursive: true, force: true });
    }
  }
});
