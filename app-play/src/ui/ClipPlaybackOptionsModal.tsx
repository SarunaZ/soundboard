import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getClipPlaybackPreference, setClipPlaybackPreference, type ClipRepeat } from '../data/clipPlayback';
import { PLAYBACK_BOOST_AVAILABLE } from '../media/playbackEngine';
import { playbackGainFromControl } from '../media/playbackDsp';
import { ActionButton, Panel } from './controls';
import { Icon } from './Icons';
import type { Theme } from './theme';

const repeats: Array<{ value: ClipRepeat; label: string }> = [
  { value: 'once', label: 'Once' }, { value: 'loop', label: 'Loop' }, { value: 'three', label: '3 times' },
];

export function ClipPlaybackOptionsModal({ visible, soundId, soundName, theme, onClose }: {
  visible: boolean; soundId: string | null; soundName?: string; theme: Theme; onClose: () => void;
}) {
  const [gain, setGain] = useState(1);
  const [repeat, setRepeat] = useState<ClipRepeat>('once');
  const [railWidth, setRailWidth] = useRailWidth();
  const [original, setOriginal] = useState<{ gain: number; repeat: ClipRepeat }>({ gain: 1, repeat: 'once' });
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    if (!visible || !soundId) return;
    try {
      const saved = getClipPlaybackPreference(soundId);
      setOriginal(saved); setGain(saved.gain); setRepeat(saved.repeat); setEdited(false);
    } catch (error) { Alert.alert('Could not read playback options', error instanceof Error ? error.message : 'Try again.'); onClose(); }
  }, [visible, soundId, onClose]);
  const setAndSaveGain = (value: number) => {
    const next = Math.max(0, Math.min(PLAYBACK_BOOST_AVAILABLE ? 2 : 1, Math.round(value * 20) / 20));
    setGain(next); setEdited(true);
  };
  const setAndSaveRepeat = (value: ClipRepeat) => {
    setRepeat(value); setEdited(true);
  };
  function save() {
    if (!soundId || !edited) { onClose(); return; }
    try { setClipPlaybackPreference(soundId, { gain, repeat }); onClose(); }
    catch (error) { Alert.alert('Could not save playback options', error instanceof Error ? error.message : 'Try again.'); }
  }
  function cancel() { setGain(original.gain); setRepeat(original.repeat); setEdited(false); onClose(); }
  const percent = Math.round(gain * 100);
  const actualGain = playbackGainFromControl(gain, PLAYBACK_BOOST_AVAILABLE);
  const decibels = actualGain > 0 ? (20 * Math.log10(actualGain)).toFixed(2) : '−∞';
  const maximum = PLAYBACK_BOOST_AVAILABLE ? 200 : 100;
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel} accessibilityViewIsModal>
    <View style={styles.scrim}><Pressable style={StyleSheet.absoluteFill} onPress={cancel} accessibilityRole="button" accessibilityLabel="Close playback options" />
      <Panel theme={theme} style={styles.panel}>
       <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={[styles.soundIcon, { backgroundColor: theme.surfaceAlt }]}><Icon name="music" size={22} color={theme.accent} /></View>
          <View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: theme.accent, fontSize: 10, letterSpacing: 1.1, fontWeight: '900' }}>SOUND PLAYBACK</Text><Text accessibilityRole="header" numberOfLines={2} style={{ color: theme.text, fontSize: 21, lineHeight: 26, fontWeight: '900', marginTop: 2 }}>{soundName || 'Sound'}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close playback options" onPress={cancel} style={styles.close}><Text style={{ color: theme.text, fontSize: 24 }}>×</Text></Pressable>
        </View>
        <View style={styles.headingRow}><Text style={{ color: theme.text, fontWeight: '800' }}>Sound volume & boost</Text><Text accessibilityLiveRegion="polite" style={{ color: theme.accent, fontWeight: '900' }}>{percent}%</Text></View>
        <View style={styles.sliderRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Decrease sound volume" onPress={() => setAndSaveGain(gain - 0.05)} style={[styles.step, { backgroundColor: theme.surfaceAlt }]}><Text style={{ color: theme.text, fontSize: 22, fontWeight: '700' }}>−</Text></Pressable>
          <View accessibilityRole="adjustable" accessibilityLabel="Sound volume" accessibilityValue={{ min: 0, max: maximum, now: Math.min(percent, maximum), text: `${percent} percent${percent > maximum ? ', saved boost pending validation' : ''}` }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={(event) => setAndSaveGain(gain + (event.nativeEvent.actionName === 'increment' ? 0.05 : -0.05))}
            onTouchMove={(event) => { const x = Math.max(0, Math.min(1, event.nativeEvent.locationX / Math.max(1, railWidth))); setAndSaveGain((x * maximum) / 100); }} onTouchEnd={(event) => { const x = Math.max(0, Math.min(1, event.nativeEvent.locationX / Math.max(1, railWidth))); setAndSaveGain((x * maximum) / 100); }} onLayout={(event) => setRailWidth(event.nativeEvent.layout.width)} style={[styles.rail, { backgroundColor: theme.surfaceAlt }]}>
            <View pointerEvents="none" style={[styles.railFill, { width: `${Math.min(100, percent / maximum * 100)}%`, backgroundColor: theme.accent }]} /><View pointerEvents="none" style={[styles.thumb, { left: `${Math.min(100, percent / maximum * 100)}%`, borderColor: theme.surface, backgroundColor: theme.accent }]} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Increase sound volume" onPress={() => setAndSaveGain(gain + 0.05)} style={[styles.step, { backgroundColor: theme.surfaceAlt }]}><Text style={{ color: theme.text, fontSize: 22, fontWeight: '700' }}>+</Text></Pressable>
        </View>
        <View style={styles.presets}>{[
          { value: 0, label: '0% · mute' },
          { value: 1, label: '100% · original' },
          { value: 2, label: '200% · +12 dB' },
        ].map((preset) => <Pressable key={preset.value}
          accessibilityRole="button"
          accessibilityLabel={`Set sound volume to ${preset.value * 100} percent`}
          accessibilityState={{ selected: gain === preset.value, disabled: preset.value > maximum / 100 }}
          disabled={preset.value > maximum / 100}
          onPress={() => setAndSaveGain(preset.value)}
          style={[styles.preset, { backgroundColor: gain === preset.value ? theme.accent : theme.surfaceAlt, opacity: preset.value > maximum / 100 ? 0.45 : 1 }]}>
          <Text style={{ color: gain === preset.value ? '#fff' : theme.text, fontSize: 11, fontWeight: '800', textAlign: 'center' }}>{preset.label}</Text>
        </Pressable>)}</View>
        <Text accessibilityLiveRegion="polite" style={{ color: theme.muted, fontSize: 12 }}>{gain > 0 ? `${decibels} dB` : 'Muted'}</Text>
        {percent > maximum ? <Text style={{ color: theme.muted, fontSize: 12 }}>This saved boost value is retained. Editing volume will use the verified range.</Text> : null}
        {!PLAYBACK_BOOST_AVAILABLE ? <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17 }}>Boost above 100% is disabled until device audio checks are complete. Saved boost values are kept.</Text> : null}
        {PLAYBACK_BOOST_AVAILABLE ? <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17 }}>Quiet audio is amplified, peaks are protected, and your phone’s hardware volume stays independent.</Text> : null}
        {PLAYBACK_BOOST_AVAILABLE && gain > 1 ? <Text accessibilityRole="alert" style={{ color: theme.danger, fontSize: 12, lineHeight: 17, fontWeight: '700' }}>Boost can make playback uncomfortably loud or sound distorted. Lower your phone volume before listening.</Text> : null}
        <View style={[styles.sectionDivider, { backgroundColor: theme.border }]} />
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '900' }}>Repeat</Text>
        <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17, marginTop: -7 }}>Choose what happens when this sound ends.</Text>
        <View style={styles.repeats}>{repeats.map((option) => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: repeat === option.value }} onPress={() => setAndSaveRepeat(option.value)} style={[styles.repeat, { backgroundColor: repeat === option.value ? theme.accent : theme.surfaceAlt }]}><Text style={{ color: repeat === option.value ? '#fff' : theme.text, fontWeight: '800', textAlign: 'center' }}>{option.label}</Text></Pressable>)}</View>
        </ScrollView>
        <View style={styles.actions}><ActionButton label="Cancel" onPress={cancel} theme={theme} variant="secondary" buttonStyle={styles.actionButton} /><ActionButton label="Save options" onPress={save} theme={theme} variant="primary" buttonStyle={styles.actionButton} /></View>
      </Panel>
    </View>
  </Modal>;
}

function useRailWidth() {
  const [railWidth, setRailWidth] = useState(0);
  return [railWidth, setRailWidth] as const;
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: 'rgba(0,0,0,0.62)' }, panel: { width: '100%', maxWidth: 440, maxHeight: '92%', alignSelf: 'center', gap: 12 }, content: { gap: 12 }, actions: { flexDirection: 'row', gap: 8 }, actionButton: { flex: 1, minWidth: 0, paddingHorizontal: 8 }, header: { flexDirection: 'row', alignItems: 'center', gap: 10 }, soundIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32, gap: 8 }, sectionDivider: { height: StyleSheet.hairlineWidth, marginTop: 3 }, sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, step: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, rail: { height: 48, flex: 1, borderRadius: 24, justifyContent: 'center', overflow: 'visible' }, railFill: { position: 'absolute', left: 0, top: 20, height: 8, borderRadius: 4 }, thumb: { position: 'absolute', top: 13, marginLeft: -14, width: 28, height: 28, borderRadius: 14, borderWidth: 3 }, presets: { flexDirection: 'row', gap: 6 }, preset: { flex: 1, minWidth: 0, minHeight: 48, borderRadius: 12, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' }, repeats: { flexDirection: 'row', gap: 8 }, repeat: { flex: 1, minHeight: 48, borderRadius: 12, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
});
