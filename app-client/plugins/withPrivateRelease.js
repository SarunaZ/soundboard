const { withAndroidManifest, withAppBuildGradle } = require('expo/config-plugins');
const withYoutubePrototype = require('./withYoutubePrototype');

function injectArm64OnlyAbiFilter(contents) {
  const anchors = [...contents.matchAll(/^[ \t]*defaultConfig[ \t]*\{[ \t]*\r?$/gm)];
  if (anchors.length !== 1 || /\babiFilters\b/.test(contents)) {
    throw new Error('Could not identify a single unfiltered app defaultConfig block; refusing a private release build.');
  }

  const anchor = anchors[0][0];
  const anchorLine = anchor.replace(/\r$/, '');
  const indentation = anchorLine.match(/^[ \t]*/)[0];
  const lineEnding = contents.includes('\r\n') ? '\r\n' : '\n';
  const replacement = [
    anchorLine,
    `${indentation}    ndk {`,
    `${indentation}        abiFilters 'arm64-v8a'`,
    `${indentation}    }`,
  ].join(lineEnding);
  return contents.replace(anchor, replacement);
}

module.exports = function withPrivateRelease(config, options = {}) {
  if (options.enabled !== true) return config;

  // This wrapper's executable runtime requires extractNativeLibs and legacy
  // native-library packaging, the same settings as the working prototype APK.
  config = withYoutubePrototype(config, { enabled: true });

  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const application = manifest.application?.[0];

    if (!application) throw new Error('Private release manifest has no application element.');
    manifest.$['xmlns:tools'] ??= 'http://schemas.android.com/tools';
    application.$['android:allowBackup'] = 'false';
    application.$['android:usesCleartextTraffic'] = 'false';
    const replace = new Set((application.$['tools:replace'] ?? '').split(',').filter(Boolean));
    replace.add('android:allowBackup');
    replace.add('android:usesCleartextTraffic');
    application.$['tools:replace'] = [...replace].join(',');

    // Android config's blockedPermissions emits tools:node="remove" markers.
    // Retain those markers: filtering them here would let dependency manifests
    // reintroduce the permissions during Android's final manifest merge.

    return mod;
  });

  config = withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = injectArm64OnlyAbiFilter(mod.modResults.contents);

    const marker = 'signingConfig signingConfigs.debug';
    const first = mod.modResults.contents.indexOf(marker);
    const last = mod.modResults.contents.lastIndexOf(marker);
    if (first < 0 || last === first) {
      throw new Error('Could not identify the generated release signing fallback; refusing a private release build.');
    }

    mod.modResults.contents =
      mod.modResults.contents.slice(0, last) +
      'signingConfig null' +
      mod.modResults.contents.slice(last + marker.length);
    return mod;
  });

  return config;
};

module.exports.injectArm64OnlyAbiFilter = injectArm64OnlyAbiFilter;
