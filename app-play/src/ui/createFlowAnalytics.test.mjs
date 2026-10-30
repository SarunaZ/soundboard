import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreateFlowAnalytics } from './createFlowAnalytics.ts';

test('a flow starts and views trim once while save describes the final adopted source', () => {
  let epoch = 3;
  const events = [];
  const flow = createCreateFlowAnalytics(3, () => epoch, (event, properties) => events.push([event, properties]));

  flow.start('file');
  flow.adopt('file');
  flow.start('mic');
  flow.trimViewed();
  flow.trimViewed();
  flow.adopt('mic');
  flow.trimViewed();
  flow.trimViewed();
  flow.saved(12, 'gallery');
  flow.saved(12, 'gallery');

  assert.deepEqual(events, [
    ['creation_started', { source: 'file' }],
    ['trim_viewed', { source: 'file' }],
    ['sound_saved', { source: 'mic', clip_duration_bucket: '6_15', artwork: 'gallery' }],
  ]);
});

test('flows opened before consent or under a revoked epoch never emit later events', () => {
  let epoch = null;
  const events = [];
  const beforeConsent = createCreateFlowAnalytics(null, () => epoch, (event, properties) => events.push([event, properties]));
  beforeConsent.start('mic');
  beforeConsent.adopt('mic');
  epoch = 1;
  beforeConsent.trimViewed();
  beforeConsent.saved(5, 'default');

  const optedInFlow = createCreateFlowAnalytics(1, () => epoch, (event, properties) => events.push([event, properties]));
  optedInFlow.start('device');
  optedInFlow.adopt('device');
  epoch = null;
  optedInFlow.failed('capture', 'capture_failed');
  epoch = 2;
  optedInFlow.recordingCompleted('device', 4);

  assert.deepEqual(events, [['creation_started', { source: 'device' }]]);
});

test('recording duration is bucketed only after a finite successful capture callback', () => {
  let epoch = 8;
  const events = [];
  const flow = createCreateFlowAnalytics(8, () => epoch, (event, properties) => events.push([event, properties]));
  flow.start('device');
  flow.recordingCompleted('device', 5.01);
  flow.recordingCompleted('device', Number.NaN);

  assert.deepEqual(events, [
    ['creation_started', { source: 'device' }],
    ['recording_completed', { source: 'device', duration_bucket: '6_15' }],
  ]);
});

test('a cancelled source attempt can fail without locking the next selected source', () => {
  let epoch = 4;
  const events = [];
  const flow = createCreateFlowAnalytics(4, () => epoch, (event, properties) => events.push([event, properties]));
  flow.failed('import', 'unknown', 'file');
  flow.start('mic');
  flow.adopt('mic');

  assert.deepEqual(events, [
    ['creation_failed', { source: 'file', stage: 'import', error_class: 'unknown' }],
    ['creation_started', { source: 'mic' }],
  ]);
});

test('permission denial after a source action is visible as a started flow and failure', () => {
  let epoch = 9;
  const events = [];
  const flow = createCreateFlowAnalytics(9, () => epoch, (event, properties) => events.push([event, properties]));
  flow.start('mic');
  flow.start('mic');
  flow.adopt('file');
  flow.failed('permission', 'permission_denied', 'mic');

  assert.deepEqual(events, [
    ['creation_started', { source: 'mic' }],
    ['creation_failed', { source: 'mic', stage: 'permission', error_class: 'permission_denied' }],
  ]);
});
