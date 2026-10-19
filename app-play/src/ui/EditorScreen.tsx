import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActionButton, GradientFill } from './controls';
import { Icon } from './Icons';
import type { Theme } from './theme';

export function EditorScreen({ theme, onCreate }: { theme: Theme; onCreate: (initialAction: 'file' | 'record') => void }) {
  return <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.heading}>
      <Text style={[styles.title, { color: theme.text }]}>Make a sound <Text style={{ color: '#BC42FA' }}>✦</Text></Text>
      <Text style={[styles.subtitle, { color: theme.muted }]}>Turn any audio into a soundbite.</Text>
    </View>
    <View style={[styles.sourceCard, { borderColor: theme.accent, backgroundColor: theme.surface }]}>
      <GradientFill colors={theme.softGradient} vertical />
      <View style={styles.sourceIcons}>
        <View style={styles.leftSideIcon}><Icon name="music" size={24} color="#13BBDD" /></View>
        <Icon name="upload" size={56} color="#D84AC3" />
        <View style={styles.rightSideIcon}><Icon name="video" size={24} color="#9646FF" /></View>
      </View>
      <Text style={[styles.sourceTitle, { color: theme.text }]}>Choose an audio or video file</Text>
      <Text style={[styles.formats, { color: theme.muted }]}>MP3, M4A, WAV, AAC, MP4, MOV{"\n"}up to 5 minutes and 32 MB.</Text>
      <View style={styles.button}><ActionButton label="Choose file" onPress={() => onCreate('file')} theme={theme} variant="primary" /></View>
    </View>
    <View style={styles.recordSection}>
      <View style={styles.recordHeading}><Icon name="mic" size={22} color="#BC39F5" /><Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>Or record a new sound</Text></View>
      <ActionButton label="Start recording" icon={<Icon name="mic" size={24} color="#271426" />} onPress={() => onCreate('record')} theme={theme} variant="recording" />
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, content: { gap: 18, paddingBottom: 20 }, heading: { gap: 5, paddingTop: 9, paddingBottom: 3 },
  title: { fontSize: 29, lineHeight: 34, includeFontPadding: false, letterSpacing: -0.7, fontWeight: '800' }, subtitle: { fontSize: 13, lineHeight: 19, includeFontPadding: false },
  sourceCard: { minHeight: 278, position: 'relative', borderWidth: 2, borderStyle: 'dashed', borderRadius: 21, paddingHorizontal: 16, paddingTop: 25, paddingBottom: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sourceIcons: { height: 76, width: '100%', position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  leftSideIcon: { position: 'absolute', left: 28, bottom: 2 }, rightSideIcon: { position: 'absolute', right: 28, bottom: 3 },
  sourceTitle: { fontSize: 18, lineHeight: 23, includeFontPadding: false, fontWeight: '800', textAlign: 'center', marginTop: 6 }, formats: { textAlign: 'center', fontSize: 12, lineHeight: 18, includeFontPadding: false, marginTop: 4, marginBottom: 16 }, button: { width: '100%' },
  recordSection: { gap: 13, marginTop: 1 }, recordHeading: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 9 },
});
