import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native';

import { PADS, resolveUri, type Pad } from './src/pads';
import { isWarm, play, stop, warm } from './src/audio/engine';
import { beginTap, pendingCount, startMetrics } from './src/metrics';

type RemoteState = 'warming' | 'ready' | 'failed' | 'unconfigured';

/**
 * M0 playback shell — STEPS.md step 7.
 *
 * Stable 4x4 home board. Positions are frozen on purpose: muscle memory for the
 * sounds used constantly is the whole point (DESIGN §9).
 */
export default function App() {
  const uris = useRef<Map<string, string>>(new Map());
  const [playing, setPlaying] = useState<string | null>(null);
  const [last, setLast] = useState<string>('');
  const [remoteState, setRemoteState] = useState<RemoteState>(
    PADS.some((pad) => pad.uri !== undefined) ? 'warming' : 'unconfigured',
  );

  // Collect tap latencies for as long as the app is up (STEPS step 8).
  useEffect(startMetrics, []);

  // Resolve every asset URI up front so a tap never waits on the filesystem.
  // Remote pads are also fetched and decoded at launch. Keep their controls
  // disabled until this finishes so the first enabled press takes the warm path.
  useEffect(() => {
    let active = true;

    const resolve = async (pad: Pad): Promise<string | null> => {
      try {
        const uri = await resolveUri(pad);
        uris.current.set(pad.id, uri);
        return uri;
      } catch (err) {
        console.warn(`[pads] could not resolve ${pad.id}`, err);
        return null;
      }
    };

    const remotePads = PADS.filter((pad) => pad.uri !== undefined);
    const bundledPads = PADS.filter((pad) => pad.uri === undefined);

    // Bundled resolution does not need to hold up remote warming.
    Promise.all(bundledPads.map(resolve)).catch((err) => {
      console.warn('[pads] bundled asset resolution failed', err);
    });

    const warmRemotePads = async (): Promise<void> => {
      if (remotePads.length === 0) return;

      const remoteUris = await Promise.all(remotePads.map(resolve));
      await Promise.all(remoteUris.filter((uri): uri is string => uri !== null).map(warm));

      if (!active) return;
      const ready = remoteUris.length > 0 && remoteUris.every((uri) => uri !== null && isWarm(uri));
      setRemoteState(ready ? 'ready' : 'failed');
    };

    warmRemotePads().catch((err) => {
      console.warn('[pads] remote preload failed', err);
      if (active) setRemoteState('failed');
    });

    return () => {
      active = false;
    };
  }, []);

  // onPressIn, NOT onPress. onPress fires on release - 100 ms+ of dead air, and
  // the most common reason a soundboard feels sluggish (DESIGN §8).
  const trigger = useCallback((pad: Pad) => {
    const uri = uris.current.get(pad.id);
    if (!uri) return;

    // Opened before anything else, so the clock starts as close to the press
    // as it can get (STEPS step 8).
    const tap = beginTap(pad.id, isWarm(uri));
    setPlaying(pad.id);

    play(uri)
      .then(() => {
        // The header shows the sample that was actually recorded, so what you
        // read on the device is exactly what is in the dataset.
        const s = tap.scheduled();
        setLast(
          `${pad.name}  ${s.pressToScheduledMs.toFixed(0)} ms  ${s.cacheHit ? 'warm' : 'cold'}  ·  ${pendingCount()} buffered`,
        );
      })
      .catch((err) => {
        tap.failed();
        console.warn(`[audio] ${pad.id} failed`, err);
        setLast(`${pad.name}  failed`);
      });
  }, []);

  const kill = useCallback(() => {
    stop();
    setPlaying(null);
  }, []);

  const startupStatus =
    remoteState === 'warming'
      ? 'Preparing REMOTE audio…'
      : remoteState === 'ready'
        ? 'REMOTE preloaded · Worker → private R2'
        : remoteState === 'failed'
          ? 'REMOTE preload failed · tap to retry'
          : 'Bundled pads only · configure the remote clip URL to test R2';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>Soundboard</Text>
        <Text style={styles.meta}>{last || startupStatus}</Text>
      </View>

      <View style={styles.grid}>
        {ROWS.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((pad) => (
              <Pressable
                key={pad.id}
                disabled={pad.uri !== undefined && remoteState === 'warming'}
                onPressIn={() => trigger(pad)}
                style={({ pressed }) => [
                  styles.pad,
                  { backgroundColor: pad.color },
                  pad.uri !== undefined && remoteState === 'warming' && styles.padDisabled,
                  pressed && styles.padPressed,
                ]}
              >
                <Text style={styles.padName}>{pad.name}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      {playing ? (
        <Pressable style={styles.kill} onPress={kill}>
          <Text style={styles.killText}>STOP</Text>
        </Pressable>
      ) : (
        <View style={styles.killPlaceholder} />
      )}
    </SafeAreaView>
  );
}

const GAP = 8;

/** Four rows of four. Frozen positions - muscle memory (DESIGN §9). */
const ROWS = [0, 4, 8, 12].map((i) => PADS.slice(i, i + 4));

const styles = StyleSheet.create({
  // SafeAreaView applies no top inset on Android, so the header would sit
  // under the status bar.
  safe: {
    flex: 1,
    backgroundColor: '#14161a',
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0,
  },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { color: '#f5f6f8', fontSize: 24, fontWeight: '700' },
  meta: { color: '#8b93a1', fontSize: 13, marginTop: 2 },
  grid: { flex: 1, padding: GAP, gap: GAP },
  row: { flex: 1, flexDirection: 'row', gap: GAP },
  pad: {
    flex: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padPressed: { opacity: 0.6 },
  padDisabled: { opacity: 0.45 },
  padName: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  kill: {
    margin: GAP,
    marginTop: 0,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#c4304a',
    alignItems: 'center',
  },
  killText: { color: '#fff', fontWeight: '700', letterSpacing: 2 },
  killPlaceholder: { height: 0 },
});
