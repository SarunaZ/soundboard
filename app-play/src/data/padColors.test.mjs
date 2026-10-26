import assert from 'node:assert/strict';
import test from 'node:test';

import { PAD_GRADIENTS, padGradientStops } from './padColors.ts';

test('pad colors retain fifteen vivid and sixteen pastel prototype gradients before stable hue progression', () => {
  assert.equal(PAD_GRADIENTS.length, 31);
  assert.deepEqual(padGradientStops(0), ['#ff5e68', '#ff172c']);
  assert.deepEqual(padGradientStops(14), ['#fc6eb5', '#ee218a']);
  assert.deepEqual(padGradientStops(15), ['#ffc9a9', '#ff9eac']);
  assert.deepEqual(padGradientStops(30), ['#cbcef9', '#a9b4f6']);
  const later = padGradientStops(31);
  assert.match(later[0], /^#[0-9a-f]{6}$/i);
  assert.deepEqual(padGradientStops(31), later);
  assert.notDeepEqual(later, padGradientStops(30));
});
