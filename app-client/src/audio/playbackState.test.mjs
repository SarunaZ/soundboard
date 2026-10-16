import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackStateStore, formatPlaybackTime } from './playbackState.ts';

test('progress uses the audio clock and clamps elapsed time to the clip duration', () => {
  const state = new PlaybackStateStore();
  const request = state.beginRequest();
  state.start(request, { padId: 'pad-1', uri: 'clip.m4a', startedAt: 12, duration: 2.5 });

  assert.deepEqual(state.snapshot(11).status, 'playing');
  assert.equal(state.snapshot(11).status === 'playing' ? state.snapshot(11).elapsed : -1, 0);
  assert.equal(state.snapshot(13.25).status === 'playing' ? state.snapshot(13.25).progress : -1, 0.5);
  const ended = state.snapshot(90);
  assert.equal(ended.status === 'playing' ? ended.elapsed : -1, 2.5);
  assert.equal(ended.status === 'playing' ? ended.progress : -1, 1);
});

test('only the latest decoded request can start, and an older finish cannot clear it', () => {
  const state = new PlaybackStateStore();
  const oldRequest = state.beginRequest();
  const latestRequest = state.beginRequest();

  assert.equal(state.start(oldRequest, { padId: 'old', uri: 'old.m4a', startedAt: 1, duration: 4 }), false);
  assert.equal(state.start(latestRequest, { padId: 'latest', uri: 'latest.m4a', startedAt: 2, duration: 3 }), true);
  state.finish(oldRequest);
  const active = state.snapshot(3);
  assert.equal(active.status === 'playing' ? active.padId : null, 'latest');
});

test('stop invalidates pending requests and clears the active snapshot', () => {
  const state = new PlaybackStateStore();
  const request = state.beginRequest();
  state.stop();

  assert.equal(state.isCurrentRequest(request), false);
  assert.deepEqual(state.snapshot(0), { status: 'idle' });
  assert.equal(state.start(request, { padId: 'late', uri: 'late.m4a', startedAt: 0, duration: 1 }), false);
});

test('natural completion clears the active snapshot and notifies subscribers', () => {
  const state = new PlaybackStateStore();
  const seen = [];
  state.subscribe((snapshot) => seen.push(snapshot.status));
  const request = state.beginRequest();
  state.start(request, { padId: 'pad-1', uri: 'clip.m4a', startedAt: 0, duration: 1 });
  state.finish(request);

  assert.deepEqual(seen, ['playing', 'idle']);
  assert.deepEqual(state.snapshot(1), { status: 'idle' });
});

test('playback time formatting is stable for seconds and minutes', () => {
  assert.equal(formatPlaybackTime(0), '0:00');
  assert.equal(formatPlaybackTime(9.9), '0:09');
  assert.equal(formatPlaybackTime(61), '1:01');
  assert.equal(formatPlaybackTime(Number.NaN), '0:00');
});
