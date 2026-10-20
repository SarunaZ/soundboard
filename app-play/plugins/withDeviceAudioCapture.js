const { withAndroidManifest } = require('expo/config-plugins');

const SERVICE = 'dev.sarunas.soundboard.deviceaudio.DeviceAudioCaptureService';
const CONSENT_ACTIVITY = 'dev.sarunas.soundboard.deviceaudio.DeviceAudioConsentActivity';
const REQUIRED_PERMISSIONS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
  'android.permission.POST_NOTIFICATIONS',
];

function configureDeviceAudioManifest(manifest) {
  const permissions = manifest['uses-permission'] ?? [];
  for (const name of REQUIRED_PERMISSIONS) {
    if (!permissions.some((entry) => entry.$?.['android:name'] === name)) {
      permissions.push({ $: { 'android:name': name } });
    }
  }
  manifest['uses-permission'] = permissions;

  const application = manifest.application?.[0];
  if (!application) throw new Error('Play manifest has no application element.');
  application.service ??= [];
  const service = {
    $: {
      'android:name': SERVICE,
      'android:exported': 'false',
      'android:enabled': 'true',
      'android:foregroundServiceType': 'mediaProjection',
    },
  };
  const existing = application.service.find((entry) => entry.$?.['android:name'] === SERVICE);
  if (existing) Object.assign(existing.$, service.$);
  else application.service.push(service);

  application.activity ??= [];
  const consent = {
    $: {
      'android:name': CONSENT_ACTIVITY,
      'android:exported': 'false',
      'android:excludeFromRecents': 'true',
      'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
      'android:configChanges': 'keyboardHidden|orientation|screenSize|smallestScreenSize|screenLayout',
    },
  };
  const existingConsent = application.activity.find((entry) => entry.$?.['android:name'] === CONSENT_ACTIVITY);
  if (existingConsent) Object.assign(existingConsent.$, consent.$);
  else application.activity.push(consent);
  return manifest;
}

module.exports = function withDeviceAudioCapture(config) {
  const blocked = new Set(config.android?.blockedPermissions ?? []);
  blocked.delete('android.permission.POST_NOTIFICATIONS');
  config.android = { ...config.android, blockedPermissions: [...blocked] };

  return withAndroidManifest(config, (mod) => {
    mod.modResults.manifest = configureDeviceAudioManifest(mod.modResults.manifest);
    return mod;
  });
};

module.exports.REQUIRED_PERMISSIONS = REQUIRED_PERMISSIONS;
module.exports.SERVICE = SERVICE;
module.exports.CONSENT_ACTIVITY = CONSENT_ACTIVITY;
module.exports.configureDeviceAudioManifest = configureDeviceAudioManifest;
