import { useEffect, useState } from 'react';
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import appConfig from '../../app.json';
import { loadPlayPreferences, savePlayPreferences } from '../data/preferences';
import { exportPlayBackup, importPlayBackup } from '../media/backup';
import { setMasterVolume } from '../media/playbackEngine';
import { ActionButton } from './controls';
import { Icon } from './Icons';
import type { Theme, ThemeName } from './theme';
import { themeNames, themes } from './theme';

export function SettingsModal({ visible, theme, appearance, bottomInset = 78, onAppearanceChange, onDataChanged, onBusyChange, onClose }: {
  visible: boolean; theme: Theme; appearance: ThemeName; bottomInset?: number; onAppearanceChange: (value: ThemeName) => void; onDataChanged: () => void; onBusyChange: (busy: boolean) => void; onClose: () => void;
}) {
  const [masterVolume, setMasterVolumeValue] = useState(1);
  const [railWidth, setRailWidth] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    if (!visible) return;
    try { setMasterVolumeValue(loadPlayPreferences().masterVolume); } catch { setMasterVolumeValue(1); }
  }, [visible]);
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy) onClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, busy, onClose]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);

  function saveMaster(value: number) {
    const normalized = Math.max(0, Math.min(1, Math.round(value * 20) / 20));
    setMasterVolumeValue(normalized);
    setMasterVolume(normalized);
    try { savePlayPreferences({ masterVolume: normalized }); }
    catch (error) { Alert.alert('Could not save Playback setting', error instanceof Error ? error.message : 'Try again.'); }
  }

  async function backup(mode: 'export' | 'import') {
    if (busy) return;
    setBusy(true);
    try {
      const result = mode === 'export' ? await exportPlayBackup() : await importPlayBackup();
      if (!result) return;
      if (mode === 'export') Alert.alert('Backup exported', 'Your sounds and board settings were saved to the location you chose.');
      else { onDataChanged(); Alert.alert('Backup restored', 'Your saved sounds and boards are ready to use.'); }
    } catch (error) { Alert.alert(mode === 'export' ? 'Could not export backup' : 'Could not restore backup', error instanceof Error ? error.message : 'Try again.'); }
    finally { setBusy(false); }
  }

  const percent = Math.round(masterVolume * 100);
  const version = appConfig.expo.version;
  if (!visible) return null;
  return <View style={[styles.screen, { backgroundColor: theme.background, bottom: bottomInset }]}>
    <View style={styles.pageHeader}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to soundboard" disabled={busy} onPress={onClose}
        style={[styles.backButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Icon name="back" size={22} color={theme.text} />
      </Pressable>
      <View style={styles.titleGroup}>
        <Text style={[styles.eyebrow, { color: theme.accent }]}>MAKE IT YOURS</Text>
        <Text accessibilityRole="header" style={[styles.pageTitle, { color: theme.text }]}>Settings <Text style={{ color: theme.accent }}>✦</Text></Text>
      </View>
    </View>

    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <CardHeading icon="music" title="Playback" subtitle="Just the essentials" theme={theme} />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <View style={styles.volumeHeading}>
          <Text style={[styles.label, { color: theme.text }]}>Master volume</Text>
          <Text accessibilityLiveRegion="polite" style={[styles.readout, { color: theme.accent }]}>{percent}%</Text>
        </View>
        <View style={styles.sliderRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Decrease master volume" disabled={busy} onPress={() => saveMaster(masterVolume - 0.05)}
            style={[styles.step, { backgroundColor: theme.surfaceAlt }]}><Text style={{ color: theme.text, fontSize: 22 }}>−</Text></Pressable>
          <View accessibilityRole="adjustable" accessibilityLabel="Master volume" accessibilityValue={{ min: 0, max: 100, now: percent, text: `${percent} percent` }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(event) => saveMaster(masterVolume + (event.nativeEvent.actionName === 'increment' ? 0.05 : -0.05))}
            onTouchMove={(event) => saveMaster(event.nativeEvent.locationX / Math.max(1, railWidth))}
            onTouchEnd={(event) => saveMaster(event.nativeEvent.locationX / Math.max(1, railWidth))}
            onLayout={(event) => setRailWidth(event.nativeEvent.layout.width)} style={[styles.rail, { backgroundColor: theme.surfaceAlt }]}>
            <View pointerEvents="none" style={[styles.railFill, { width: `${percent}%`, backgroundColor: theme.accent }]} />
            <View pointerEvents="none" style={[styles.thumb, { left: `${percent}%`, backgroundColor: theme.accent }]} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Increase master volume" disabled={busy} onPress={() => saveMaster(masterVolume + 0.05)}
            style={[styles.step, { backgroundColor: theme.surfaceAlt }]}><Text style={{ color: theme.text, fontSize: 22 }}>+</Text></Pressable>
        </View>
        <Text style={[styles.helper, { color: theme.muted }]}>Adjust soundboard loudness without changing your phone volume.</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <CardHeading icon="spark" title="Appearance" subtitle="Choose your theme" theme={theme} />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showThemes }} onPress={() => setShowThemes((open) => !open)} style={styles.rowButton}>
          <Icon name="spark" size={20} color={theme.accent} />
          <Text style={[styles.rowTitle, { color: theme.text }]}>Theme</Text>
          <Text style={[styles.currentTheme, { color: theme.muted }]}>{appearance}</Text>
          <Text style={[styles.chevron, { color: theme.accent }]}>{showThemes ? '⌃' : '→'}</Text>
        </Pressable>
        {showThemes ? <View style={styles.themeGrid}>{themeNames.map((name) => <Pressable key={name} accessibilityRole="button" accessibilityState={{ selected: name === appearance }} accessibilityLabel={`${name} theme`} onPress={() => onAppearanceChange(name)}
          style={[styles.themeChoice, { backgroundColor: theme.surfaceAlt, borderColor: name === appearance ? theme.accent : theme.border }]}>
          <View style={[styles.swatch, { backgroundColor: themes[name].background, borderColor: themes[name].border }]} />
          <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '700', flex: 1, flexShrink: 1 }}>{name}</Text>
          {name === appearance ? <Text accessibilityLabel="Selected" style={{ color: theme.accent, fontWeight: '900' }}>✓</Text> : null}
        </Pressable>)}</View> : null}
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <CardHeading icon="file" title="Backup & restore" subtitle="Keep sounds and layouts when switching phones" theme={theme} />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <View style={styles.backupActions}>
          <ActionButton label={busy ? 'Working…' : 'Export backup'} onPress={() => void backup('export')} theme={theme} variant="secondary" disabled={busy} icon="↥" buttonStyle={styles.backupButton} />
          <ActionButton label={busy ? 'Working…' : 'Import backup'} onPress={() => void backup('import')} theme={theme} variant="secondary" disabled={busy} icon="↧" buttonStyle={styles.backupButton} />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <CardHeading icon="file" title="About" subtitle="App version, privacy and licenses" theme={theme} />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAbout }} onPress={() => setShowAbout((open) => !open)} style={styles.rowButton}>
          <Text style={[styles.rowTitle, { color: theme.text }]}>About Stimmyz</Text>
          <Text style={[styles.chevron, { color: theme.accent }]}>{showAbout ? '⌃' : '→'}</Text>
        </Pressable>
        {showAbout ? <View style={[styles.aboutDetails, { borderTopColor: theme.border }]}>
          <Text style={[styles.aboutLine, { color: theme.text }]}>Version {version}</Text>
          <Text style={[styles.aboutCopy, { color: theme.muted }]}>Sounds and boards are stored in this app on your device. Exporting a backup saves a copy to the location you choose. Browsing artwork may connect to Imgflip.</Text>
          <Text style={[styles.aboutCopy, { color: theme.muted }]}>This app uses open-source software. License notices for bundled libraries are not currently shown in the app.</Text>
        </View> : null}
      </View>
      <View style={{ height: 12 }} />
    </ScrollView>
  </View>;
}

function CardHeading({ icon, title, subtitle, theme }: { icon: 'music' | 'spark' | 'file'; title: string; subtitle: string; theme: Theme }) {
  return <View style={styles.cardHeading}>
    <View style={styles.headingIcon}><Icon name={icon} size={23} color={theme.accent} /></View>
    <View style={styles.headingText}><Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text><Text style={[styles.cardSubtitle, { color: theme.muted }]}>{subtitle}</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 78, zIndex: 10, paddingHorizontal: 23 },
  pageHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, marginBottom: 2 },
  backButton: { width: 48, height: 48, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  titleGroup: { flex: 1, justifyContent: 'center' },
  eyebrow: { fontSize: 10, letterSpacing: 1.1, fontWeight: '900', lineHeight: 15 },
  pageTitle: { fontSize: 28, lineHeight: 32, fontWeight: '900', includeFontPadding: false },
  scroll: { flex: 1, minHeight: 0 },
  content: { gap: 12, paddingBottom: 14 },
  card: { borderWidth: 1, borderRadius: 21, padding: 15, gap: 12 },
  cardHeading: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 11 },
  headingIcon: { width: 26, alignItems: 'center', justifyContent: 'center' },
  headingText: { flex: 1 },
  cardTitle: { fontSize: 17, lineHeight: 21, fontWeight: '800' },
  cardSubtitle: { fontSize: 12, lineHeight: 17 },
  divider: { height: StyleSheet.hairlineWidth },
  volumeHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 28 },
  label: { fontSize: 14, fontWeight: '800' },
  readout: { fontSize: 14, fontWeight: '900' },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rail: { height: 48, flex: 1, borderRadius: 24, justifyContent: 'center' },
  railFill: { position: 'absolute', left: 0, top: 20, height: 8, borderRadius: 4 },
  thumb: { position: 'absolute', top: 13, marginLeft: -12, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#FFFFFF' },
  helper: { fontSize: 12, lineHeight: 17 },
  rowButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 },
  rowTitle: { fontSize: 14, fontWeight: '800', flexShrink: 1 },
  currentTheme: { fontSize: 12, marginLeft: 'auto' },
  chevron: { minWidth: 24, textAlign: 'right', fontSize: 21, fontWeight: '600' },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  themeChoice: { width: '47%', minHeight: 52, borderWidth: 1.5, borderRadius: 13, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 7 },
  swatch: { width: 22, height: 22, borderRadius: 7, borderWidth: 1 },
  backupActions: { flexDirection: 'row', gap: 8 },
  backupButton: { flex: 1, minWidth: 0, minHeight: 50, paddingHorizontal: 8 },
  aboutDetails: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 7 },
  aboutLine: { fontSize: 13, fontWeight: '800' },
  aboutCopy: { fontSize: 12, lineHeight: 17 },
});
