import { useColorScheme } from 'react-native';
export { contrastForeground } from './contrast';

export type ThemeName = 'Peach' | 'Mint' | 'Snow' | 'Ice' | 'Vanilla' | 'Chocolate' | 'Grape' | 'Nut' | 'Blackberry';
export type Appearance = ThemeName | 'system' | 'dark' | 'light';

export interface Theme {
  name: ThemeName;
  background: string;
  surface: string;
  navSurface: string;
  surfaceAlt: string;
  raised: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  primary: string;
  primaryGradient: [string, string];
  recordingGradient: [string, string];
  softGradient: [string, string];
  secondary: string;
  focus: string;
  danger: string;
}

export const themeNames: ThemeName[] = ['Vanilla', 'Peach', 'Mint', 'Snow', 'Ice', 'Chocolate', 'Grape', 'Nut', 'Blackberry'];
export const themes: Record<ThemeName, Theme> = {
  Peach: { name: 'Peach', background: '#FFEAE6', surface: '#FFF6F2', navSurface: '#FFF1EC', surfaceAlt: '#FFDCD4', raised: '#FFDCD4', border: '#EFCBC4', text: '#21183A', muted: '#776A87', accent: '#A855F7', primary: '#A855F7', primaryGradient: ['#A777FF', '#7725EE'], recordingGradient: ['#FF8AB6', '#EF3EAA'], softGradient: ['#FFF3ED', '#FFE4DD'], secondary: '#A855F7', focus: '#8B5CF6', danger: '#CF344F' },
  Mint: { name: 'Mint', background: '#EAFBF0', surface: '#F6FFFA', navSurface: '#EFFFF6', surfaceAlt: '#D1F2E0', raised: '#D1F2E0', border: '#BCE6D0', text: '#151B33', muted: '#607D7A', accent: '#8B5CF6', primary: '#8B5CF6', primaryGradient: ['#A777FF', '#7725EE'], recordingGradient: ['#FF8AB6', '#EF3EAA'], softGradient: ['#F6FFFA', '#DEF8E9'], secondary: '#8B5CF6', focus: '#7351D8', danger: '#C8324E' },
  Snow: { name: 'Snow', background: '#F8FAFC', surface: '#FFFFFF', navSurface: '#F9FBFD', surfaceAlt: '#E9EFF5', raised: '#E9EFF5', border: '#D8E1E9', text: '#151A36', muted: '#60718A', accent: '#8B5CF6', primary: '#8B5CF6', primaryGradient: ['#A777FF', '#7725EE'], recordingGradient: ['#FF8AB6', '#EF3EAA'], softGradient: ['#FFFFFF', '#EFF4F9'], secondary: '#8B5CF6', focus: '#7351D8', danger: '#B72D49' },
  Ice: { name: 'Ice', background: '#E7F4FF', surface: '#F7FBFF', navSurface: '#EEF8FF', surfaceAlt: '#D6ECFF', raised: '#D6ECFF', border: '#BED9F2', text: '#142043', muted: '#627B9D', accent: '#8B5CF6', primary: '#8B5CF6', primaryGradient: ['#A777FF', '#7725EE'], recordingGradient: ['#FF8AB6', '#EF3EAA'], softGradient: ['#F7FBFF', '#DFEDFF'], secondary: '#8B5CF6', focus: '#7351D8', danger: '#B72D49' },
  Vanilla: { name: 'Vanilla', background: '#FFF8EC', surface: '#FFFDFA', navSurface: '#FFF9F1', surfaceAlt: '#F4E9D7', raised: '#F4E9D7', border: '#E8DCCA', text: '#241B35', muted: '#7F7280', accent: '#8B5CF6', primary: '#8B5CF6', primaryGradient: ['#A777FF', '#7725EE'], recordingGradient: ['#FF8AB6', '#EF3EAA'], softGradient: ['#FFFDFA', '#FFF3E0'], secondary: '#8B5CF6', focus: '#7351D8', danger: '#B72D49' },
  Chocolate: { name: 'Chocolate', background: '#1F1B18', surface: '#302620', navSurface: '#211B1A', surfaceAlt: '#3E2F27', raised: '#3E2F27', border: '#59443D', text: '#FFF9F5', muted: '#BAA8AD', accent: '#C084FC', primary: '#C084FC', primaryGradient: ['#A777FF', '#7725EE'], recordingGradient: ['#FF8AB6', '#EF3EAA'], softGradient: ['#3B2B28', '#251E1C'], secondary: '#C084FC', focus: '#D2A6FF', danger: '#FF7184' },
  Grape: { name: 'Grape', background: '#21182A', surface: '#302239', navSurface: '#251B30', surfaceAlt: '#3D2D49', raised: '#3D2D49', border: '#554264', text: '#FBF7FF', muted: '#B7A7C5', accent: '#D29BFF', primary: '#D29BFF', primaryGradient: ['#A777FF', '#7725EE'], recordingGradient: ['#FF8AB6', '#EF3EAA'], softGradient: ['#392842', '#241A30'], secondary: '#D29BFF', focus: '#E1BCFF', danger: '#FF8298' },
  Nut: { name: 'Nut', background: '#25201C', surface: '#372C25', navSurface: '#2B241F', surfaceAlt: '#48382E', raised: '#48382E', border: '#5F4A3D', text: '#FFF8F0', muted: '#C0AA98', accent: '#E0A971', primary: '#E0A971', primaryGradient: ['#A777FF', '#7725EE'], recordingGradient: ['#FF8AB6', '#EF3EAA'], softGradient: ['#413329', '#2A231F'], secondary: '#E0A971', focus: '#F0C394', danger: '#FF8290' },
  Blackberry: { name: 'Blackberry', background: '#151824', surface: '#242638', navSurface: '#1A1E2D', surfaceAlt: '#303348', raised: '#303348', border: '#45495F', text: '#F7F7FF', muted: '#A6A9BD', accent: '#B6A2FF', primary: '#B6A2FF', primaryGradient: ['#A777FF', '#7725EE'], recordingGradient: ['#FF8AB6', '#EF3EAA'], softGradient: ['#2C2E43', '#1A1D2C'], secondary: '#B6A2FF', focus: '#CEC0FF', danger: '#FF8295' },
};

export function normalizeAppearance(value: Appearance): ThemeName {
  if (value in themes) return value as ThemeName;
  if (value === 'Coffee' as ThemeName) return 'Chocolate';
  if (value === 'dark') return 'Chocolate';
  return 'Vanilla';
}

export function useTheme(appearance: Appearance): { theme: Theme; isDark: boolean } {
  const system = useColorScheme();
  const name = appearance === 'system' ? (system === 'dark' ? 'Chocolate' : 'Vanilla') : normalizeAppearance(appearance);
  return { theme: themes[name], isDark: ['Chocolate', 'Grape', 'Nut', 'Blackberry'].includes(name) };
}

export const padColors = ['#fa4458', '#ff8647', '#ffc948', '#55d96c', '#32d7d0', '#249af5', '#7f4bee', '#ec41ac'];
export const iconChoices = [
  { id: 'spark', glyph: '✦', label: 'Spark' }, { id: 'bolt', glyph: 'ϟ', label: 'Bolt' },
  { id: 'laugh', glyph: '☻', label: 'Smile' }, { id: 'music', glyph: '♫', label: 'Music' },
  { id: 'bell', glyph: '♬', label: 'Bell' }, { id: 'star', glyph: '★', label: 'Star' },
];
