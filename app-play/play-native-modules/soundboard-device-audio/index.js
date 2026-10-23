import { requireNativeModule } from 'expo-modules-core';

const nativeModule = requireNativeModule('SoundboardDeviceAudio');

export const startPlaybackPreparation = (channels, gain, sampleRate) =>
  nativeModule.startPlaybackPreparation(channels, gain, sampleRate);

export const pollPlaybackPreparation = (jobId) =>
  nativeModule.pollPlaybackPreparation(jobId);

export const cancelPlaybackPreparation = (jobId) =>
  nativeModule.cancelPlaybackPreparation(jobId);
