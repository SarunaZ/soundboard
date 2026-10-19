import assert from 'node:assert/strict';
import test from 'node:test';
import { audioSourceExtensionFromMetadata } from './importValidation.ts';

test('maps MP4 and MOV sources onto the MP4 audio decoder path', () => {
  assert.equal(audioSourceExtensionFromMetadata('clip.mp4', 'video/mp4'), 'mp4');
  assert.equal(audioSourceExtensionFromMetadata('clip.mov', 'video/quicktime'), 'mp4');
  assert.equal(audioSourceExtensionFromMetadata('opaque-id', 'video/mp4'), 'mp4');
  assert.equal(audioSourceExtensionFromMetadata('song.m4a', 'audio/mp4'), 'm4a');
  assert.throws(() => audioSourceExtensionFromMetadata('clip.avi', 'video/x-msvideo'), /MP3, M4A, WAV, or AAC/);
});
