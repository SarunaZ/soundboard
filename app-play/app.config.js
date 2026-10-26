// Playback capture is part of the Play app by default; an explicit false is
// retained for diagnostic builds that need to isolate the other sources.
const captureEnabled = process.env.EXPO_PUBLIC_DEVICE_AUDIO_CAPTURE_ENABLED !== 'false';

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ...(captureEnabled ? ['./plugins/withDeviceAudioCapture'] : []),
  ],
});
