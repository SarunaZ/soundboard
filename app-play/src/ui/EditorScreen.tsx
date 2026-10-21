import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActionButton, GradientFill } from './controls';
import { Icon } from './Icons';
import type { Theme } from './theme';
import { isDeviceAudioCaptureSupported } from '../media/deviceAudioCapture';

export function EditorScreen({ theme, onCreate }: { theme: Theme; onCreate: (initialAction: 'file' | 'record' | 'device-audio') => void }) {
  const deviceAudioSupported = isDeviceAudioCaptureSupported();
  return <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.heading}>
      <Text style={[styles.title, { color: theme.text }]}>Make a sound <Text style={{ color: '#BC42FA' }}>✦</Text></Text>
      <Text style={[styles.subtitle, { color: theme.muted }]}>Capture the moment. Turn it into a button.</Text>
    </View>

    <View style={[styles.hero, { borderColor: theme.accent, backgroundColor: theme.surface }]}>
      <GradientFill colors={theme.softGradient} vertical />
      <View style={styles.kicker}><View style={styles.liveDot} /><Text style={{ color: theme.accent, fontSize: 10, fontWeight: '900', letterSpacing: 0.45 }}>RECORD WHAT’S PLAYING</Text></View>
      <View style={styles.heroIcon}><Icon name="device-audio" size={48} color="#FFFFFF" /></View>
      <Text style={[styles.heroTitle, { color: theme.text }]}>Record device audio</Text>
      <View style={styles.steps}>
        <Text style={[styles.step, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>Start</Text>
        <Text style={[styles.stepArrow, { color: theme.accent }]}>→</Text>
        <Text style={[styles.step, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>Play moment</Text>
        <Text style={[styles.stepArrow, { color: theme.accent }]}>→</Text>
        <Text style={[styles.step, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>Stop &amp; trim</Text>
      </View>
      <View style={styles.primary}>
        <ActionButton label="Record device audio" onPress={() => { if (deviceAudioSupported) onCreate('device-audio'); }} theme={theme} variant="primary" disabled={!deviceAudioSupported} buttonStyle={{ minHeight: 59 }} />
      </View>
      <Text style={[styles.compatibility, { color: theme.muted }]}>{deviceAudioSupported ? 'Works with compatible apps · Android will ask for permission' : 'Device audio recording is unavailable on this device'}</Text>
    </View>

    <Text style={[styles.sectionLabel, { color: theme.muted }]}>OTHER WAYS TO ADD A SOUND</Text>
    <SourceOption theme={theme} icon="mic" title="Record your voice" detail="Use your microphone" onPress={() => onCreate('record')} />
    <SourceOption theme={theme} icon="file" title="Import audio or video" detail="Choose a file already on your phone" onPress={() => onCreate('file')} />
    {Platform.OS === 'android' && Number(Platform.Version) < 29 ? <Text style={[styles.compatibility, styles.unsupported, { color: theme.muted }]}>Device audio recording requires Android 10 or later. Microphone recording and file import are still available.</Text> : null}
  </ScrollView>;
}

function SourceOption({ theme, icon, title, detail, onPress }: { theme: Theme; icon: 'mic' | 'file'; title: string; detail: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} style={({ pressed }) => [styles.option, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.78 : 1 }]}>
    <View style={[styles.optionIcon, { backgroundColor: theme.surfaceAlt }]}><Icon name={icon} size={23} color={theme.accent} /></View>
    <View style={styles.optionCopy}><Text style={[styles.optionTitle, { color: theme.text }]}>{title}</Text><Text style={[styles.optionDetail, { color: theme.muted }]}>{detail}</Text></View>
    <Text style={{ color: theme.muted, fontSize: 21, paddingHorizontal: 2 }}>›</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: 10, paddingBottom: 20 },
  heading: { gap: 5, paddingTop: 9, paddingBottom: 8 },
  title: { fontSize: 29, lineHeight: 35, includeFontPadding: false, letterSpacing: -0.7, fontWeight: '800' },
  subtitle: { fontSize: 13, lineHeight: 19, includeFontPadding: false },
  hero: { position: 'relative', borderWidth: 1.5, borderRadius: 21, paddingHorizontal: 14, paddingTop: 17, paddingBottom: 12, alignItems: 'center', overflow: 'hidden' },
  kicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 5, backgroundColor: '#EE5689' },
  heroIcon: { width: 71, height: 71, borderRadius: 23, backgroundColor: '#873EF0', experimental_backgroundImage: 'linear-gradient(145deg, #AD6CFF 0%, #6E35E7 100%)', alignItems: 'center', justifyContent: 'center', marginBottom: 12, elevation: 4 },
  heroTitle: { fontSize: 20, lineHeight: 25, includeFontPadding: false, fontWeight: '800', letterSpacing: -0.35, textAlign: 'center', marginBottom: 9 },
  steps: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 16 },
  step: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 6, paddingVertical: 6, fontSize: 10, lineHeight: 14, includeFontPadding: false, fontWeight: '700', textAlign: 'center' },
  stepArrow: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  primary: { alignSelf: 'stretch' },
  compatibility: { textAlign: 'center', fontSize: 10, lineHeight: 15, includeFontPadding: false, marginTop: 8, paddingHorizontal: 4 },
  sectionLabel: { fontSize: 10, lineHeight: 14, includeFontPadding: false, letterSpacing: 1.05, fontWeight: '900', marginTop: 3, marginBottom: 1 },
  option: { minHeight: 64, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 11 },
  optionIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  optionCopy: { flex: 1, minWidth: 0, gap: 3 },
  optionTitle: { fontSize: 14, lineHeight: 19, fontWeight: '800' },
  optionDetail: { fontSize: 12, lineHeight: 17 },
  unsupported: { marginTop: 4, fontSize: 12, lineHeight: 18 },
});
