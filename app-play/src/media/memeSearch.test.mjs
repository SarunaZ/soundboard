import test from 'node:test';
import assert from 'node:assert/strict';
import { filterMemes, loadPopularMemes } from './memeSearch.ts';

function mockFetch(t, implementation) {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => { globalThis.fetch = original; });
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

const valid = {
  id: '12345', name: '  Distracted\nBoyfriend  ', url: 'https://i.imgflip.com/1abc.jpg', width: 1200, height: 800,
};

test('loads and normalizes valid popular memes while dropping unsafe entries', async (t) => {
  mockFetch(t, async (url, options) => {
    assert.equal(url, 'https://api.imgflip.com/get_memes');
    assert.equal(options.method, 'GET');
    assert.ok(options.signal instanceof AbortSignal);
    return response({ success: true, data: { memes: [valid,
      { ...valid, id: 'xss', name: 'Bad ID' },
      { ...valid, id: '456', url: 'http://i.imgflip.com/a.jpg' },
      { ...valid, id: '789', url: 'https://i.imgflip.com/a.svg' },
      { ...valid, id: '12', width: 20_001 },
      { ...valid, id: '13', width: 10_001, height: 10_001 },
    ] } });
  });
  assert.deepEqual(await loadPopularMemes(), [{
    id: '12345', name: 'Distracted Boyfriend', url: 'https://i.imgflip.com/1abc.jpg', width: 1200, height: 800,
    pageUrl: 'https://imgflip.com/memetemplate/12345',
  }]);
});

test('rejects malformed provider envelopes and unreadable JSON', async (t) => {
  mockFetch(t, async () => response({ success: false, data: { memes: [] } }));
  await assert.rejects(loadPopularMemes(), /invalid meme list/i);
  mockFetch(t, async () => ({ ok: true, status: 200, async json() { throw new Error('broken'); } }));
  await assert.rejects(loadPopularMemes(), /unreadable response/i);
});

test('reports provider rate limits and other HTTP errors clearly', async (t) => {
  mockFetch(t, async () => response({}, 429));
  await assert.rejects(loadPopularMemes(), /rate limiting/i);
  mockFetch(t, async () => response({}, 503));
  await assert.rejects(loadPopularMemes(), /HTTP 503/i);
});

test('converts network failures to a useful offline message', async (t) => {
  mockFetch(t, async () => { throw new TypeError('network down'); });
  await assert.rejects(loadPopularMemes(), /internet connection/i);
});

test('honors cancellation before and during the request', async (t) => {
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  await assert.rejects(loadPopularMemes(alreadyAborted.signal), { name: 'AbortError' });

  mockFetch(t, (_url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  }));
  const controller = new AbortController();
  const pending = loadPopularMemes(controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('filters names case-insensitively while preserving order', () => {
  const items = [
    { ...valid, id: '1', name: 'Distracted Boyfriend' },
    { ...valid, id: '2', name: 'Boyfriend Explaining' },
    { ...valid, id: '3', name: 'Drake Hotline Bling' },
  ];
  assert.deepEqual(filterMemes(items, '  BOYFRIEND '), items.slice(0, 2));
  assert.deepEqual(filterMemes(items, ''), items);
});
