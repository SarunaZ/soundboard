import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { allowedDeviceAudioModuleFiles, isAllowedPath, forbiddenMarker, resolveLocalImport, validateRecordingPermissionPolicy, validateReleaseMetadata, verifyStage } from './verify-play-stage.mjs';

test('the Play stage accepts only declared profile inputs and explicit shared leaves', () => {
  assert.equal(isAllowedPath('app-play/App.tsx'), true);
  assert.equal(isAllowedPath('app-play/src/media/localAudio.ts'), true);
  assert.equal(isAllowedPath('app-play/assets/stimyz/icon.png'), true);
  assert.equal(isAllowedPath('app-play/assets/stimyz/android-icon-foreground.png'), true);
  assert.equal(isAllowedPath('app-play/assets/stimyz/android-icon-monochrome.png'), true);
  assert.equal(isAllowedPath('app-play/assets/stimyz/extra.png'), false);
  assert.equal(isAllowedPath('app-client/src/audio/engine.ts'), true);
  assert.equal(isAllowedPath('app-client/src/transfer/folderTransfer.ts'), true);
  assert.equal(isAllowedPath('app-client/src/transfer/other.ts'), false);
  assert.equal(isAllowedPath('app-client/src/board/reorderGeometry.ts'), true);
  assert.equal(isAllowedPath('app-client/src/board/Board.tsx'), false);
  assert.equal(isAllowedPath('app-client/package.json'), true);
  assert.equal(isAllowedPath('service/package.json'), true);
  assert.equal(isAllowedPath('app-client/src/editor/EditorScreen.tsx'), false);
  assert.equal(isAllowedPath('app-client/modules/soundboard-youtube/index.js'), false);
  assert.equal(isAllowedPath('app-play/android/app/build.gradle'), false);
  assert.equal(isAllowedPath('app-play/play-native-modules/soundboard-device-audio/android/build.gradle'), true);
  assert.equal(isAllowedPath('app-play/play-native-modules/foreign/android/build.gradle'), false);
  assert.equal(isAllowedPath('app-play/play-native-modules/soundboard-device-audio/android/src/main/AndroidManifest.xml'), false);
  assert.equal(isAllowedPath('app-play/.env.local'), false);
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

test('Play recording policy requires foreground recording permission and the iOS usage message', () => {
  const config = {
    android: { blockedPermissions: ['android.permission.READ_MEDIA_AUDIO'] },
    plugins: ['./plugins/withDeviceAudioCapture', ['expo-audio', {
      microphonePermission: 'Stimmyz uses microphone access to record sounds you choose to save.',
      recordAudioAndroid: true,
      enableBackgroundRecording: false,
      enableBackgroundPlayback: false,
    }]],
  };
  assert.doesNotThrow(() => validateRecordingPermissionPolicy(config));
  assert.throws(() => validateRecordingPermissionPolicy({ ...config, android: { blockedPermissions: ['android.permission.RECORD_AUDIO'] } }), /allow RECORD_AUDIO/);
  const replaceAudio = (options) => ({ ...config, plugins: [config.plugins[0], ['expo-audio', options]] });
  assert.throws(() => validateRecordingPermissionPolicy(replaceAudio({ ...config.plugins[1][1], recordAudioAndroid: false })), /enable Android recording/);
  assert.throws(() => validateRecordingPermissionPolicy(replaceAudio({ ...config.plugins[1][1], microphonePermission: false })), /iOS microphone/);
  assert.throws(() => validateRecordingPermissionPolicy(replaceAudio({ ...config.plugins[1][1], enableBackgroundRecording: true })), /background recording/);
  assert.throws(() => validateRecordingPermissionPolicy({ ...config, android: { blockedPermissions: ['android.permission.POST_NOTIFICATIONS'] } }), /allow notifications/);
  assert.throws(() => validateRecordingPermissionPolicy({ ...config, plugins: [['expo-audio', config.plugins[1][1]]] }), /config plugin/);
});

test('stage verifier accepts the isolated Play profile and rejects extractor source', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soundboard-play-stage-'));
  const write = (relative, value) => {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, value);
  };
  try {
    write('package.json', JSON.stringify({ workspaces: ['app-play'] }));
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
        adaptiveIcon: {
          foregroundImage: './assets/stimyz/android-icon-foreground.png',
          monochromeImage: './assets/stimyz/android-icon-monochrome.png',
        },
      },
      plugins: ['./plugins/withDeviceAudioCapture', ['expo-audio', { microphonePermission: 'Record local sounds.', recordAudioAndroid: true, enableBackgroundRecording: false, enableBackgroundPlayback: false }]],
    } }));
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
    write('app-play/plugins/withDeviceAudioCapture.js', 'module.exports = () => {};\n');
    for (const relative of allowedDeviceAudioModuleFiles) {
      write(relative, relative.endsWith('.json') ? '{}' : '// device audio module test fixture\n');
    }
    assert.deepEqual(verifyStage(root), { files: 23, sourceFiles: 5 });

    fs.rmSync(path.join(root, 'app-play/assets/stimyz/icon.png'));
    assert.throws(() => verifyStage(root), /Play icon asset is missing from the stage/);
    write('app-play/assets/stimyz/icon.png', 'test-icon');

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
