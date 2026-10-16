const prototypeEnabled = process.env.SOUNDBOARD_YOUTUBE_PROTOTYPE === '1';
const privateReleaseEnabled = process.env.SOUNDBOARD_PRIVATE_RELEASE === '1';

if (prototypeEnabled && privateReleaseEnabled) {
  throw new Error('SOUNDBOARD_YOUTUBE_PROTOTYPE and SOUNDBOARD_PRIVATE_RELEASE cannot both be enabled.');
}

module.exports = () => {
  const config = require('./app.json').expo;
  if (privateReleaseEnabled) {
    const blockedPermissions = [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.MANAGE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      'android.permission.RECORD_AUDIO',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ];

    return {
      ...config,
      name: 'Soundboard Private',
      version: '1.0.1',
      android: {
        ...config.android,
        package: 'dev.sarunas.soundboard.sideload',
        versionCode: 2,
        allowBackup: false,
        blockedPermissions,
      },
      plugins: [
        ...config.plugins,
        ['./plugins/withPrivateRelease', { enabled: true }],
      ],
    };
  }

  if (!prototypeEnabled) return config;

  return {
    ...config,
    name: 'Soundboard Prototype',
    android: {
      ...config.android,
      package: 'dev.sarunas.soundboard.prototype',
    },
    plugins: [
      ...config.plugins,
      ['./plugins/withYoutubePrototype', { enabled: true }],
    ],
  };
};
