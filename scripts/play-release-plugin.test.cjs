const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function loadWithPlayRelease() {
  const pluginPath = path.resolve(__dirname, '../app-play/plugins/withPlayRelease.js');
  delete require.cache[pluginPath];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'expo/config-plugins') {
      return {
        withAndroidManifest(config, action) {
          config.mods ??= {};
          config.mods.android ??= {};
          config.mods.android.manifestAction = action;
          return config;
        },
        withAppBuildGradle(config, action) {
          config.mods ??= {};
          config.mods.android ??= {};
          config.mods.android.gradleAction = action;
          return config;
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(pluginPath);
  } finally {
    Module._load = originalLoad;
  }
}

test('Play manifest plugin disables backup and cleartext and preserves other tools:replace entries', () => {
  const plugin = loadWithPlayRelease();
  const config = plugin({ name: 'Play' });
  const mod = { modResults: { manifest: {
    $: {},
    application: [{ $: { 'tools:replace': 'android:label' } }],
  } } };
  const result = config.mods.android.manifestAction(mod);
  const attrs = result.modResults.manifest.application[0].$;
  assert.equal(attrs['android:allowBackup'], 'false');
  assert.equal(attrs['android:usesCleartextTraffic'], 'false');
  assert.equal(result.modResults.manifest.$['xmlns:tools'], 'http://schemas.android.com/tools');
  assert.deepEqual(new Set(attrs['tools:replace'].split(',')), new Set([
    'android:label', 'android:allowBackup', 'android:usesCleartextTraffic',
  ]));
});

test('Play release plugin removes only the release debug-signing fallback and fails closed on drift', () => {
  const plugin = loadWithPlayRelease();
  const config = plugin({ name: 'Play' });
  const marker = 'signingConfig signingConfigs.debug';
  const contents = [
    'debug {', `  ${marker}`, '}',
    'release {', `  ${marker}`, '}',
  ].join('\n');
  const result = config.mods.android.gradleAction({ modResults: { contents } });
  assert.equal(result.modResults.contents.split(marker).length - 1, 1);
  assert.match(result.modResults.contents, /release \{\n  signingConfig null\n\}/);
  assert.throws(() => config.mods.android.gradleAction({ modResults: { contents: 'release {}' } }), /refusing a Play release build/);
});

function loadDeviceAudioPlugin() {
  const pluginPath = path.resolve(__dirname, '../app-play/plugins/withDeviceAudioCapture.js');
  delete require.cache[pluginPath];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'expo/config-plugins') {
      return {
        withAndroidManifest(config, action) {
          config.mods ??= {};
          config.mods.android ??= {};
          config.mods.android.manifestAction = action;
          return config;
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(pluginPath);
  } finally {
    Module._load = originalLoad;
  }
}

test('Play device-audio plugin requires visible capture permissions and private projection components', () => {
  const plugin = loadDeviceAudioPlugin();
  const manifest = {
    'uses-permission': [],
    application: [{
      service: [{ $: { 'android:name': plugin.SERVICE, 'android:exported': 'true', 'android:foregroundServiceType': 'microphone' } }],
      activity: [{ $: { 'android:name': plugin.CONSENT_ACTIVITY, 'android:exported': 'true' } }],
    }],
  };
  plugin.configureDeviceAudioManifest(manifest);
  plugin.configureDeviceAudioManifest(manifest);
  const permissions = manifest['uses-permission'].map((entry) => entry.$['android:name']);
  assert.equal(new Set(permissions).size, permissions.length);
  for (const permission of plugin.REQUIRED_PERMISSIONS) assert.ok(permissions.includes(permission));
  const application = manifest.application[0];
  assert.equal(application.service.length, 1);
  assert.equal(application.service[0].$['android:exported'], 'false');
  assert.equal(application.service[0].$['android:foregroundServiceType'], 'mediaProjection');
  assert.equal(application.activity.length, 1);
  assert.equal(application.activity[0].$['android:exported'], 'false');
  assert.equal(application.service[0].$['android:foregroundServiceType'].includes('microphone'), false);
});

test('Play device-audio plugin unblocks notifications while keeping overlay blocked', () => {
  const plugin = loadDeviceAudioPlugin();
  const config = plugin({ android: { blockedPermissions: [
    'android.permission.POST_NOTIFICATIONS', 'android.permission.SYSTEM_ALERT_WINDOW',
  ] } });
  assert.deepEqual(config.android.blockedPermissions, ['android.permission.SYSTEM_ALERT_WINDOW']);
  assert.ok(config.mods.android.manifestAction);
});
