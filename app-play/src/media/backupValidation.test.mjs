import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const appPlayRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(appPlayRoot, '..');
const clipId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function loadValidator(t) {
  const temp = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? '.', 'play-backup-validation-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const stubPath = join(temp, 'schema-stubs.mjs');
  await writeFile(stubPath, `
export function parseClipPlaybackPreferences(v){if(v.version!==1||!v.clips||typeof v.clips!=='object')throw Error('invalid playback');return v.clips}
export function parsePresentations(v){if(v.version!==1||!v.clips||typeof v.clips!=='object')throw Error('invalid presentations');return{version:1,clips:v.clips}}
export function parsePlayPreferences(v){if(!v||v.version!==4||!['Peach','Mint','Snow','Ice','Vanilla','Coffee'].includes(v.appearance)||typeof v.quickAction!=='string'||typeof v.masterVolume!=='number')throw Error('invalid settings');return v}
`);
  const stubUrl = pathToFileURL(stubPath).href;
  const sourcePath = join(temp, 'backupValidation.ts');
  let source = await readFile(join(appPlayRoot, 'src/media/backupValidation.ts'), 'utf8');
  source = source.replace("from '../data/boardModel.ts'", `from '${pathToFileURL(join(appPlayRoot, 'src/data/boardModel.ts')).href}'`)
    .replace("from '../data/clipPlayback.ts'", `from '${stubUrl}'`)
    .replace("from '../data/catalog.ts'", `from '${pathToFileURL(join(appPlayRoot, 'src/data/catalog.ts')).href}'`)
    .replace("from '../data/presentation.ts'", `from '${stubUrl}'`)
    .replace("from '../data/preferences.ts'", `from '${stubUrl}'`)
    .replace("from '../data/protocol.ts'", `from '${pathToFileURL(join(appPlayRoot, 'src/data/protocol.ts')).href}'`)
    .replaceAll("from './backupMerge.ts'", `from '${pathToFileURL(join(appPlayRoot, 'src/media/backupMerge.ts')).href}'`);
  await writeFile(sourcePath, source);
  return import(pathToFileURL(sourcePath).href);
}

function validManifest() {
  return {
    format: 'stimmyz-play-backup', version: 1,
    clips: [{ id: clipId, title: 'Fixture', durationMs: 1200, createdAt: '2026-10-17T00:00:00.000Z', extension: 'wav' }],
    boards: { version: 1, activeBoardId: '00000000-0000-4000-8000-000000000001', boards: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Main', pads: [{ id: '00000000-0000-4000-8000-000000000001', clipId: null }], grid: '4x4', navigation: 'pages', allowOverlap: false }] },
    presentations: {}, playback: {}, preferences: { version: 4, appearance: 'Mint', quickAction: 'file', masterVolume: 1 },
    files: [{ name: `${clipId}.wav`, sizeBytes: 10, crc32: 1234, kind: 'audio' }],
  };
}

test('backup manifest validates legacy board defaults and bounded matching media metadata', async (t) => {
  const { parsePlayBackupManifest } = await loadValidator(t);
  const manifest = validManifest();
  delete manifest.boards.boards[0].grid;
  delete manifest.boards.boards[0].navigation;
  delete manifest.boards.boards[0].allowOverlap;
  const parsed = parsePlayBackupManifest(manifest);
  assert.deepEqual({ grid: parsed.boards.boards[0].grid, navigation: parsed.boards.boards[0].navigation, allowOverlap: parsed.boards.boards[0].allowOverlap }, { grid: '4x4', navigation: 'pages', allowOverlap: false });
  assert.throws(() => parsePlayBackupManifest({ ...validManifest(), files: [{ ...validManifest().files[0], name: '../escape.wav' }] }), /unsafe name/);
  assert.throws(() => parsePlayBackupManifest({ ...validManifest(), files: [{ ...validManifest().files[0], sizeBytes: 32 * 1024 * 1024 + 1 }] }), /invalid metadata/);
  assert.throws(() => parsePlayBackupManifest({ ...validManifest(), files: [] }), /missing one or more clip files/);
});

test('backup manifest rejects dangling playback metadata and board references', async (t) => {
  const { parsePlayBackupManifest } = await loadValidator(t);
  assert.throws(() => parsePlayBackupManifest({ ...validManifest(), playback: { 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb': { gain: 1, repeat: 'once' } } }), /settings for missing clip/);
  const invalidBoard = validManifest();
  invalidBoard.boards.boards[0].pads[0].clipId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  assert.throws(() => parsePlayBackupManifest(invalidBoard), /references a clip missing/);
});
