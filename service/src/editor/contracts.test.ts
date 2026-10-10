import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeYouTubeUrl, validateTrim } from './contracts.js';

test('canonicalizes only supported single-video YouTube URLs', () => {
  const id = 'aB_cD-12345';
  assert.equal(canonicalizeYouTubeUrl(`https://youtube.com/watch?v=${id}&feature=share`), `https://www.youtube.com/watch?v=${id}`);
  assert.equal(canonicalizeYouTubeUrl(`https://youtu.be/${id}?si=tracking`), `https://www.youtube.com/watch?v=${id}`);
  assert.equal(canonicalizeYouTubeUrl(`https://www.youtube.com/shorts/${id}`), `https://www.youtube.com/watch?v=${id}`);
  assert.equal(canonicalizeYouTubeUrl('http://www.youtube.com/watch?v=OjNpRbNdR7E&list=RDOjNpRbNdR7E'), 'https://www.youtube.com/watch?v=OjNpRbNdR7E');
  assert.equal(canonicalizeYouTubeUrl('  http://www.youtube.com/watch?v=OjNpRbNdR7E&list=RDOjNpRbNdR7E  '), 'https://www.youtube.com/watch?v=OjNpRbNdR7E');
  assert.equal(canonicalizeYouTubeUrl('https://www.youtube.com/shorts/jlPQtJXy9t8'), 'https://www.youtube.com/watch?v=jlPQtJXy9t8');
  assert.equal(canonicalizeYouTubeUrl(`http://youtube.com/watch?v=${id}&list=PL123&index=2&si=tracking`), `https://www.youtube.com/watch?v=${id}`);
  assert.equal(canonicalizeYouTubeUrl(`https://www.youtube.com/shorts/${id}/?list=PL123&t=12`), `https://www.youtube.com/watch?v=${id}`);
  assert.equal(canonicalizeYouTubeUrl(`https://youtu.be/${id}?list=PL123&si=tracking`), `https://www.youtube.com/watch?v=${id}`);
});

test('rejects malformed, custom, credentialed, playlist-only, and unsupported URLs', () => {
  const invalid = [
    'not a url',
    'https://youtube.com.evil.test/watch?v=aB_cD-12345',
    'https://youtube.com/playlist?list=PL123',
    'https://youtube.com/watch?list=PL123',
    'https://youtube.com/watch?v=aB_cD-12345&v=aB_cD-12345',
    'https://youtube.com/watch?v=short',
    'https://youtube.com/watch?v=bad%2Fid1234',
    'https://user:pass@youtube.com/watch?v=aB_cD-12345',
    'https://youtube.com:8443/watch?v=aB_cD-12345',
    'https://youtube.com:443/watch?v=aB_cD-12345',
    '  https://youtube.com:443/watch?v=aB_cD-12345  ',
    'https:\\youtube.com:443/watch?v=aB_cD-12345',
    'ftp://youtube.com/watch?v=aB_cD-12345',
    'https://youtube.com/embed/aB_cD-12345',
    'https://m.youtube.com/watch?v=aB_cD-12345',
  ];
  for (const url of invalid) {
    try { canonicalizeYouTubeUrl(url); assert.fail(`accepted invalid URL: ${url}`); }
    catch (error) { if (error instanceof assert.AssertionError) throw error; }
  }
});

test('bounds trim ranges in integer milliseconds', () => {
  assert.deepEqual(validateTrim(250, 2_250, 10_000), { startMs: 250, endMs: 2_250 });
  for (const [start, end] of [[-1, 100], [0, 99], [0, 60_001], [9_900, 10_001], [1.5, 500]]) {
    assert.throws(() => validateTrim(start, end, 10_000));
  }
});
