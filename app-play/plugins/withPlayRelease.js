const { withAndroidManifest, withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withPlayRelease(config) {
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) throw new Error('Play manifest has no application element.');
    manifest.$['xmlns:tools'] ??= 'http://schemas.android.com/tools';
    application.$['android:allowBackup'] = 'false';
    application.$['android:usesCleartextTraffic'] = 'false';
    const replace = new Set((application.$['tools:replace'] ?? '').split(',').filter(Boolean));
    replace.add('android:allowBackup');
    replace.add('android:usesCleartextTraffic');
    application.$['tools:replace'] = [...replace].join(',');
    return mod;
  });

  config = withAppBuildGradle(config, (mod) => {
    const marker = 'signingConfig signingConfigs.debug';
    const first = mod.modResults.contents.indexOf(marker);
    const last = mod.modResults.contents.lastIndexOf(marker);
    if (first < 0 || last === first) {
      throw new Error('Could not identify generated release signing fallback; refusing a Play release build.');
    }
    mod.modResults.contents = mod.modResults.contents.slice(0, last) +
      'signingConfig null' + mod.modResults.contents.slice(last + marker.length);
    return mod;
  });
  return config;
};
