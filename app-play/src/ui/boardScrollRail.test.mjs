import test from 'node:test';
import assert from 'node:assert/strict';
import { boardNeedsScrollRail, boardScrollRailGeometry, boardScrollRailOffset, boardScrollRailShouldLoadMore, boardStopDockGeometry } from './boardScrollRail.ts';

test('rail visibility follows measured overflow in Pages and Scroll modes', () => {
  assert.equal(boardNeedsScrollRail({ navigation: 'pages', filteredSoundCount: 60, loadedSoundCount: 15, contentHeight: 700, viewportHeight: 600, latchedVisible: false }), true);
  assert.equal(boardNeedsScrollRail({ navigation: 'scroll', filteredSoundCount: 12, loadedSoundCount: 12, contentHeight: 700, viewportHeight: 600, latchedVisible: false }), true);
  assert.equal(boardNeedsScrollRail({ navigation: 'pages', filteredSoundCount: 12, loadedSoundCount: 12, contentHeight: 0, viewportHeight: 0, latchedVisible: false }), false);
});

test('rail visibility stays latched when reserving rail width changes measured content', () => {
  assert.equal(boardNeedsScrollRail({ navigation: 'pages', filteredSoundCount: 12, loadedSoundCount: 12, contentHeight: 540, viewportHeight: 600, latchedVisible: true }), true);
});

test('rail thumb position tracks scroll extent and clamps offsets', () => {
  const top = boardScrollRailGeometry(1_000, 200, 124, 42, 0);
  const middle = boardScrollRailGeometry(1_000, 200, 124, 42, 400);
  const bottom = boardScrollRailGeometry(1_000, 200, 124, 42, 800);
  assert.equal(top.thumbTop, 0);
  assert.ok(middle.thumbTop > 0 && middle.thumbTop < middle.thumbTravel);
  assert.equal(bottom.thumbTop, bottom.thumbTravel);
  assert.equal(boardScrollRailGeometry(1_000, 200, 124, 42, 9_000).thumbTop, bottom.thumbTravel);
});

test('dragging down moves toward later sounds and clamps at both ends', () => {
  assert.equal(boardScrollRailOffset(0, 20, 1_000, 200, 80), 200);
  assert.equal(boardScrollRailOffset(800, 20, 1_000, 200, 80), 800);
  assert.equal(boardScrollRailOffset(0, -20, 1_000, 200, 80), 0);
});

test('zero content and no-scroll layouts produce a safe stationary thumb', () => {
  assert.deepEqual(boardScrollRailGeometry(0, 200, 124), { thumbHeight: 124, thumbTravel: 0, maxScrollOffset: 0, thumbTop: 0 });
  assert.equal(boardScrollRailOffset(0, 500, 0, 200, 100), 0);
  assert.equal(boardScrollRailOffset(0, 500, 100, 200, 100), 0);
});

test('reaching the loaded rail end requests the next batch until all sounds are loaded', () => {
  assert.equal(boardScrollRailShouldLoadMore(700, 900, 200, 80, 30, 45), true);
  assert.equal(boardScrollRailShouldLoadMore(700, 900, 200, 80, 45, 45), false);
  assert.equal(boardScrollRailShouldLoadMore(500, 900, 200, 80, 30, 45), false);
});

test('dock and fixed clearance geometry scales from its dimensions independently of playback', () => {
  assert.deepEqual(boardStopDockGeometry(), { clearance: 62, bottom: 92, modalInset: 140 });
  assert.deepEqual(boardStopDockGeometry(80, 52, 16), { clearance: 68, bottom: 96, modalInset: 148 });
  const measuredTrackHeight = 314;
  const geometry = boardScrollRailGeometry(1_200, 600, measuredTrackHeight, 42, 300);
  assert.equal(geometry.thumbTravel, measuredTrackHeight - geometry.thumbHeight);
  assert.equal(geometry.thumbTop, geometry.thumbTravel / 2);
});
