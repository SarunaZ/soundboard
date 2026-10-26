import { StyleSheet, View, type ViewStyle } from 'react-native';
import { GradientFill } from './controls';
import type { PadGradientStops } from '../data/padColors';

export { PAD_GRADIENTS, padGradientStops } from '../data/padColors';
export type { PadGradientStops } from '../data/padColors';

export function PadGradient({ colors, style, vertical = false }: { colors: PadGradientStops; style?: ViewStyle; vertical?: boolean }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}><GradientFill colors={colors} vertical={vertical} /></View>;
}
