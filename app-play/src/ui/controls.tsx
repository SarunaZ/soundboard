import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInput as TextInputElement } from 'react-native';
import type { Theme } from './theme';
import { contrastForeground } from './contrast';

export function ActionButton({ label, onPress, theme, variant = 'secondary', disabled = false, icon }: {
  label: string; onPress: () => void; theme: Theme; variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; disabled?: boolean; icon?: string;
}) {
  const backgroundColor = variant === 'primary' ? theme.primary : variant === 'danger' ? theme.danger : variant === 'quiet' ? 'transparent' : theme.raised;
  const color = variant === 'primary' || variant === 'danger' ? contrastForeground(backgroundColor) : theme.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled}
    style={({ pressed }) => [styles.button, { backgroundColor, borderColor: theme.border, opacity: disabled ? 0.45 : pressed ? 0.78 : 1 }, variant === 'quiet' && styles.quiet]}>
    {icon ? <Text style={[styles.buttonIcon, { color }]}>{icon}</Text> : null}
    <Text style={[styles.buttonText, { color }]}>{label}</Text>
  </Pressable>;
}

export function Panel({ theme, children, style }: PropsWithChildren<{ theme: Theme; style?: object }>) {
  return <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }, style]}>{children}</View>;
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
  button: { minHeight: 48, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  quiet: { borderColor: 'transparent' }, buttonIcon: { fontSize: 17, fontWeight: '700' }, buttonText: { fontSize: 15, fontWeight: '700' },
  panel: { borderRadius: 20, borderWidth: 1, padding: 16 }, headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headingText: { flex: 1 }, heading: { fontSize: 22, fontWeight: '800' }, subtitle: { marginTop: 4, fontSize: 14, lineHeight: 20 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 16 }, multiline: { minHeight: 90, paddingVertical: 12, textAlignVertical: 'top' },
});
