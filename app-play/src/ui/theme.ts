import { useColorScheme } from 'react-native';
export { contrastForeground } from './contrast';

export type Appearance = 'system' | 'dark' | 'light';

const dark = {
  background: '#090f22', surface: '#121c34', raised: '#1b2744',
  text: '#f5f3ff', muted: '#a8b1d0', border: '#34446c',
  primary: '#9246f8', secondary: '#eb57d7', focus: '#86e9df', danger: '#ff687a',
};

const light = {
  background: '#faf9ff', surface: '#ffffff', raised: '#f0edfb',
  text: '#17142d', muted: '#605d7c', border: '#d9d4ee',
  primary: '#713ee2', secondary: '#b32f97', focus: '#126a67', danger: '#ba234b',
};

export type Theme = typeof dark;

export function useTheme(appearance: Appearance): { theme: Theme; isDark: boolean } {
  const system = useColorScheme();
  const isDark = appearance === 'dark' || (appearance === 'system' && system !== 'light');
  return { theme: isDark ? dark : light, isDark };
}

export const padColors = ['#fa4458', '#ff8647', '#ffc948', '#55d96c', '#32d7d0', '#249af5', '#7f4bee', '#ec41ac'];
export const iconChoices = [
  { id: 'spark', glyph: '✦', label: 'Spark' }, { id: 'bolt', glyph: 'ϟ', label: 'Bolt' },
  { id: 'laugh', glyph: '☻', label: 'Smile' }, { id: 'music', glyph: '♫', label: 'Music' },
  { id: 'bell', glyph: '♬', label: 'Bell' }, { id: 'star', glyph: '★', label: 'Star' },
];
