import assert from 'node:assert/strict';
import test from 'node:test';
import { appendClip, generatedClipId, parseClipCatalog, removeClip } from './catalog.ts';

const clip = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  title: 'tiny moment',
  durationMs: 2400,
  createdAt: '2026-10-10T10:00:00.000Z',
};

test('validates a catalog and appends/removes metadata without storing URIs', () => {
  const empty = parseClipCatalog({ version: 1, clips: [] });
  const one = appendClip(empty, clip);
  assert.deepEqual(one.clips, [clip]);
  assert.deepEqual(removeClip(one, clip.id).clips, []);
  assert.deepEqual(parseClipCatalog({ version: 1, clips: [{ ...clip, uri: 'file:///other' }] }).clips, [clip]);
});

test('rejects invalid duration, duplicate IDs, and corrupt catalogs', () => {
  assert.throws(() => parseClipCatalog({ version: 1, clips: [{ ...clip, durationMs: 60_001 }] }), /invalid/);
  assert.throws(() => parseClipCatalog({ version: 1, clips: [clip, clip] }), /duplicate/);
  assert.throws(() => parseClipCatalog({ version: 2, clips: [] }), /unsupported/);
});

test('generates UUIDs accepted by the catalog validator', () => {
  const id = generatedClipId(() => 0.5);
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.doesNotThrow(() => parseClipCatalog({ version: 1, clips: [{ ...clip, id }] }));
});
