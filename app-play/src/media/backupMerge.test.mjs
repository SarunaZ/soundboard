import assert from 'node:assert/strict';
import test from 'node:test';

import { emptyBoardCollection } from '../data/boardModel.ts';
import { mergePlayBackup } from './backupMerge.ts';

const firstId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const clip = (id, title) => ({ id, title, durationMs: 1200, createdAt: '2026-10-17T00:00:00.000Z', extension: 'wav' });
const prefs = (appearance) => ({ version: 4, appearance, quickAction: 'file', masterVolume: 1 });

test('backup merge retains current IDs, adds missing clips, and imports settings', () => {
  const baseBoards = emptyBoardCollection();
  const importedBoards = structuredClone(baseBoards);
  importedBoards.boards[0].navigation = 'scroll';
  const existing = {
    clips: [clip(firstId, 'Current title')], boards: baseBoards, presentations: {}, playback: { [firstId]: { gain: 1.4, repeat: 'loop' } }, preferences: prefs('Mint'),
  };
  const backup = {
    clips: [clip(firstId, 'Backup title'), clip(secondId, 'New clip')], boards: importedBoards,
    presentations: {}, playback: { [firstId]: { gain: 0, repeat: 'three' }, [secondId]: { gain: 2, repeat: 'once' } }, preferences: prefs('Coffee'),
  };

  const merged = mergePlayBackup(existing, backup);
  assert.deepEqual(merged.clips.map(({ title }) => title), ['Current title', 'New clip']);
  assert.deepEqual(merged.importedClipIds, [secondId]);
  assert.equal(merged.playback[firstId].gain, 1.4);
  assert.deepEqual(merged.playback[secondId], { gain: 2, repeat: 'once' });
  assert.equal(merged.preferences.appearance, 'Coffee');
  assert.equal(merged.boards.boards[0].navigation, 'pages', 'existing board ID wins conflicts');
  assert.equal(merged.boards.activeBoardId, baseBoards.activeBoardId);
});

test('conflicting boards keep both choices and repeated restore deduplicates the imported board', () => {
  const currentBoards = emptyBoardCollection();
  const backupBoards = structuredClone(currentBoards);
  backupBoards.boards[0] = { ...backupBoards.boards[0], name: 'Travel', navigation: 'scroll', grid: '3x4' };
  const current = { clips: [], boards: currentBoards, presentations: {}, playback: {}, preferences: prefs('Mint') };
  const backup = { clips: [], boards: backupBoards, presentations: {}, playback: {}, preferences: prefs('Coffee') };

  const first = mergePlayBackup(current, backup);
  assert.equal(first.boards.boards.length, 2);
  assert.notEqual(first.boards.boards[1].id, backupBoards.boards[0].id);
  assert.deepEqual({ grid: first.boards.boards[1].grid, navigation: first.boards.boards[1].navigation }, { grid: '3x4', navigation: 'scroll' });
  const second = mergePlayBackup(first, backup);
  assert.equal(second.boards.boards.length, 2);
});
