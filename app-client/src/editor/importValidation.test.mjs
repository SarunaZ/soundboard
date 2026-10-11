import assert from 'node:assert/strict';
import test from 'node:test';
import {
  audioExtensionFromMetadata,
  importTitleFromFilename,
  validateDeviceImportDuration,
  validateDeviceImportSize,
} from './importValidation.ts';

test('recognizes allowlisted filename extensions and MIME metadata for opaque URIs', () => {
  assert.equal(audioExtensionFromMetadata('song.MP3', 'application/octet-stream'), 'mp3');
  assert.equal(audioExtensionFromMetadata('100003', 'audio/mpeg'), 'mp3');
  assert.equal(audioExtensionFromMetadata('voice', 'audio/x-wav'), 'wav');
  assert.equal(audioExtensionFromMetadata('mix.aac', 'audio/mp4'), 'aac');
  assert.throws(() => audioExtensionFromMetadata('100003', 'audio/flac'), /MP3, M4A, WAV, or AAC/);
  assert.throws(() => audioExtensionFromMetadata('voice.flac', 'audio/mpeg'), /MP3, M4A, WAV, or AAC/);
});

test('validates positive known file sizes and the 10 MB limit', () => {
  assert.doesNotThrow(() => validateDeviceImportSize(1));
  assert.doesNotThrow(() => validateDeviceImportSize(10 * 1024 * 1024));
  assert.throws(() => validateDeviceImportSize(null), /unknown or empty size/);
  assert.throws(() => validateDeviceImportSize(0), /unknown or empty size/);
  assert.throws(() => validateDeviceImportSize(10 * 1024 * 1024 + 1), /10 MB/);
});

test('validates actual positive integer durations through 60 seconds', () => {
  assert.equal(validateDeviceImportDuration(1), 1);
  assert.equal(validateDeviceImportDuration(60_000), 60_000);
  assert.throws(() => validateDeviceImportDuration(0), /longer than 0/);
  assert.throws(() => validateDeviceImportDuration(60_001), /60 seconds/);
});

test('uses a bounded filename title and a generic fallback for opaque IDs', () => {
  assert.equal(importTitleFromFilename('folder/My song.mp3'), 'My song');
  assert.equal(importTitleFromFilename('100003'), 'Imported sound');
  assert.equal(importTitleFromFilename('x'.repeat(140) + '.wav').length, 100);
});
