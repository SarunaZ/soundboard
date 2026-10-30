import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, BackHandler, findNodeHandle, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Theme } from './theme';
import { Icon } from './Icons';
import { openPrivacyPolicy } from '../onboarding/privacyLink';

type Props = { theme: Theme; onFinish: (share: boolean) => Promise<void>; notice?: string };
const logo = require('../../assets/stimyz/stimmyz-logo-transparent.png');
const miniColors: Array<[string, string]> = [
  ['#f78ec9', '#c65ceb'], ['#80d8ff', '#447ff5'], ['#ffcf72', '#fc9658'], ['#9be6b1', '#3ab5a4'],
  ['#a7b7ff', '#7d80ed'], ['#ff9e9b', '#f66f76'], ['#cbb5ff', '#8558ee'], ['#a4e7e2', '#49b9c2'],
];

export function OnboardingFlow({ theme, onFinish, notice = '' }: Props) {
  const [step, setStep] = useState<'welcome' | 'privacy'>('welcome');
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const heading = useRef<Text>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => { let mounted = true; void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReduceMotion(value); }); const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion); return () => { mounted = false; sub.remove(); }; }, []);
  useEffect(() => {
    const timer = setTimeout(() => { const node = heading.current && findNodeHandle(heading.current); if (node) AccessibilityInfo.setAccessibilityFocus(node); }, 120);
    return () => clearTimeout(timer);
  }, [step]);
  useEffect(() => {
    if (step !== 'privacy') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (busy) return true; setStep('welcome'); return true; });
    return () => sub.remove();
  }, [step, busy]);

  const finish = async (share: boolean) => {
    if (busy) return;
    setBusy(true);
    try { await onFinish(share); } finally { setBusy(false); }
  };
  const buttonStyle = [styles.choice, { borderColor: theme.accent, backgroundColor: theme.surface }];

  return <View style={[styles.screen, { backgroundColor: theme.background }]}>
    {step === 'welcome' ? <ScrollView key="welcome" contentContainerStyle={styles.welcomeScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.progress}><Text style={[styles.progressText, { color: theme.muted }]}>HELLO THERE · 1 / 2</Text><View style={styles.progressDots}><View style={[styles.dot, { backgroundColor: theme.accent }]} /><View style={[styles.dot, { backgroundColor: theme.border }]} /></View></View>
      <View style={[styles.hero, { backgroundColor: theme.softGradient[0], borderColor: theme.border, experimental_backgroundImage: `linear-gradient(145deg, ${theme.softGradient[0]} 0%, ${theme.softGradient[1]} 100%)` }]}>
        <Text accessible={false} allowFontScaling={false} style={styles.heroSpark}>✦</Text>
        <Image source={logo} resizeMode="contain" accessibilityLabel="Stimmyz" style={styles.logo} />
        <Text style={[styles.heroCaption, { color: theme.muted }]}>Make a little noise ✦</Text>
        <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.miniBoardWrap, !reduceMotion && { transform: [{ rotate: '-3deg' }] }]}>
          <View style={[styles.miniBoard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.miniTop}><Text allowFontScaling={false} style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>My soundboard</Text><Text allowFontScaling={false} accessible={false} style={{ color: theme.accent, fontSize: 10 }}>● ● ●</Text></View>
            <View style={styles.miniGrid}>{[['✨', '🔊', '😂', '🎵'], ['💬', '🎉', '⚡', '🎤']].map((row, rowIndex) => <View key={rowIndex} style={styles.miniGridRow}>{row.map((glyph, columnIndex) => { const index = rowIndex * 4 + columnIndex; const [first, second] = miniColors[index]!; return <View key={index} style={[styles.miniPad, { backgroundColor: first, experimental_backgroundImage: `linear-gradient(145deg, ${first} 0%, ${second} 100%)` }]}><Text allowFontScaling={false} style={{ fontSize: 22 }}>{glyph}</Text></View>; })}</View>)}</View>
          </View>
          <View style={styles.musicBadge}><Icon name="music" size={20} color="#FFFFFF" /></View>
        </View>
      </View>
      <Text ref={heading} accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Your sounds.{ '\n'}<Text style={{ color: theme.accent }}>Your soundboard.</Text></Text>
      <Text style={[styles.subtitle, { color: theme.muted }]}>Capture a funny moment, trim it down, and play it whenever you like. Build a collection that's totally yours.</Text>
      <View style={styles.badges}>{[['mic', 'Record'], ['upload', 'Import'], ['play', 'Play']].map(([icon, label]) => <View key={label} style={[styles.badge, { backgroundColor: theme.surface, borderColor: theme.border }]}><Icon name={icon as 'mic' | 'upload' | 'play'} size={17} color={theme.accent} /><Text style={{ color: theme.text, fontSize: 14, fontWeight: '700', flexShrink: 1 }}>{label}</Text></View>)}</View>
      <View style={styles.grow} />
      <Pressable accessibilityRole="button" onPress={() => setStep('privacy')} style={[styles.primary, styles.fullWidth, { backgroundColor: theme.accent }]}><Text style={[styles.primaryText, { color: '#FFFFFF' }]}>Let's get started</Text><Text style={[styles.arrow, { color: '#FFFFFF' }]}>→</Text></Pressable>
      <Text style={[styles.footerHint, { color: theme.muted }]}>No account needed · Your sounds stay on your device</Text>
    </ScrollView> : <>
      <ScrollView key="privacy" style={{ flex: 1 }} contentContainerStyle={styles.privacyScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.privacyHeader}><Pressable accessibilityRole="button" accessibilityLabel="Back to welcome" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => setStep('welcome')} style={[styles.back, { borderColor: theme.border, backgroundColor: theme.surface }]}><Icon name="back" size={21} color={theme.text} /></Pressable><Text style={[styles.progressText, styles.privacyStepLabel, { color: theme.muted }]}>PRIVACY · 2 / 2</Text><View style={[styles.progressDots, styles.privacyProgressDots]}><View style={[styles.dot, { backgroundColor: theme.border }]} /><View style={[styles.dot, { backgroundColor: theme.accent }]} /></View></View>
        <View style={[styles.shield, { backgroundColor: `${theme.accent}1A`, borderColor: `${theme.accent}55` }, !reduceMotion && { transform: [{ rotate: '-5deg' }] }]}>
          <View accessible={false} style={[styles.shieldBody, { borderColor: theme.accent }]} />
          <Icon name="check" size={18} color={theme.accent} />
          <Text accessible={false} allowFontScaling={false} style={styles.shieldSpark}>✦</Text>
        </View>
        <Text ref={heading} accessibilityRole="header" style={[styles.title, styles.privacyTitle, { color: theme.text }]}>Help us make{'\n'}<Text style={{ color: theme.accent }}>Stimmyz better?</Text></Text>
        <Text style={[styles.subtitle, styles.privacySubtitle, { color: theme.muted }]}>Share a little optional usage data to help us see which features work, and where sound creation goes wrong.</Text>
        <View style={[styles.disclosure, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.disclosureHeading, { color: theme.text }]}>What you'd be sharing</Text>
          <View style={styles.disclosureRow}><Icon name="check" size={18} color={theme.accent} /><View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: theme.text }]}>Basic feature usage and errors</Text><Text style={[styles.rowBody, { color: theme.muted }]}>Sound creation attempts, saves, and failures.</Text></View></View>
          <View style={styles.disclosureRow}><View accessible={false} style={[styles.disclosureShield, { borderColor: theme.accent }]}><Icon name="check" size={10} color={theme.accent} /></View><View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: theme.text }]}>Not your sounds</Text><Text style={[styles.rowBody, { color: theme.muted }]}>No recordings, audio content, sound names, or artwork.</Text></View></View>
          <View style={styles.disclosureRow}><Icon name="sun" size={18} color={theme.accent} /><View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: theme.text }]}>Always your choice</Text><Text style={[styles.rowBody, { color: theme.muted }]}>Everything works without analytics. Change your choice in Settings anytime.</Text></View></View>
        </View>
        <Text style={[styles.provider, { color: theme.muted }]}>Analytics provided by <Text style={{ color: theme.text, fontWeight: '800' }}>PostHog</Text>. Turning it off stops future collection; it does not delete data already sent.</Text>
        <Pressable accessibilityRole="link" onPress={async () => { setLinkError(false); if (!(await openPrivacyPolicy())) setLinkError(true); }} style={styles.policy}><Text style={{ color: theme.accent, fontWeight: '800', fontSize: 14 }}>Read our Privacy Policy ↗</Text></Pressable>
        {linkError ? <Text accessibilityLiveRegion="polite" style={[styles.linkError, { color: theme.danger }]}>Could not open the policy link. Your choice has not been saved.</Text> : null}
        <Text style={[styles.unavailable, { color: theme.muted }]}>Usage analytics are unavailable in this build; Share will remain off.</Text>
        {notice ? <Text accessibilityLiveRegion="polite" style={[styles.unavailable, { color: theme.danger }]}>{notice}</Text> : null}
        <View style={styles.grow} />
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Share usage analytics" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void finish(true)} style={[styles.primary, styles.fullWidth, { backgroundColor: theme.accent }, busy && { opacity: 0.6 }]}><Text style={[styles.primaryText, { color: '#FFFFFF' }]}>{busy ? 'Saving…' : 'Share usage analytics'}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Continue without analytics" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void finish(false)} style={[buttonStyle, busy && { opacity: 0.6 }]}><Text style={[styles.secondaryText, { color: theme.text }]}>{busy ? 'Saving…' : 'Continue without analytics'}</Text></Pressable>
          <Text style={[styles.footerHint, { color: theme.muted }]}>Both choices take you straight to Stimmyz.</Text>
        </View>
      </ScrollView>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, welcomeScroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 23, paddingBottom: 12 },
  progress: { width: '100%', minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, progressText: { fontSize: 10, letterSpacing: 1.6, fontWeight: '800', flexShrink: 1, minWidth: 0 }, progressDots: { flexDirection: 'row', gap: 7, flexShrink: 0 }, dot: { width: 24, height: 5, borderRadius: 4 },
  hero: { width: '100%', minHeight: 323, borderWidth: 1, borderRadius: 26, paddingVertical: 18, paddingHorizontal: 14, alignItems: 'center', overflow: 'hidden', marginTop: 12 }, heroSpark: { position: 'absolute', top: 34, right: 23, color: '#FFB347', fontSize: 27, lineHeight: 32 },
  logo: { width: 218, height: 218 * 724 / 2147, maxWidth: '92%', marginTop: 4 }, heroCaption: { marginTop: 5, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { textAlign: 'center', fontWeight: '900', fontSize: 28, lineHeight: 33, letterSpacing: -0.8, marginTop: 20 }, subtitle: { textAlign: 'center', fontSize: 14, lineHeight: 21, marginTop: 9, maxWidth: 350 },
  miniBoardWrap: { position: 'relative', marginTop: 17, width: 270, maxWidth: '92%' }, miniBoard: { width: '100%', padding: 12, borderWidth: 1, borderRadius: 21, alignItems: 'center', elevation: 3 }, miniTop: { flexDirection: 'row', width: '100%', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9, paddingHorizontal: 3 }, miniGrid: { flexDirection: 'column', gap: 7, width: '100%' }, miniGridRow: { flexDirection: 'row', gap: 7, width: '100%' }, miniPad: { flex: 1, minWidth: 0, aspectRatio: 0.92, borderRadius: 11, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, musicBadge: { position: 'absolute', top: 35, left: -17, zIndex: 2, width: 35, height: 35, borderRadius: 11, backgroundColor: '#9B63FF', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }], elevation: 3 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 9, marginTop: 20, marginBottom: 20 }, badge: { flexDirection: 'row', flexShrink: 1, gap: 6, alignItems: 'center', borderWidth: 1, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8 },
  primary: { minHeight: 54, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 10 }, primaryText: { fontSize: 16, lineHeight: 23, textAlign: 'center', fontWeight: '900', flexShrink: 1 }, arrow: { fontSize: 20, fontWeight: '800', flexShrink: 0, marginLeft: 8 },
  grow: { flex: 1, minHeight: 13 }, fullWidth: { width: '100%' }, footerHint: { marginTop: 10, fontSize: 11, textAlign: 'center', lineHeight: 16 },
  privacyHeader: { width: '100%', minHeight: 54, flexDirection: 'row', alignItems: 'center' }, back: { width: 48, height: 48, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, privacyStepLabel: { flex: 1, minWidth: 0, flexShrink: 1, textAlign: 'center' }, privacyProgressDots: { width: 52, justifyContent: 'flex-end' },
  privacyScroll: { flexGrow: 1, paddingHorizontal: 23, alignItems: 'center', paddingTop: 0, paddingBottom: 14 }, shield: { width: 86, height: 86, borderWidth: 1, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginTop: 10 }, shieldBody: { position: 'absolute', width: 32, height: 37, borderWidth: 2.5, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomLeftRadius: 15, borderBottomRightRadius: 16 }, shieldSpark: { position: 'absolute', top: -9, right: -5, color: '#FFB347', fontSize: 19, lineHeight: 22 }, privacyTitle: { marginTop: 13, fontSize: 27, lineHeight: 33 }, privacySubtitle: { fontSize: 13, lineHeight: 19, marginTop: 6, maxWidth: 340 },
  disclosure: { width: '100%', borderWidth: 1, borderRadius: 21, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 11, marginTop: 14 }, disclosureHeading: { fontSize: 12, fontWeight: '900', marginBottom: 8 }, disclosureRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 }, disclosureShield: { width: 18, height: 18, borderWidth: 1.5, borderTopLeftRadius: 2, borderTopRightRadius: 2, borderBottomLeftRadius: 7, borderBottomRightRadius: 7, alignItems: 'center', justifyContent: 'center' }, rowTitle: { fontSize: 13, lineHeight: 18, fontWeight: '800' }, rowBody: { fontSize: 12, lineHeight: 17, marginTop: 2 }, provider: { fontSize: 11, lineHeight: 16, marginTop: 12, textAlign: 'center' }, policy: { padding: 9 }, linkError: { fontSize: 12, textAlign: 'center', marginBottom: 5 }, unavailable: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 5 }, actions: { width: '100%', gap: 10, paddingHorizontal: 0, paddingTop: 8 }, choice: { width: '100%', minHeight: 54, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10 }, secondaryText: { fontSize: 14, lineHeight: 22, fontWeight: '800', textAlign: 'center', flexShrink: 1, flexWrap: 'wrap' },
});
