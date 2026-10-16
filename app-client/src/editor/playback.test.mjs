import assert from 'node:assert/strict';
import test from 'node:test';
import { getPlaybackPosition } from './playback.ts';

const base = {
  sourceKey: 'clip-1:source',
  activeSourceKey: 'clip-1:source',
  currentTimeSeconds: 4,
  isLoaded: true,
  playing: true,
  didJustFinish: false,
  error: null,
  mode: 'source',
  startMs: 3000,
  endMs: 8000,
  playbackStartMs: 3000,
  playbackEndMs: 8000,
};

test('maps source-preview time to its point on the full waveform', () => {
  assert.deepEqual(getPlaybackPosition(base), { playheadMs: 4000, elapsedMs: 1000, durationMs: 5000 });
});

test('maps rendered-preview time from zero into the selected source range', () => {
  assert.deepEqual(getPlaybackPosition({ ...base, mode: 'rendered', currentTimeSeconds: 1.25 }), {
    playheadMs: 4250,
    elapsedMs: 1250,
    durationMs: 5000,
  });
});

test('clears the position when playback ended, is idle, loading, failed, or stale', () => {
  for (const change of [
    { playing: false },
    { isLoaded: false },
    { didJustFinish: true },
    { error: 'decoder error' },
    { sourceKey: 'clip-1:source', activeSourceKey: 'clip-2:source' },
    { startMs: 4000 },
  ]) {
    assert.equal(getPlaybackPosition({ ...base, ...change }), null);
  }
});

test('rejects non-finite times and positions outside the selected range', () => {
  for (const currentTimeSeconds of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 2, 8]) {
    assert.equal(getPlaybackPosition({ ...base, currentTimeSeconds }), null);
  }
});
