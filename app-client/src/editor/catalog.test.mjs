import assert from 'node:assert/strict';
import test from 'node:test';
import { appendClip, generatedClipId, normalizeClipTitle, parseClipCatalog, removeClip, renameClip } from './catalog.ts';

const clip = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  title: 'tiny moment',
  durationMs: 2400,
  createdAt: '2026-10-10T10:00:00.000Z',
};

test('validates a catalog and appends/removes metadata without storing URIs', () => {
  const empty = parseClipCatalog({ version: 1, clips: [] });
  const one = appendClip(empty, clip);
  assert.deepEqual(one.clips, [{ ...clip, extension: 'm4a' }]);
  assert.deepEqual(removeClip(one, clip.id).clips, []);
  assert.deepEqual(parseClipCatalog({ version: 1, clips: [{ ...clip, uri: 'file:///other' }] }).clips, [{ ...clip, extension: 'm4a' }]);
});

test('rejects invalid duration, duplicate IDs, and corrupt catalogs', () => {
  assert.throws(() => parseClipCatalog({ version: 1, clips: [{ ...clip, durationMs: 60_001 }] }), /invalid/);
  assert.throws(() => parseClipCatalog({ version: 1, clips: [{ ...clip, extension: 'flac' }] }), /invalid/);
  assert.throws(() => parseClipCatalog({ version: 1, clips: [clip, clip] }), /duplicate/);
  assert.throws(() => parseClipCatalog({ version: 2, clips: [] }), /unsupported/);
});

test('accepts persisted supported extensions and defaults legacy clips to m4a', () => {
  const catalog = parseClipCatalog({ version: 1, clips: [
    { ...clip, extension: 'mp3' },
    { ...clip, id: '123e4567-e89b-42d3-b456-426614174001' },
  ] });
  assert.deepEqual(catalog.clips.map(({ extension }) => extension), ['mp3', 'm4a']);
});

test('generates UUIDs accepted by the catalog validator', () => {
  const id = generatedClipId(() => 0.5);
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.doesNotThrow(() => parseClipCatalog({ version: 1, clips: [{ ...clip, id }] }));
});

test('normalizes and renames a clip without changing its media metadata or extension', () => {
  const original = parseClipCatalog({ version: 1, clips: [{ ...clip, extension: 'wav' }] });
  const renamed = renameClip(original, clip.id, '  new title  ');
  assert.equal(renamed.clips[0]?.title, 'new title');
  assert.equal(renamed.clips[0]?.extension, 'wav');
  assert.equal(renamed.clips[0]?.uri, undefined);
  assert.equal(original.clips[0]?.title, clip.title);
  assert.equal(normalizeClipTitle(` ${'a'.repeat(100)} `).length, 100);
  assert.throws(() => normalizeClipTitle('a'.repeat(101)), /100 characters/);
  assert.throws(() => renameClip(original, clip.id, 'a'.repeat(101)), /100 characters/);
  assert.throws(() => normalizeClipTitle('  '), /name/);
  assert.throws(() => renameClip(original, '123e4567-e89b-42d3-a456-426614174099', 'New'), /no longer exists/);
});

test('catalog reads can preserve legacy over-capacity data while additions stop at 1000', () => {
  const full = parseClipCatalog({ version: 1, clips: Array.from({ length: 1000 }, (_, index) => ({
    ...clip,
    id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
  })) });
  assert.equal(full.clips.length, 1000);
  assert.throws(() => appendClip(full, clip), /full.*1000/);
  const legacyOverLimit = parseClipCatalog({ version: 1, clips: [...full.clips, clip] });
  assert.equal(legacyOverLimit.clips.length, 1001);
  assert.equal(removeClip(legacyOverLimit, clip.id).clips.length, 1000);
});
