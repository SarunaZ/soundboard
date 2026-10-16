const { withAndroidManifest, withGradleProperties } = require('expo/config-plugins');

module.exports = function withYoutubePrototype(config, options = {}) {
  if (options.enabled !== true) return config;

  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application) application.$['android:extractNativeLibs'] = 'true';
    return mod;
  });

  config = withGradleProperties(config, (mod) => {
    mod.modResults = mod.modResults.filter((item) => item.key !== 'expo.useLegacyPackaging');
    mod.modResults.push({
      type: 'property',
      key: 'expo.useLegacyPackaging',
      value: 'true',
    });
    return mod;
  });

  return config;
};
