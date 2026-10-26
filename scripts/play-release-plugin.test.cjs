const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

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
        withDangerousMod(config, [platform, action]) {
          config.mods ??= {};
          config.mods[platform] ??= {};
          config.mods[platform].dangerousAction = action;
          return config;
        },
        withGradleProperties(config, action) {
          config.mods ??= {};
          config.mods.android ??= {};
          config.mods.android.propertiesAction = action;
          return config;
        },
        withProjectBuildGradle(config, action) {
          config.mods ??= {};
          config.mods.android ??= {};
          config.mods.android.projectGradleAction = action;
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
    application: [{
      $: { 'tools:replace': 'android:label' },
      activity: [
        { $: { 'android:name': '.InternalActivity' } },
        { $: { 'android:name': '.MainActivity', 'android:exported': 'true' }, 'intent-filter': [{}] },
      ],
    }],
  } } };
  const result = config.mods.android.manifestAction(mod);
  const application = result.modResults.manifest.application[0];
  const attrs = application.$;
  assert.equal(application.activity[0].$['android:exported'], 'false');
  assert.equal(application.activity[1].$['android:exported'], 'true');
  assert.equal(attrs['android:allowBackup'], 'false');
  assert.equal(attrs['android:usesCleartextTraffic'], 'false');
  assert.equal(attrs['android:fullBackupContent'], '@xml/backup_rules');
  assert.equal(attrs['android:dataExtractionRules'], '@xml/data_extraction_rules');
  assert.equal(result.modResults.manifest.$['xmlns:tools'], 'http://schemas.android.com/tools');
  assert.deepEqual(new Set(attrs['tools:replace'].split(',')), new Set([
    'android:label', 'android:allowBackup', 'android:usesCleartextTraffic', 'android:fullBackupContent', 'android:dataExtractionRules',
  ]));
  assert.throws(() => config.mods.android.manifestAction({ modResults: { manifest: {
    $: {}, application: [{ $: {}, activity: [{ $: { 'android:name': '.Unsafe' }, 'intent-filter': [{}] }] }],
  } } }), /intent filter but no explicit android:exported/);
});

test('Play backup rules explicitly exclude all app data from cloud backup and device transfer', async () => {
  const plugin = loadWithPlayRelease();
  const config = plugin({ name: 'Play' });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'play-backup-rules-'));
  try {
    await config.mods.android.dangerousAction({ modRequest: { platformProjectRoot: root } });
    const resourceDirectory = path.join(root, 'app', 'src', 'main', 'res', 'xml');
    assert.match(fs.readFileSync(path.join(resourceDirectory, 'backup_rules.xml'), 'utf8'), /<exclude domain="root" path="\."\s*\/>/);
    const extraction = fs.readFileSync(path.join(resourceDirectory, 'data_extraction_rules.xml'), 'utf8');
    assert.match(extraction, /<cloud-backup>[\s\S]*<exclude domain="root" path="\."\s*\/>/);
    assert.match(extraction, /<device-transfer>[\s\S]*<exclude domain="root" path="\."\s*\/>/);
    for (const domain of ['root', 'file', 'database', 'sharedpref', 'external']) {
      assert.equal((extraction.match(new RegExp(`<exclude domain="${domain}"`, 'g')) ?? []).length, 2);
      assert.match(fs.readFileSync(path.join(resourceDirectory, 'backup_rules.xml'), 'utf8'), new RegExp(`<exclude domain="${domain}"`));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('device-audio config plugin is enabled by default and supports explicit diagnostic disable', () => {
  const configPath = path.resolve(__dirname, '../app-play/app.config.js');
  const previous = process.env.EXPO_PUBLIC_DEVICE_AUDIO_CAPTURE_ENABLED;
  const resolve = (value) => {
    if (value === undefined) delete process.env.EXPO_PUBLIC_DEVICE_AUDIO_CAPTURE_ENABLED;
    else process.env.EXPO_PUBLIC_DEVICE_AUDIO_CAPTURE_ENABLED = value;
    delete require.cache[configPath];
    return require(configPath)({ config: { plugins: ['./plugins/withPlayRelease'] } });
  };
  try {
    assert.deepEqual(resolve('false').plugins, ['./plugins/withPlayRelease']);
    for (const value of ['1', 'TRUE']) {
      assert.deepEqual(resolve(value).plugins, ['./plugins/withPlayRelease', './plugins/withDeviceAudioCapture']);
    }
    assert.deepEqual(resolve(undefined).plugins, ['./plugins/withPlayRelease', './plugins/withDeviceAudioCapture']);
    assert.deepEqual(resolve('true').plugins, ['./plugins/withPlayRelease', './plugins/withDeviceAudioCapture']);
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_DEVICE_AUDIO_CAPTURE_ENABLED;
    else process.env.EXPO_PUBLIC_DEVICE_AUDIO_CAPTURE_ENABLED = previous;
    delete require.cache[configPath];
  }
});

test('Play release plugin removes only the release debug-signing fallback and fails closed on drift', () => {
  const plugin = loadWithPlayRelease();
  const config = plugin({ name: 'Play' });
  const marker = 'signingConfig signingConfigs.debug';
  const contents = [
    'android {', '  compileSdk rootProject.ext.compileSdkVersion', '  defaultConfig {',
    '    minSdkVersion rootProject.ext.minSdkVersion', '    targetSdkVersion rootProject.ext.targetSdkVersion', '  }', '}',
    "def enableMinifyInReleaseBuilds = (findProperty('android.enableMinifyInReleaseBuilds') ?: false).toBoolean()",
    'minifyEnabled enableMinifyInReleaseBuilds', "shrinkResources (findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: false)",
    'proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"',
    'debug {', `  ${marker}`, '}',
    'release {', `  ${marker}`, '}',
  ].join('\n');
  const result = config.mods.android.gradleAction({ modResults: { contents } });
  assert.match(result.modResults.contents, /compileSdk\s+36/);
  assert.match(result.modResults.contents, /minSdkVersion\s+24/);
  assert.match(result.modResults.contents, /targetSdkVersion\s+36/);
  assert.match(result.modResults.contents, /getDefaultProguardFile\("proguard-android-optimize\.txt"\)/);
  const properties = config.mods.android.propertiesAction({ modResults: [] }).modResults;
  assert.deepEqual(properties, [
    { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'true' },
    { type: 'property', key: 'android.enableShrinkResourcesInReleaseBuilds', value: 'true' },
  ]);
  assert.equal(result.modResults.contents.split(marker).length - 1, 1);
  assert.match(result.modResults.contents, /release \{\n  signingConfig null\n\}/);
  assert.throws(() => config.mods.android.gradleAction({ modResults: { contents: 'android {\ncompileSdk 36\ndefaultConfig {\nminSdkVersion 24\ntargetSdkVersion 36\n}\n}\nrelease {}' } }), /refusing a Play build/);
});

test('Play release plugin forces the reviewed Commons IO and Gson versions in its generated Android project', () => {
  const plugin = loadWithPlayRelease();
  const config = plugin({ name: 'Play' });
  const action = config.mods.android.projectGradleAction;
  const original = { modResults: { contents: 'allprojects { repositories { google(); mavenCentral() } }\n' } };
  const result = action(original);
  assert.match(result.modResults.contents, /resolutionStrategy\.force 'commons-io:commons-io:2\.22\.0'/);
  assert.match(result.modResults.contents, /resolutionStrategy\.force 'com\.google\.code\.gson:gson:2\.14\.0'/);
  assert.equal((result.modResults.contents.match(/BEGIN Soundboard Play dependency security pins/g) ?? []).length, 1);
  assert.equal(action(result).modResults.contents, result.modResults.contents);
  assert.throws(() => action({ modResults: { contents: `${result.modResults.contents.replace("2.22.0", "2.6")}` } }), /security pins drifted/);
  assert.throws(() => action({ modResults: { contents: `${result.modResults.contents}\n${result.modResults.contents}` } }), /duplicated or incomplete/);
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
