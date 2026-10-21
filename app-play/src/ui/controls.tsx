import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInput as TextInputElement } from 'react-native';
import type { Theme } from './theme';

export function ActionButton({ label, onPress, theme, variant = 'secondary', disabled = false, icon, buttonStyle }: {
  label: string; onPress: () => void; theme: Theme; variant?: 'primary' | 'recording' | 'secondary' | 'quiet' | 'danger'; disabled?: boolean; icon?: string | ReactNode; buttonStyle?: object;
}) {
  const gradient = variant === 'primary' ? theme.primaryGradient : variant === 'recording' ? theme.recordingGradient : null;
  const backgroundColor = variant === 'danger' ? theme.danger : variant === 'quiet' ? 'transparent' : theme.raised;
  const color = variant === 'recording' ? '#271426' : gradient || variant === 'danger' ? '#FFFFFF' : theme.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled}
    style={({ pressed }) => [styles.button, variant === 'recording' && styles.recording, buttonStyle, { backgroundColor: gradient?.[0] ?? backgroundColor, experimental_backgroundImage: gradient ? `linear-gradient(110deg, ${gradient[0]} 0%, ${gradient[1]} 100%)` : undefined, borderColor: gradient ? 'transparent' : theme.border, opacity: disabled ? 0.45 : pressed ? 0.82 : 1 }, variant === 'quiet' && styles.quiet]}>
    {typeof icon === 'string' ? <Text style={[styles.buttonIcon, { color }]}>{icon}</Text> : icon ?? null}
    <Text style={[styles.buttonText, { color }]}>{label}</Text>
  </Pressable>;
}

export function Panel({ theme, children, style }: PropsWithChildren<{ theme: Theme; style?: object }>) {
  return <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }, style]}>{children}</View>;
}

export function GradientFill({ colors, vertical = false }: { colors: [string, string]; vertical?: boolean }) {
  return <View pointerEvents="none" style={[styles.gradientFill, { backgroundColor: colors[0], experimental_backgroundImage: `linear-gradient(${vertical ? '180deg' : '90deg'}, ${colors[0]} 0%, ${colors[1]} 100%)` }]} />;
}

export function Heading({ title, subtitle, theme, trailing }: { title: string; subtitle?: string; theme: Theme; trailing?: ReactNode }) {
  return <View style={styles.headingRow}><View style={styles.headingText}><Text style={[styles.heading, { color: theme.text }]}>{title}</Text>
    {subtitle ? <Text style={[styles.subtitle, { color: theme.muted }]}>{subtitle}</Text> : null}</View>{trailing}</View>;
}

export function TextField({ value, onChangeText, placeholder, theme, maxLength, multiline = false, onFocus, onBlur, inputRef, autoFocus = false }: {
  value: string; onChangeText: (value: string) => void; placeholder: string; theme: Theme; maxLength?: number; multiline?: boolean;
  onFocus?: () => void; onBlur?: () => void; inputRef?: React.RefObject<TextInputElement | null>; autoFocus?: boolean;
}) {
  return <TextInput ref={inputRef} value={value} onChangeText={onChangeText} placeholder={placeholder}
    placeholderTextColor={theme.muted} maxLength={maxLength} multiline={multiline} autoFocus={autoFocus}
    onFocus={onFocus} onBlur={onBlur} selectionColor={theme.focus}
    style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.raised }, multiline && styles.multiline]} />;
}

const styles = StyleSheet.create({
  button: { minHeight: 54, overflow: 'hidden', borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, recording: { minHeight: 59 }, gradientFill: { position: 'absolute', top: 2, right: 2, bottom: 2, left: 2, borderRadius: 18, overflow: 'hidden' },
  quiet: { borderColor: 'transparent' }, buttonIcon: { fontSize: 17, fontWeight: '700' }, buttonText: { flexShrink: 1, textAlign: 'center', fontSize: 15, fontWeight: '700' },
  panel: { borderRadius: 20, borderWidth: 1, padding: 16 }, headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headingText: { flex: 1 }, heading: { fontSize: 22, fontWeight: '800' }, subtitle: { marginTop: 4, fontSize: 14, lineHeight: 20 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 16 }, multiline: { minHeight: 90, paddingVertical: 12, textAlignVertical: 'top' },
});
