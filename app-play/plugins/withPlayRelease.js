const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withAppBuildGradle, withDangerousMod, withGradleProperties, withProjectBuildGradle } = require('expo/config-plugins');

const PLAY_DEPENDENCY_RESOLUTIONS = `// BEGIN Soundboard Play dependency security pins
allprojects {
  configurations.configureEach {
    resolutionStrategy.force 'commons-io:commons-io:2.22.0'
    resolutionStrategy.force 'com.google.code.gson:gson:2.14.0'
  }
}
// END Soundboard Play dependency security pins`;

const BACKUP_RULES = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <exclude domain="root" path="." />
  <exclude domain="file" path="." />
  <exclude domain="database" path="." />
  <exclude domain="sharedpref" path="." />
  <exclude domain="external" path="." />
</full-backup-content>
`;
const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="root" path="." />
    <exclude domain="file" path="." />
    <exclude domain="database" path="." />
    <exclude domain="sharedpref" path="." />
    <exclude domain="external" path="." />
  </cloud-backup>
  <device-transfer>
    <exclude domain="root" path="." />
    <exclude domain="file" path="." />
    <exclude domain="database" path="." />
    <exclude domain="sharedpref" path="." />
    <exclude domain="external" path="." />
  </device-transfer>
</data-extraction-rules>
`;

module.exports = function withPlayRelease(config) {
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) throw new Error('Play manifest has no application element.');
    manifest.$['xmlns:tools'] ??= 'http://schemas.android.com/tools';
    application.$['android:allowBackup'] = 'false';
    application.$['android:usesCleartextTraffic'] = 'false';
    application.$['android:fullBackupContent'] = '@xml/backup_rules';
    application.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
    const replace = new Set((application.$['tools:replace'] ?? '').split(',').filter(Boolean));
    replace.add('android:allowBackup');
    replace.add('android:usesCleartextTraffic');
    replace.add('android:fullBackupContent');
    replace.add('android:dataExtractionRules');
    application.$['tools:replace'] = [...replace].join(',');
    for (const componentType of ['activity', 'service', 'receiver', 'provider']) {
      for (const component of application[componentType] ?? []) {
        component.$ ??= {};
        if (component.$['android:exported'] === undefined) {
          if ((component['intent-filter'] ?? []).length > 0) {
            throw new Error(`Play ${componentType} ${component.$['android:name'] ?? '(unnamed)'} has an intent filter but no explicit android:exported value.`);
          }
          component.$['android:exported'] = 'false';
        }
      }
    }
    return mod;
  });

  config = withDangerousMod(config, ['android', async (mod) => {
    const resourceDirectory = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
    fs.mkdirSync(resourceDirectory, { recursive: true });
    fs.writeFileSync(path.join(resourceDirectory, 'backup_rules.xml'), BACKUP_RULES, 'utf8');
    fs.writeFileSync(path.join(resourceDirectory, 'data_extraction_rules.xml'), DATA_EXTRACTION_RULES, 'utf8');
    return mod;
  }]);

  config = withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;
    for (const [expression, value, label] of [
      [/^(\s*compileSdk(?:Version)?\s+)([^\r\n]+)$/gm, '36', 'compile SDK'],
      [/^(\s*minSdkVersion\s+)([^\r\n]+)$/gm, '24', 'minimum SDK'],
      [/^(\s*targetSdkVersion\s+)([^\r\n]+)$/gm, '36', 'target SDK'],
    ]) {
      const matches = [...contents.matchAll(expression)];
      if (matches.length !== 1) throw new Error(`Could not identify exactly one generated ${label} setting; refusing an unverified Play build.`);
      contents = contents.replace(expression, (_match, prefix) => prefix + value);
    }
    if (!/def\s+enableMinifyInReleaseBuilds\s*=\s*\(findProperty\(['"]android\.enableMinifyInReleaseBuilds['"]\)/.test(contents) ||
        !/minifyEnabled\s+enableMinifyInReleaseBuilds/.test(contents) ||
        !/android\.enableShrinkResourcesInReleaseBuilds/.test(contents)) {
      throw new Error('Could not verify generated release minification/resource-shrinking controls; refusing a Play build.');
    }
    const defaultRules = [...contents.matchAll(/getDefaultProguardFile\((['"])proguard-android\.txt\1\)/g)];
    if (defaultRules.length !== 1) {
      throw new Error('Could not identify exactly one default Android ProGuard file; refusing a Play release build.');
    }
    contents = contents.replace(/getDefaultProguardFile\((['"])proguard-android\.txt\1\)/, 'getDefaultProguardFile("proguard-android-optimize.txt")');
    if (!/proguardFiles[^\r\n]*proguard-android-optimize\.txt/.test(contents)) throw new Error('Play release must use the optimized Android ProGuard/R8 defaults.');
    const marker = 'signingConfig signingConfigs.debug';
    const first = contents.indexOf(marker);
    const last = contents.lastIndexOf(marker);
    if (first < 0 || last === first) {
      throw new Error('Could not identify generated release signing fallback; refusing a Play release build.');
    }
    mod.modResults.contents = contents.slice(0, last) +
      'signingConfig null' + contents.slice(last + marker.length);
    return mod;
  });

  config = withGradleProperties(config, (mod) => {
    const desired = new Map([
      ['android.enableMinifyInReleaseBuilds', 'true'],
      ['android.enableShrinkResourcesInReleaseBuilds', 'true'],
    ]);
    for (const [key, value] of desired) {
      const rows = mod.modResults.filter((row) => row.type === 'property' && row.key === key);
      if (rows.length > 1) throw new Error(`Duplicate Gradle property ${key}; refusing an ambiguous Play release configuration.`);
      if (rows.length === 1) rows[0].value = value;
      else mod.modResults.push({ type: 'property', key, value });
    }
    return mod;
  });

  config = withProjectBuildGradle(config, (mod) => {
    const contents = mod.modResults.contents;
    const beginMarker = '// BEGIN Soundboard Play dependency security pins';
    const endMarker = '// END Soundboard Play dependency security pins';
    const begins = contents.split(beginMarker).length - 1;
    const ends = contents.split(endMarker).length - 1;
    if (begins !== ends || begins > 1) {
      throw new Error('Play Gradle dependency security pins are duplicated or incomplete; refusing an ambiguous dependency graph.');
    }
    if (begins === 1) {
      const start = contents.indexOf(beginMarker);
      const end = contents.indexOf(endMarker, start) + endMarker.length;
      if (contents.slice(start, end) !== PLAY_DEPENDENCY_RESOLUTIONS) {
        throw new Error('Play Gradle dependency security pins drifted from the reviewed versions.');
      }
      return mod;
    }
    mod.modResults.contents = `${contents.trimEnd()}\n\n${PLAY_DEPENDENCY_RESOLUTIONS}\n`;
    return mod;
  });
  return config;
};
