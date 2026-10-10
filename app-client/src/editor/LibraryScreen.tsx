import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { deleteLocalClip, loadLocalClips, type LocalClip } from './library';
import { formatTime } from './WaveformRange';

export function LibraryScreen({ onBack }: { onBack: () => void }) {
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [clips, setClips] = useState<LocalClip[]>([]);
  const [error, setError] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);

  const reload = useCallback(() => {
    try {
      setClips(loadLocalClips());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read the on-device library.');
    }
  }, []);

  useEffect(() => {
    reload();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        try { player.pause(); } catch { /* The player may be releasing during navigation. */ }
        setPlayingId(null);
      }
    });
    return () => {
      subscription.remove();
    };
  }, [player, reload]);

  useEffect(() => {
    if (status.error) setError(`Audio playback failed: ${status.error}`);
  }, [status.error]);

  const playClip = (clip: LocalClip) => {
    try {
      if (playingId === clip.id && status.playing) {
        player.pause();
        setPlayingId(null);
        return;
      }
      player.pause();
      player.replace({ uri: clip.uri, name: clip.title });
      player.play();
      setPlayingId(clip.id);
    } catch {
      setError(`Could not play “${clip.title}”. The audio file may be damaged.`);
    }
  };

  const confirmDelete = (clip: LocalClip) => {
    Alert.alert('Delete local clip?', `“${clip.title}” will be removed from this device.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            if (playingId === clip.id) {
              player.pause();
              setPlayingId(null);
            }
            deleteLocalClip(clip.id);
            reload();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not delete this clip.');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹  EDITOR</Text></Pressable>
        <Text style={styles.eyebrow}>ON THIS DEVICE</Text>
        <Text style={styles.heading}>Your library</Text>
        <Text style={styles.subheading}>Saved sounds play offline and stay separate from the 4 × 4 board.</Text>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {!clips.length && !error ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Text style={styles.emptyWave}>∿</Text></View>
            <Text style={styles.emptyTitle}>No saved clips yet</Text>
            <Text style={styles.emptyBody}>Trim a YouTube moment in the editor and save it here for offline playback.</Text>
          </View>
        ) : null}
        {clips.map((clip, index) => {
          const active = playingId === clip.id && status.playing;
          return (
            <View key={clip.id} style={styles.row}>
              <View style={styles.index}><Text style={styles.indexText}>{String(index + 1).padStart(2, '0')}</Text></View>
              <View style={styles.copy}>
                <Text style={styles.clipTitle} numberOfLines={1}>{clip.title}</Text>
                <Text style={[styles.meta, clip.missing && styles.missing]}>{clip.missing ? 'AUDIO FILE MISSING · DELETE ENTRY' : `${formatTime(clip.durationMs)} · SAVED OFFLINE`}</Text>
              </View>
              <Pressable accessibilityRole="button" disabled={clip.missing} accessibilityLabel={`${active ? 'Stop' : 'Play'} ${clip.title}`} onPress={() => playClip(clip)} style={[styles.play, clip.missing && styles.disabled]}>
                <Text style={styles.playText}>{active ? 'Ⅱ' : '▶'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${clip.title}`} onPress={() => confirmDelete(clip)} style={styles.delete}>
                <Text style={styles.deleteText}>×</Text>
              </Pressable>
            </View>
          );
        })}
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.createButton}><Text style={styles.createText}>＋  MAKE ANOTHER SOUND</Text></Pressable>
        <Text style={styles.storage}>Stored in private app storage. These files are not exported to Downloads and are removed if the app is uninstalled.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#14161a' },
  header: { paddingHorizontal: 18, paddingTop: 19, paddingBottom: 20, borderBottomWidth: 1, borderColor: '#252b30' },
  back: { alignSelf: 'flex-start', paddingVertical: 7, paddingRight: 10, marginBottom: 12 },
  backText: { color: '#87e6c3', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  eyebrow: { color: '#7ddcb8', letterSpacing: 2.1, fontSize: 10, fontWeight: '700' },
  heading: { color: '#f4f5f6', fontSize: 28, fontWeight: '700', marginTop: 2 },
  subheading: { color: '#8f999f', fontSize: 12, lineHeight: 18, marginTop: 5 },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 58, paddingHorizontal: 26 },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: '#1b2d29', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyWave: { color: '#72e0b9', fontSize: 36, fontWeight: '700' },
  emptyTitle: { color: '#eef1f2', fontSize: 17, fontWeight: '600' },
  emptyBody: { color: '#818c93', fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 12, gap: 10, minHeight: 72, borderRadius: 14, backgroundColor: '#1a1e23', borderWidth: 1, borderColor: '#272e33' },
  index: { width: 35, height: 35, borderRadius: 11, backgroundColor: '#23352f', alignItems: 'center', justifyContent: 'center' },
  indexText: { color: '#8fe6c6', fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },
  copy: { flex: 1, gap: 5 },
  clipTitle: { color: '#eef1f2', fontSize: 14, fontWeight: '600' },
  meta: { color: '#839097', fontSize: 9, letterSpacing: 0.8, fontVariant: ['tabular-nums'] },
  missing: { color: '#f49aa2' },
  disabled: { opacity: 0.35 },
  play: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#29332f', alignItems: 'center', justifyContent: 'center' },
  playText: { color: '#9ef0d2', fontSize: 14, fontWeight: '700' },
  delete: { width: 31, height: 38, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#899399', fontSize: 24, fontWeight: '300' },
  createButton: { marginTop: 5, borderRadius: 12, paddingVertical: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#45534f', alignItems: 'center' },
  createText: { color: '#a4e8ce', fontSize: 10, letterSpacing: 1.1, fontWeight: '700' },
  error: { color: '#ff9ba7', fontSize: 13, lineHeight: 20, backgroundColor: '#361f25', borderRadius: 10, padding: 12 },
  storage: { color: '#667178', fontSize: 10, lineHeight: 16, textAlign: 'center', paddingHorizontal: 18, paddingTop: 10 },
});
