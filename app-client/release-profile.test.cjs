const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appDirectory = __dirname;
const appConfigPath = path.join(appDirectory, 'app.config.js');
const gradlePath = path.join(appDirectory, 'modules/soundboard-youtube/android/build.gradle');
const privatePluginPath = path.join(appDirectory, 'plugins/withPrivateRelease.js');

function resolveConfig({ prototype = false, privateRelease = false } = {}) {
  const previous = {
    prototype: process.env.SOUNDBOARD_YOUTUBE_PROTOTYPE,
    privateRelease: process.env.SOUNDBOARD_PRIVATE_RELEASE,
  };
  if (prototype) process.env.SOUNDBOARD_YOUTUBE_PROTOTYPE = '1';
  else delete process.env.SOUNDBOARD_YOUTUBE_PROTOTYPE;
  if (privateRelease) process.env.SOUNDBOARD_PRIVATE_RELEASE = '1';
  else delete process.env.SOUNDBOARD_PRIVATE_RELEASE;
  delete require.cache[appConfigPath];

  try {
    return require(appConfigPath)();
  } finally {
    if (previous.prototype === undefined) delete process.env.SOUNDBOARD_YOUTUBE_PROTOTYPE;
    else process.env.SOUNDBOARD_YOUTUBE_PROTOTYPE = previous.prototype;
    if (previous.privateRelease === undefined) delete process.env.SOUNDBOARD_PRIVATE_RELEASE;
    else process.env.SOUNDBOARD_PRIVATE_RELEASE = previous.privateRelease;
    delete require.cache[appConfigPath];
  }
}

test('ordinary config remains the app.json config', () => {
  assert.deepEqual(resolveConfig(), require('./app.json').expo);
});

test('prototype profile keeps its separate package and module plugin', () => {
  const config = resolveConfig({ prototype: true });
  assert.equal(config.name, 'Soundboard Prototype');
  assert.equal(config.android.package, 'dev.sarunas.soundboard.prototype');
  assert.ok(config.plugins.some(([name]) => name === './plugins/withYoutubePrototype'));
});

test('private profile has stable identity, fresh-data package and restrictive Android settings', () => {
  const config = resolveConfig({ privateRelease: true });
  assert.equal(config.name, 'Soundboard Private');
  assert.equal(config.version, '1.0.1');
  assert.equal(config.android.package, 'dev.sarunas.soundboard.sideload');
  assertJavaPackage(config.android.package);
  assert.equal(config.android.versionCode, 2);
  assert.equal(config.android.allowBackup, false);
  assert.ok(config.android.blockedPermissions.includes('android.permission.RECORD_AUDIO'));
  assert.ok(config.android.blockedPermissions.includes('android.permission.SYSTEM_ALERT_WINDOW'));
  assert.ok(config.plugins.some(([name]) => name === './plugins/withPrivateRelease'));
  assert.ok(!config.plugins.some(([name]) => name === './plugins/withYoutubePrototype'));
});

const JAVA_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
  'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
  'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void',
  'volatile', 'while', 'true', 'false', 'null',
]);

function assertJavaPackage(packageName) {
  const segments = packageName.split('.');
  assert.ok(segments.length > 0 && segments.every((segment) =>
    /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment) && !JAVA_KEYWORDS.has(segment),
  ), `Invalid Java package name: ${packageName}`);
}

test('Java package validation rejects reserved-keyword segments', () => {
  assert.throws(() => assertJavaPackage('dev.sarunas.soundboard.private'), /Invalid Java package/);
  assert.doesNotThrow(() => assertJavaPackage('dev.sarunas.soundboard.sideload'));
});

test('prototype and private release profiles fail closed when enabled together', () => {
  assert.throws(() => resolveConfig({ prototype: true, privateRelease: true }), /cannot both be enabled/);
});

test('private native module uses prototype sources and disables external error reports', () => {
  const gradle = fs.readFileSync(gradlePath, 'utf8');
  assert.match(gradle, /def nativeYoutubeEnabled = prototypeEnabled \|\| privateReleaseEnabled/);
  assert.match(gradle, /if \(nativeYoutubeEnabled\) \{\s*implementation 'io\.github\.junkfood02\.youtubedl-android:library:0\.18\.1'/);
  assert.match(gradle, /EXTERNAL_DIAGNOSTIC_REPORTS_ENABLED/);

  const native = fs.readFileSync(
    path.join(appDirectory, 'modules/soundboard-youtube/android/src/prototype/java/dev/sarunas/soundboard/youtube/SoundboardYoutubeModule.kt'),
    'utf8',
  );
  assert.match(native, /Constant\("privateRelease"\) \{ !BuildConfig\.EXTERNAL_DIAGNOSTIC_REPORTS_ENABLED \}/);
  assert.equal((native.match(/if \(!BuildConfig\.EXTERNAL_DIAGNOSTIC_REPORTS_ENABLED\) return/g) ?? []).length, 2);
});

test('private config plugin preserves executable packaging and removes the release debug-sign fallback', () => {
  const plugin = fs.readFileSync(privatePluginPath, 'utf8');
  assert.match(plugin, /withYoutubePrototype\(config, \{ enabled: true \}\)/);
  assert.match(plugin, /android:usesCleartextTraffic.*false/);
  assert.match(plugin, /signingConfig null/);
  assert.match(plugin, /refusing a private release build/);
  assert.match(plugin, /tools:node="remove" markers/);
});

test('private Gradle plugin restricts app packaging to arm64 and fails closed on template drift', () => {
  const { injectArm64OnlyAbiFilter } = require(privatePluginPath);
  const template = [
    'android {',
    '    defaultConfig {',
    "        applicationId 'dev.example.app'",
    '    }',
    '}',
  ].join('\n');
  const filtered = injectArm64OnlyAbiFilter(template);
  assert.match(filtered, /defaultConfig \{\n        ndk \{\n            abiFilters 'arm64-v8a'\n        \}/);
  assert.equal((filtered.match(/abiFilters/g) ?? []).length, 1);

  const windowsTemplate = template.replace(/\n/g, '\r\n');
  const windowsFiltered = injectArm64OnlyAbiFilter(windowsTemplate);
  assert.match(windowsFiltered, /\r\n        ndk \{\r\n            abiFilters 'arm64-v8a'\r\n        \}/);
  assert.equal((windowsFiltered.match(/\r\r\n/g) ?? []).length, 0);

  assert.throws(() => injectArm64OnlyAbiFilter('android { }'), /Could not identify/);
  assert.throws(() => injectArm64OnlyAbiFilter(`${template}\n${template}`), /Could not identify/);
  assert.throws(() => injectArm64OnlyAbiFilter(template.replace('defaultConfig {', "defaultConfig {\n        ndk { abiFilters 'x86' }") ), /Could not identify/);
});
