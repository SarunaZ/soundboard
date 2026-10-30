import { useEffect, useMemo, useState } from 'react';
import { Alert, BackHandler, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import appConfig from '../../app.json';
import openSourceNotices from '../data/openSourceNotices.json';
import { loadPlayPreferences, savePlayPreferences } from '../data/preferences';
import { exportPlayBackup, importPlayBackup } from '../media/backup';
import { setMasterVolume } from '../media/playbackEngine';
import { isDeviceAudioCaptureSupported } from '../media/deviceAudioCapture';
import { ActionButton } from './controls';
import { Icon } from './Icons';
import type { Theme, ThemeName } from './theme';
import { themeNames, themes } from './theme';
import { getAnalyticsStatus, setAnalyticsConsent, subscribeAnalyticsStatus, type AnalyticsStatus } from '../analytics/productAnalytics';
import { ANALYTICS_DISCLOSURE } from '../onboarding/privacy';
import { openPrivacyPolicy as launchPrivacyPolicy } from '../onboarding/privacyLink';

export function SettingsModal({ visible, theme, appearance, bottomInset = 78, onAppearanceChange, onDataChanged, onBusyChange, onClose }: {
  visible: boolean; theme: Theme; appearance: ThemeName; bottomInset?: number; onAppearanceChange: (value: ThemeName) => void; onDataChanged: () => void; onBusyChange: (busy: boolean) => void; onClose: () => void;
}) {
  const [masterVolume, setMasterVolumeValue] = useState(1);
  const [railWidth, setRailWidth] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showNotices, setShowNotices] = useState(false);
  const [noticeSearch, setNoticeSearch] = useState('');
  const [noticePage, setNoticePage] = useState(0);
  const [selectedNoticeKey, setSelectedNoticeKey] = useState('');
  const [analyticsStatus, setAnalyticsStatus] = useState<AnalyticsStatus>(() => getAnalyticsStatus());
  const [analyticsBusy, setAnalyticsBusy] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');

  useEffect(() => subscribeAnalyticsStatus(setAnalyticsStatus), []);

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

  async function reportProblem() {
    try {
      await Share.share({
        title: 'Report a Stimmyz problem',
        message: 'Stimmyz problem report\n\nPlease describe what happened and what you expected. No sound, recording, filename, or diagnostic data is attached automatically.',
      });
    } catch (error) {
      Alert.alert('Could not open sharing options', error instanceof Error ? error.message : 'Try again.');
    }
  }

  async function changeAnalyticsConsent(enabled: boolean) {
    if (analyticsBusy || !analyticsStatus.configured) return;
    setAnalyticsBusy(true);
    setAnalyticsError('');
    try { await setAnalyticsConsent(enabled); }
    catch { setAnalyticsError('Your choice could not be saved. Please try again.'); }
    finally { setAnalyticsBusy(false); }
  }

  async function openPrivacyPolicy() {
    if (!(await launchPrivacyPolicy())) Alert.alert('Could not open privacy policy', 'Try opening the policy from your browser.');
  }

  const percent = Math.round(masterVolume * 100);
  const version = appConfig.expo.version;
  const noticePageSize = 12;
  const filteredNotices = useMemo(() => {
    const query = noticeSearch.trim().toLocaleLowerCase();
    if (!query) return openSourceNotices.packages;
    return openSourceNotices.packages.filter((notice) => `${notice.name} ${notice.version} ${notice.license ?? ''}`.toLocaleLowerCase().includes(query));
  }, [noticeSearch]);
  const noticePageCount = Math.max(1, Math.ceil(filteredNotices.length / noticePageSize));
  const visibleNotices = filteredNotices.slice(noticePage * noticePageSize, (noticePage + 1) * noticePageSize);
  const selectedNotice = visibleNotices.find((notice) => `${notice.name}@${notice.version}` === selectedNoticeKey) ?? visibleNotices[0] ?? null;
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
        <CardHeading icon="spark" title="Privacy" subtitle="Choose whether to share app usage" theme={theme} />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <View style={styles.analyticsRow}>
          <View style={styles.analyticsCopy}>
            <Text style={[styles.label, { color: theme.text }]}>Share app usage data</Text>
            <Text style={[styles.helper, { color: theme.muted }]}>{ANALYTICS_DISCLOSURE}</Text>
          </View>
          <Switch accessibilityLabel="Share app usage data" value={analyticsStatus.consent === 'on'} disabled={analyticsBusy || !analyticsStatus.configured}
            onValueChange={(value) => void changeAnalyticsConsent(value)} trackColor={{ false: theme.border, true: theme.accent }} thumbColor={theme.surface} />
        </View>
        {!analyticsStatus.configured ? <Text style={[styles.helper, { color: theme.muted }]}>Usage sharing is currently unavailable.</Text> : null}
        {analyticsBusy ? <Text accessibilityLiveRegion="polite" style={[styles.helper, { color: theme.muted }]}>Saving your choice…</Text> : null}
        {analyticsError ? <Text accessibilityLiveRegion="assertive" style={[styles.helper, { color: theme.danger }]}>{analyticsError}</Text> : null}
        <Pressable accessibilityRole="link" accessibilityLabel="Open Stimmyz privacy policy" onPress={() => void openPrivacyPolicy()} style={styles.policyLink}>
          <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '800' }}>Read the privacy policy</Text>
          <Text style={{ color: theme.accent, fontSize: 18 }}>↗</Text>
        </Pressable>
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
          <Text style={[styles.aboutCopy, { color: theme.muted }]}>Sounds, boards and artwork are stored in this app on your device. Uninstalling the app removes that data. Exporting a backup saves a copy to the location you choose. Artwork comes from images you select in your Gallery.</Text>
          <Text style={[styles.aboutCopy, { color: theme.muted }]}>This app uses open-source software. Its dependency notices are included below and available offline.</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showNotices }} onPress={() => setShowNotices((open) => !open)} style={styles.privacyButton}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Open-source notices ({openSourceNotices.packageCount})</Text>
            <Text style={[styles.chevron, { color: theme.accent }]}>{showNotices ? '⌃' : '→'}</Text>
          </Pressable>
          {showNotices ? <View style={[styles.noticeDetails, { borderTopColor: theme.border }]}>
            <Text style={[styles.aboutCopy, { color: theme.muted }]}>Search {openSourceNotices.packageCount} package records and select one to read its copyright, license and notice text.</Text>
            <TextInput accessibilityLabel="Search open-source packages" value={noticeSearch} onChangeText={(value) => { setNoticeSearch(value); setNoticePage(0); }} placeholder="Search packages or licenses" placeholderTextColor={theme.muted}
              style={[styles.noticeSearch, { color: theme.text, backgroundColor: theme.surfaceAlt, borderColor: theme.border }]} autoCapitalize="none" autoCorrect={false} />
            {visibleNotices.map((notice) => {
              const key = `${notice.name}@${notice.version}`;
              const selected = selectedNotice?.name === notice.name && selectedNotice.version === notice.version;
              return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${notice.name}, version ${notice.version}, license ${notice.license ?? 'not specified'}`} onPress={() => setSelectedNoticeKey(key)}
                style={[styles.noticeChoice, { backgroundColor: selected ? theme.surfaceAlt : 'transparent', borderColor: selected ? theme.accent : theme.border }]}>
                <View style={styles.noticeChoiceText}>
                  <Text numberOfLines={1} style={[styles.noticeName, { color: theme.text }]}>{notice.name}</Text>
                  <Text numberOfLines={1} style={[styles.aboutCopy, { color: theme.muted }]}>{notice.version} · {notice.license ?? 'License metadata unavailable'}</Text>
                </View>
                {selected ? <Text accessibilityLabel="Selected" style={{ color: theme.accent, fontWeight: '900' }}>✓</Text> : null}
              </Pressable>;
            })}
            {visibleNotices.length === 0 ? <Text style={[styles.aboutCopy, { color: theme.muted }]}>No packages match this search.</Text> : null}
            {noticePageCount > 1 ? <View style={styles.noticePager}>
              <Pressable accessibilityRole="button" accessibilityLabel="Previous notices page" disabled={noticePage === 0} onPress={() => setNoticePage((page) => Math.max(0, page - 1))}
                style={[styles.noticePageButton, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, opacity: noticePage === 0 ? 0.45 : 1 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>Previous</Text></Pressable>
              <Text accessibilityLiveRegion="polite" style={[styles.aboutCopy, { color: theme.muted }]}>Page {noticePage + 1} of {noticePageCount}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Next notices page" disabled={noticePage + 1 >= noticePageCount} onPress={() => setNoticePage((page) => Math.min(noticePageCount - 1, page + 1))}
                style={[styles.noticePageButton, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, opacity: noticePage + 1 >= noticePageCount ? 0.45 : 1 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>Next</Text></Pressable>
            </View> : null}
            {selectedNotice ? <View style={[styles.noticeSelected, { borderTopColor: theme.border }]}>
              <Text accessibilityRole="header" style={[styles.noticeSelectedTitle, { color: theme.text }]}>{selectedNotice.name} {selectedNotice.version}</Text>
              <Text style={[styles.aboutCopy, { color: theme.muted }]}>License: {selectedNotice.license ?? 'not specified in package metadata'}</Text>
              {selectedNotice.source ? <Text selectable style={[styles.aboutCopy, { color: theme.muted }]}>Source: {selectedNotice.source}</Text> : null}
              {'buildNote' in selectedNotice && selectedNotice.buildNote ? <Text style={[styles.aboutCopy, { color: theme.muted }]}>{selectedNotice.buildNote}</Text> : null}
              {'sourceSha256' in selectedNotice && selectedNotice.sourceSha256 ? <Text selectable style={[styles.aboutCopy, { color: theme.muted }]}>Source archive SHA-256: {selectedNotice.sourceSha256}</Text> : null}
              {selectedNotice.texts.length ? selectedNotice.texts.map((noticeText) => <View key={noticeText.file} style={styles.noticeTextBlock}>
                <Text style={[styles.noticeFileName, { color: theme.accent }]}>{noticeText.file}</Text>
                <Text selectable style={[styles.noticeText, { color: theme.text }]}>{noticeText.text}</Text>
              </View>) : <Text style={[styles.aboutCopy, { color: theme.muted }]}>This package does not include a license text. The license shown above is information supplied by its publisher.</Text>}
            </View> : null}
            <Text style={[styles.aboutCopy, { color: theme.muted }]}>These notices cover libraries and tools used to build Stimmyz. Some packages provide license information without a full license text.</Text>
          </View> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showPrivacy }} onPress={() => setShowPrivacy((open) => !open)} style={styles.privacyButton}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Privacy on this device</Text>
            <Text style={[styles.chevron, { color: theme.accent }]}>{showPrivacy ? '⌃' : '→'}</Text>
          </Pressable>
          {showPrivacy ? <View style={[styles.privacyDetails, { borderTopColor: theme.border }]}>
            <Text style={[styles.aboutCopy, { color: theme.muted }]}>Stimmyz stores your sounds, board settings and selected artwork in app-private storage. The app does not sync them to an account. A backup is created only when you choose Export and select a destination; that copy is managed by the destination you choose.</Text>
            <Text style={[styles.aboutCopy, { color: theme.muted }]}>Microphone recording starts only after you choose Record your voice and grant Android permission. {isDeviceAudioCaptureSupported() ? 'Device audio recording is available in this testing build; Android shows its capture consent and some apps may block capture.' : 'Device audio recording is not enabled in this build.'} Captures stay in your local Library unless you explicitly export a backup.</Text>
            <Text style={[styles.aboutCopy, { color: theme.muted }]}>The app does not attach recordings, filenames or diagnostics to a problem report. Review anything you choose to share before sending it.</Text>
          </View> : null}
          <ActionButton label="Report a problem" onPress={() => void reportProblem()} theme={theme} variant="secondary" />
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
  analyticsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  analyticsCopy: { flex: 1, gap: 5 },
  policyLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
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
  privacyButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 },
  privacyDetails: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 7 },
  noticeDetails: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 8 },
  noticeSearch: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 14 },
  noticeChoice: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeChoiceText: { flex: 1, minWidth: 0 },
  noticeName: { fontSize: 13, fontWeight: '800' },
  noticePager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  noticePageButton: { minHeight: 48, minWidth: 88, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  noticeSelected: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 6 },
  noticeSelectedTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900' },
  noticeTextBlock: { gap: 4 },
  noticeFileName: { fontSize: 12, fontWeight: '800' },
  noticeText: { fontSize: 11, lineHeight: 15, fontFamily: 'monospace' },
  aboutLine: { fontSize: 13, fontWeight: '800' },
  aboutCopy: { fontSize: 12, lineHeight: 17 },
});
