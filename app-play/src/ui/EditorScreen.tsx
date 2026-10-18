import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActionButton, Heading, Panel } from './controls';
import type { Theme } from './theme';

export function EditorScreen({ theme, onCreate }: { theme: Theme; onCreate: (initialAction: 'file' | 'record') => void }) {
  return <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Heading title="Create a sound" subtitle="Choose a source, trim a moment, and save it to your Library." theme={theme} />
    <Panel theme={theme} style={styles.card}>
      <View style={[styles.icon, { backgroundColor: theme.raised }]}><Text style={{ color: theme.focus, fontSize: 28 }}>♫</Text></View>
      <Text style={[styles.title, { color: theme.text }]}>Make a soundbite</Text>
      <Text style={[styles.copy, { color: theme.muted }]}>Import audio or record a sound with your microphone. Trim the part you want, then customize its name, icon, color, and optional meme image before saving it for offline playback.</Text>
      <View style={styles.actions}>
        <ActionButton label="Choose file" icon="📁" onPress={() => onCreate('file')} theme={theme} variant="primary" />
        <ActionButton label="Record sound" icon="🎙" onPress={() => onCreate('record')} theme={theme} variant="secondary" />
      </View>
    </Panel>
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, content: { gap: 16, paddingBottom: 20 }, card: { alignItems: 'flex-start', gap: 16 }, actions: { width: '100%', gap: 10 }, icon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800' }, copy: { fontSize: 15, lineHeight: 22 },
});
