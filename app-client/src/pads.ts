import { Asset } from 'expo-asset';

/**
 * The pad list. Pad 1 is the M0 remote-path smoke test through the Cloudflare
 * Worker; the remaining pads stay bundled so remote and local playback can be
 * compared without changing the audio engine.
 */
export interface Pad {
  id: string;
  name: string;
  color: string;
  module?: number;
  uri?: string;
}

const REMOTE_TEST_URI = process.env.EXPO_PUBLIC_REMOTE_CLIP_URL?.trim();

const MODULES = [
  require('../assets/audio/pad-01.m4a'),
  require('../assets/audio/pad-02.m4a'),
  require('../assets/audio/pad-03.m4a'),
  require('../assets/audio/pad-04.m4a'),
  require('../assets/audio/pad-05.m4a'),
  require('../assets/audio/pad-06.m4a'),
  require('../assets/audio/pad-07.m4a'),
  require('../assets/audio/pad-08.m4a'),
  require('../assets/audio/pad-09.m4a'),
  require('../assets/audio/pad-10.m4a'),
  require('../assets/audio/pad-11.m4a'),
  require('../assets/audio/pad-12.m4a'),
  require('../assets/audio/pad-13.m4a'),
  require('../assets/audio/pad-14.m4a'),
  require('../assets/audio/pad-15.m4a'),
  require('../assets/audio/pad-16.m4a'),
];

const NAMES = [
  'C4', 'D4', 'E4', 'F4',
  'G4', 'A4', 'B4', 'C5',
  'D5', 'E5', 'F5', 'G5',
  'A5', 'B5', 'C6', 'D6',
];

const COLORS = [
  '#e05a47', '#e0873f', '#d9b13c', '#8fb141',
  '#4aa06b', '#3f9d92', '#3d87b0', '#4a68c0',
  '#6a56c2', '#8f4fbd', '#b8459f', '#c4407a',
  '#5a6270', '#6b7280', '#7c8695', '#8d97a6',
];

export const PADS: Pad[] = MODULES.map((module, i) => ({
  id: `pad-${String(i + 1).padStart(2, '0')}`,
  name: NAMES[i]!,
  color: COLORS[i]!,
  module,
}));

if (REMOTE_TEST_URI) {
  PADS[0] = {
    id: 'pad-01',
    name: 'REMOTE',
    color: COLORS[0]!,
    uri: REMOTE_TEST_URI,
  };
}

/**
 * Bundled assets are served by Metro over http in dev and live on disk in a
 * release build, so resolve rather than assume. Once clips come from R2 this
 * whole function collapses to returning the manifest URL.
 */
export async function resolveUri(pad: Pad): Promise<string> {
  if (pad.uri) return pad.uri;
  if (pad.module === undefined) {
    throw new Error(`Pad ${pad.id} has neither a remote URI nor a bundled asset`);
  }

  const asset = Asset.fromModule(pad.module);
  if (!asset.localUri) await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}
