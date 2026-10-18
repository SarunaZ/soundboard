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
