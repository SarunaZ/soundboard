import assert from 'node:assert/strict';
import test from 'node:test';

import { TrimPreviewController } from './trimPreview.ts';

class FakePlayer {
  currentTime = 0;
  playing = false;
  removed = false;
  pauseCount = 0;
  playCount = 0;
  seeks = [];
  listeners = new Set();
  seekError = null;

  play() { this.playCount += 1; this.playing = true; }
  pause() { this.pauseCount += 1; this.playing = false; }
  async seekTo(seconds) {
    this.seeks.push(seconds);
    if (this.seekError) throw this.seekError;
    this.currentTime = seconds;
  }
  addListener(_event, listener) {
    this.listeners.add(listener);
    return { remove: () => this.listeners.delete(listener) };
  }
  remove() { this.removed = true; }
  emit({ currentTime = this.currentTime, playing = this.playing, isBuffering = false, didJustFinish = false, error = null } = {}) {
    this.currentTime = currentTime;
    for (const listener of [...this.listeners]) listener({ currentTime, playing, isBuffering, didJustFinish, error });
  }
}

function setup(durationMs = 2_470) {
  const player = new FakePlayer();
  const updates = [];
  const controller = new TrimPreviewController(player, durationMs, (state) => updates.push({ ...state }));
  return { player, updates, controller };
}

test('progress follows native player positions and freezes while buffering or paused', async () => {
  const { player, controller } = setup();
  await controller.play();
  player.emit({ currentTime: 0.84, playing: true });
  assert.equal(controller.getState().positionMs, 840);
  player.emit({ currentTime: 0.84, playing: true, isBuffering: true });
  assert.equal(controller.getState().buffering, true);
  assert.equal(controller.getState().playing, false);
  player.emit({ currentTime: 0.84, playing: false });
  assert.equal(controller.getState().positionMs, 840);
  controller.dispose();
});

test('pause and resume use the player position without seeking back to the start', async () => {
  const { player, controller } = setup();
  await controller.play();
  player.currentTime = 1.12;
  controller.pause();
  assert.equal(controller.getState().positionMs, 1_120);
  await controller.play();
  assert.equal(player.playCount, 2);
  assert.deepEqual(player.seeks, []);
  player.emit({ currentTime: 1.3, playing: true });
  assert.equal(controller.getState().positionMs, 1_300);
  controller.dispose();
});

test('pause during native buffering cancels the pending playback intent', async () => {
  const { player, controller } = setup();
  await controller.play();
  player.emit({ currentTime: 0.15, playing: true, isBuffering: true });
  controller.pause();
  assert.equal(player.playing, false);
  assert.equal(controller.getState().buffering, false);
  controller.dispose();
});

test('reset pauses, seeks to the new selection start, and clears clip-relative progress', async () => {
  const { player, controller } = setup();
  await controller.play();
  player.currentTime = 0.9;
  await controller.reset();
  assert.equal(player.playing, false);
  assert.deepEqual(player.seeks, [0]);
  assert.equal(controller.getState().positionMs, 0);
  assert.equal(controller.getState().complete, false);
  controller.dispose();
});

test('completion pins at 100 percent and the next play replays from the rendered range start', async () => {
  const { player, controller } = setup(2_470);
  await controller.play();
  player.emit({ currentTime: 2.49, playing: false, didJustFinish: true });
  assert.equal(controller.getState().positionMs, 2_470);
  assert.equal(controller.getState().complete, true);
  await controller.play();
  assert.deepEqual(player.seeks, [0]);
  assert.equal(controller.getState().positionMs, 0);
  assert.equal(player.playing, true);
  controller.dispose();
});

test('dispose removes the native listener and ignores callbacks delivered afterward', async () => {
  const { player, updates, controller } = setup();
  await controller.play();
  const staleListener = [...player.listeners][0];
  controller.dispose();
  const updateCount = updates.length;
  staleListener({ currentTime: 1, playing: true, isBuffering: false, didJustFinish: false, error: null });
  assert.equal(player.listeners.size, 0);
  assert.equal(player.removed, true);
  assert.equal(updates.length, updateCount);
});

test('native player errors pause playback and remain available to the UI', async () => {
  const { player, controller } = setup();
  await controller.play();
  player.emit({ currentTime: 0.32, playing: false, error: 'Decoder failed.' });
  assert.equal(player.playing, false);
  assert.equal(controller.getState().playing, false);
  assert.equal(controller.getState().error, 'Decoder failed.');
  controller.dispose();
});

test('a failed replay seek reports an error and leaves the controller paused', async () => {
  const { player, controller } = setup();
  await controller.play();
  player.emit({ currentTime: 3, playing: false, didJustFinish: true });
  player.seekError = new Error('Seek failed.');
  await controller.play();
  assert.equal(controller.getState().playing, false);
  assert.equal(controller.getState().error, 'Seek failed.');
  controller.dispose();
});
