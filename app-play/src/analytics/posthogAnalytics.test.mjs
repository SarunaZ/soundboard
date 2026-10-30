import assert from 'node:assert/strict';
import test from 'node:test';
import { PostHogAnalyticsTransport, sanitizePostHogBatchBody } from './posthogAnalytics.ts';

const token = 'phc_1234567890abcdef';
const installId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('actual @posthog/core stateless client sends only approved opt-in events to EU batch endpoint', async () => {
  const calls = [];
  let current = true;
  const transport = await PostHogAnalyticsTransport.create(token, installId, 7, (epoch) => current && epoch === 7, async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { status: 200, text: async () => '', json: async () => ({}) };
  });

  assert.equal(calls.length, 0, 'constructing and opting in must not request flags, config, lifecycle, or other endpoints');
  transport.enqueue('creation_started', { source: 'file' }, installId, 7);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  const sent = calls[0];
  const endpoint = new URL(sent.url);
  assert.equal(endpoint.origin, 'https://eu.i.posthog.com');
  assert.equal(endpoint.pathname, '/batch/');
  assert.equal(endpoint.search, '');
  assert.equal(sent.init.method, 'POST');
  assert.deepEqual(Object.keys(sent.body), ['api_key', 'batch']);
  assert.equal(sent.body.api_key, token);
  assert.equal(sent.body.batch.length, 1);
  assert.equal(sent.body.batch[0].distinct_id, installId);
  assert.deepEqual(sent.body.batch[0].properties, { source: 'file', $geoip_disable: true, $process_person_profile: false });
  assert.equal(Object.hasOwn(sent.body.batch[0].properties, '$lib'), false);
  assert.equal(Object.hasOwn(sent.body.batch[0].properties, '$geoip_disable'), true);
  assert.equal(Object.hasOwn(sent.body.batch[0].properties, '$process_person_profile'), true);

  transport.enqueue('creation_started', { source: 'file', query: 'private' }, installId, 7);
  transport.enqueue('creation_started', { source: { toString: () => 'file' } }, installId, 7);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1, 'malformed, nonprimitive, or sensitive input is rejected before it reaches the SDK queue');

  current = false;
  await transport.revoke();
  transport.enqueue('creation_started', { source: 'mic' }, installId, 7);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1, 'revoked transport does not send or retain later events');
});

test('revoke aborts an in-flight request and blocks retries after the original request settles', async () => {
  let resolveFetch;
  let requestSignal;
  const calls = [];
  let current = true;
  const transport = await PostHogAnalyticsTransport.create(token, installId, 8, (epoch) => current && epoch === 8, (url, init) => {
    calls.push(url);
    requestSignal = init.signal;
    return new Promise((resolve) => { resolveFetch = resolve; });
  });
  transport.enqueue('creation_started', { source: 'device' }, installId, 8);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  current = false;
  await transport.revoke();
  assert.equal(requestSignal.aborted, true);
  resolveFetch({ status: 200, text: async () => '', json: async () => ({}) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1, 'fetchRetryCount is zero and a closed gate cannot dispatch');
});

test('final envelope sanitizer rejects sensitive fields and expires buffered events', () => {
  const now = Date.now();
  const item = (timestamp, properties) => ({ event: 'creation_started', distinct_id: installId, timestamp, properties, uuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
  const input = JSON.stringify({ api_key: token, batch: [
    item(new Date(now).toISOString(), { source: 'mic', file_path: '/private/audio.wav' }),
    item(new Date(now - 24 * 60 * 60 * 1000 - 1).toISOString(), { source: 'file' }),
    item(new Date(now + 60_000).toISOString(), { source: 'file' }),
    item(new Date(now).toISOString(), { source: { toString: () => 'file' } }),
  ], sent_at: 'not-allowed', distinct_id: installId });
  const filtered = JSON.parse(sanitizePostHogBatchBody(input, token, installId, now));
  assert.equal(filtered.batch.length, 1, 'only the fresh event with allowlisted primitive properties remains');
  assert.deepEqual(filtered.batch[0].properties, { source: 'mic', $geoip_disable: true, $process_person_profile: false });

  const valid = JSON.stringify({ api_key: token, batch: [item(new Date(now).toISOString(), { source: 'mic', private: 'drop me' })], extra: 'drop me' });
  const clean = JSON.parse(sanitizePostHogBatchBody(valid, token, installId, now));
  assert.deepEqual(Object.keys(clean), ['api_key', 'batch']);
  assert.deepEqual(clean.batch[0].properties, { source: 'mic', $geoip_disable: true, $process_person_profile: false });
});
