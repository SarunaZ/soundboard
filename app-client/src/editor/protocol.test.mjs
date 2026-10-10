import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampRange,
  editorResourceUrl,
  normalizeEditorBase,
  parseEditorSession,
  validateRange,
  youtubeUrl,
} from './protocol.ts';

const session = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  sourceUrl: 'https://youtu.be/abc123xyz_0',
  title: 'sample',
  durationMs: 20_000,
  state: 'ready',
  previewPath: '/editor/sessions/123e4567-e89b-42d3-a456-426614174000/preview',
  clipPath: null,
  peaks: [0, 0.5, 1],
  expiresAt: '2026-10-10T12:00:00.000Z',
  error: null,
  trimStartMs: null,
  trimEndMs: null,
};

test('validates sessions and confines resource paths to the configured service', () => {
  const parsed = parseEditorSession(session);
  assert.equal(parsed.state, 'ready');
  assert.equal(editorResourceUrl(normalizeEditorBase('https://editor.example'), parsed.previewPath, 'preview', parsed.id),
    'https://editor.example/editor/sessions/123e4567-e89b-42d3-a456-426614174000/preview');
  assert.throws(() => editorResourceUrl(new URL('https://editor.example'), 'https://evil.example/editor/x', 'preview', parsed.id));
  assert.throws(() => editorResourceUrl(new URL('https://editor.example'), '//evil.example/x', 'preview', parsed.id));
  assert.throws(() => editorResourceUrl(new URL('https://editor.example'), '/editor/sessions/123e4567-e89b-42d3-a456-426614174000/clip', 'preview', parsed.id));
  assert.throws(() => editorResourceUrl(new URL('https://editor.example'), '/editor/sessions/123e4567-e89b-42d3-a456-426614174001/preview', 'preview', parsed.id));
  assert.throws(() => parseEditorSession({ ...session, durationMs: 21 * 60 * 1000 }));
  assert.throws(() => parseEditorSession({ ...session, durationMs: 20_000.5 }));
  assert.throws(() => parseEditorSession({ ...session, trimStartMs: 0, trimEndMs: 99 }));
});

test('requires a YouTube video URL and protects configured service transport', () => {
  assert.equal(youtubeUrl('https://youtu.be/abc123xyz_0'), 'https://www.youtube.com/watch?v=abc123xyz_0');
  assert.equal(youtubeUrl('http://www.youtube.com/watch?v=OjNpRbNdR7E&list=RDOjNpRbNdR7E'), 'https://www.youtube.com/watch?v=OjNpRbNdR7E');
  assert.equal(youtubeUrl('  http://www.youtube.com/watch?v=OjNpRbNdR7E&list=RDOjNpRbNdR7E  '), 'https://www.youtube.com/watch?v=OjNpRbNdR7E');
  assert.equal(youtubeUrl('https://www.youtube.com/shorts/jlPQtJXy9t8'), 'https://www.youtube.com/watch?v=jlPQtJXy9t8');
  assert.equal(youtubeUrl('https://www.youtube.com/shorts/abc123xyz_0/?list=PL123&t=12'), 'https://www.youtube.com/watch?v=abc123xyz_0');
  assert.equal(youtubeUrl('http://youtube.com/watch?v=abc123xyz_0&list=PL123&index=2&si=tracking'), 'https://www.youtube.com/watch?v=abc123xyz_0');
  assert.equal(youtubeUrl('https://youtu.be/abc123xyz_0?list=PL123&si=tracking'), 'https://www.youtube.com/watch?v=abc123xyz_0');
  assert.throws(() => youtubeUrl('https://example.com/video'));
  assert.throws(() => youtubeUrl('https://m.youtube.com/watch?v=abc123xyz_0'));
  assert.throws(() => youtubeUrl('https://youtube.com/playlist?list=PL'));
  assert.throws(() => youtubeUrl('https://youtube.com/watch?list=PL'));
  assert.throws(() => youtubeUrl('https://youtube.com/watch?v=abc123xyz_0&v=abc123xyz_0'));
  assert.throws(() => youtubeUrl('https://youtube.com/watch?v=bad%2Fid1234'));
  assert.throws(() => youtubeUrl('https://youtube.com:443/watch?v=abc123xyz_0'));
  assert.throws(() => youtubeUrl('  https://youtube.com:443/watch?v=abc123xyz_0  '));
  assert.throws(() => youtubeUrl('https:\\youtube.com:443/watch?v=abc123xyz_0'));
  assert.throws(() => youtubeUrl('https://youtube.com.evil.test/watch?v=abc123xyz_0'));
  assert.throws(() => youtubeUrl('http://user:pass@youtube.com/watch?v=abc123xyz_0'));
  assert.throws(() => normalizeEditorBase('http://editor.example'));
  assert.throws(() => normalizeEditorBase('http://10.evil.example'));
  assert.throws(() => normalizeEditorBase('http://192.168.evil.example'));
  assert.equal(normalizeEditorBase('http://192.168.1.20:8080').origin, 'http://192.168.1.20:8080');
});

test('clamps editable ranges and enforces render limits', () => {
  assert.deepEqual(clampRange(-500, 80_000, 100_000), [0, 60_000]);
  assert.deepEqual(clampRange(99_950, 100_000, 100_000), [99_900, 100_000]);
  assert.deepEqual(validateRange(10, 60_010, 100_000), [10, 60_010]);
  assert.throws(() => validateRange(0, 60_001, 100_000));
  assert.throws(() => validateRange(10, 10, 100_000));
  assert.throws(() => validateRange(10, 109, 100_000));
});
