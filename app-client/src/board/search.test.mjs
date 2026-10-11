import assert from 'node:assert/strict';
import test from 'node:test';

import { filterSoundbites } from './search.ts';

test('filters soundbites by trimmed case-insensitive display text without changing source order', () => {
  const items = [
    { id: 'b', name: 'Morning Bell' },
    { id: 'a', title: 'bell tower' },
    { id: 'c', name: 'Night Chime' },
  ];
  assert.deepEqual(filterSoundbites(items, '  BELL '), items.slice(0, 2));
  assert.deepEqual(filterSoundbites(items, 'night'), [items[2]]);
  assert.deepEqual(filterSoundbites(items, 'missing'), []);
  assert.deepEqual(filterSoundbites(items, '  '), items);
});

test('a 1000-soundbite match remains deterministic and preserves every matching slot', () => {
  const items = Array.from({ length: 1000 }, (_, slotIndex) => ({
    id: `local-pad-${slotIndex}`,
    slotIndex,
    name: slotIndex % 2 === 0 ? `Bell ${slotIndex}` : `Tone ${slotIndex}`,
  }));
  const first = filterSoundbites(items, 'bell');
  const second = filterSoundbites(items, 'BELL');
  assert.equal(first.length, 500);
  assert.deepEqual(first, second);
  assert.deepEqual(first.map(({ slotIndex }) => slotIndex), Array.from({ length: 500 }, (_, index) => index * 2));
});
