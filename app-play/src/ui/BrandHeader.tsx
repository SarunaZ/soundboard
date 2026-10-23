import type { RefObject } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Theme } from './theme';
import { Icon } from './Icons';

type BrandHeaderProps = {
  theme: Theme;
  title?: string;
  optionsButtonRef: RefObject<View | null>;
  onOptions: () => void;
  hidden?: boolean;
};

export function BrandHeader({ theme, title, optionsButtonRef, onOptions, hidden = false }: BrandHeaderProps) {
  return <View style={[styles.root, hidden && styles.hidden]} collapsable={false} pointerEvents={hidden ? 'none' : 'auto'} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}>
    <View style={styles.brandRow}>
      <View style={styles.logoWrap}>
        <Image source={require('../../assets/stimyz/stimmyz-logo-transparent.png')} accessibilityLabel="Stimmyz" resizeMode="contain" style={[styles.logo, { shadowColor: theme.name === 'Coffee' ? '#000' : '#6E938B' }]} />
      </View>
      <Pressable ref={optionsButtonRef} accessibilityRole="button" accessibilityLabel="App options" onPress={onOptions} style={[styles.optionsButton, { backgroundColor: theme.surfaceAlt }]}>
        <Icon name="more" size={21} color={theme.text} />
      </Pressable>
    </View>
    {title ? <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{title}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  hidden: { display: 'none' },
  brandRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  logoWrap: { width: 260, maxWidth: 260, minWidth: 0, flexShrink: 1, aspectRatio: 2147 / 724, position: 'relative' },
  logo: { ...StyleSheet.absoluteFill, width: '100%', height: '100%', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  optionsButton: { width: 48, height: 48, minWidth: 48, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, lineHeight: 23, fontWeight: '700', includeFontPadding: false, marginTop: 2 },
});
