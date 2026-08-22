/**
 * The package ships runtime JS in lib/module and declarations in lib/typescript,
 * with no `exports` map to pair them. We import the compiled runtime (see the
 * note in src/audio/engine.ts), so point TypeScript at the matching declaration.
 *
 * NOTE: a plain `import`, not `import type`. With a type-only import there is no
 * value binding, so `typeof AudioContext` silently resolves to the DOM's
 * AudioContext from lib.dom — giving two different classes with the same name
 * and a pile of "AudioBuffer is not assignable to AudioBuffer" errors.
 */
declare module 'react-native-audio-api/lib/module/core/AudioContext' {
  import AudioContext from 'react-native-audio-api/lib/typescript/core/AudioContext';
  export default AudioContext;
}
