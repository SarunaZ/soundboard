import assert from 'node:assert/strict';
import test from 'node:test';
import { ANALYTICS_DIAGNOSTICS_PREFIX, PRODUCT_ANALYTICS_DIAGNOSTICS_ENABLED, emitAnalyticsDiagnostic } from './diagnostics.ts';

test('diagnostics are disabled by default unless the explicit Expo build flag is true', () => {
  assert.equal(PRODUCT_ANALYTICS_DIAGNOSTICS_ENABLED, process.env.EXPO_PUBLIC_PRODUCT_ANALYTICS_DIAGNOSTICS === 'true');
  const lines = [];
  emitAnalyticsDiagnostic({ kind: 'gate', open: true }, false, (line) => lines.push(line));
  assert.deepEqual(lines, []);
});

test('enabled diagnostics retain only approved fields and never print IDs, tokens, paths, or raw values', () => {
  const lines = [];
  emitAnalyticsDiagnostic({
    kind: 'dispatch', events: ['creation_started', 'untrusted-event'],
    propertyKeys: ['source', 'file_path', 'query', '$geoip_disable', '$process_person_profile'],
    geoipDisabled: true, profileProcessing: false,
    token: 'phc-private-token', installId: 'aaaaaaaa-private-id', body: '/private/audio.wav', responseText: 'sensitive response',
  }, true, (line) => lines.push(line));
  assert.equal(lines.length, 1);
  assert.ok(lines[0].startsWith(`${ANALYTICS_DIAGNOSTICS_PREFIX} `));
  assert.ok(lines[0].includes('"events":["creation_started"]'));
  assert.ok(lines[0].includes('"propertyKeys":["$geoip_disable","$process_person_profile","source"]'));
  assert.ok(lines[0].includes('"geoipDisabled":true'));
  assert.ok(lines[0].includes('"profileProcessing":false'));
  for (const privateValue of ['phc-private-token', 'aaaaaaaa-private-id', '/private/audio.wav', 'sensitive response', 'file_path', 'query', 'untrusted-event']) {
    assert.equal(lines[0].includes(privateValue), false, `diagnostic output contained ${privateValue}`);
  }
});

test('the analytics activation policy failure has a bounded diagnostic reason', () => {
  const lines = [];
  emitAnalyticsDiagnostic({ kind: 'failure', reason: 'policy', details: 'unreviewed eligibility data' }, true, (line) => lines.push(line));
  assert.equal(lines.length, 1);
  assert.equal(lines[0], `${ANALYTICS_DIAGNOSTICS_PREFIX} {"kind":"failure","reason":"policy"}`);
});
