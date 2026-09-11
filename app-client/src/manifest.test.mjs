import assert from 'node:assert/strict';
import test from 'node:test';

import { clipUrl, fetchManifest, parseManifest } from './manifest.ts';

const fixture = {
  version: 1,
  generatedAt: '2026-09-04T15:51:02.692Z',
  baseUrl: 'https://media.example.test',
  pads: [
    {
      padId: 'pad-01',
      clipId: 'clip-01',
      name: '1',
      tags: [],
      color: '#e05a47',
      gridPos: 0,
      pinned: true,
      clipKey: `clips/${'a'.repeat(64)}.m4a`,
      byteSize: 123,
      durationMs: 456,
    },
  ],
};

test('validates a versioned manifest and constructs its clip URL', () => {
  const manifest = parseManifest(fixture);
  assert.equal(manifest.pads[0].name, '1');
  assert.equal(
    clipUrl(manifest.baseUrl, manifest.pads[0].clipKey),
    `https://media.example.test/clips/${'a'.repeat(64)}.m4a`,
  );
});

test('rejects non-content-addressed and traversal clip keys', () => {
  for (const clipKey of ['clips/name.m4a', '../secret.m4a', 'https://bad.test/a.m4a']) {
    assert.throws(
      () => parseManifest({ ...fixture, pads: [{ ...fixture.pads[0], clipKey }] }),
      /content-addressed M4A key/,
    );
  }
});

test('reports a non-success manifest response', async () => {
  await assert.rejects(
    fetchManifest('https://media.example.test/manifest/v1.json', async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      async json() {
        return null;
      },
    })),
    /manifest request failed: 404 Not Found/,
  );
});
