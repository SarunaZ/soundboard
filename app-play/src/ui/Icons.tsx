import { Text, View } from 'react-native';

export type IconName = 'board' | 'waveform' | 'database' | 'library' | 'device-audio' | 'controller' | 'pencil' | 'chevron' | 'close' | 'back' | 'file' | 'mic' | 'check' | 'music' | 'image' | 'search' | 'play' | 'stop' | 'plus' | 'spark' | 'sun' | 'sort' | 'more' | 'upload' | 'video';

export function Icon({ name, size = 22, color = '#FFFFFF', cutColor = '#FFFFFF' }: { name: IconName; size?: number; color?: string; cutColor?: string }) {
  if (name === 'board') return <BoardIcon size={size} color={color} />;
  if (name === 'waveform') return <EditorIcon size={size} color={color} />;
  if (name === 'database' || name === 'library') return <LibraryIcon size={size} color={color} />;
  if (name === 'device-audio') return <DeviceAudioIcon size={size} color={color} />;
  if (name === 'search') return <SearchIcon size={size} color={color} />;
  if (name === 'mic') return <MicIcon size={size} color={color} />;
  if (name === 'upload') return <UploadIcon size={size * 1.12} color={color} />;
  if (name === 'file') return <FileIcon size={size} color={color} />;
  if (name === 'video') return <VideoIcon size={size} color={color} />;
  if (name === 'play') return <PlayIcon size={size} color={color} />;
  if (name === 'chevron' || name === 'back') return <ChevronIcon size={size} color={color} direction={name === 'back' ? 'left' : 'down'} />;
  if (name === 'check') return <CheckIcon size={size} color={color} />;
  if (name === 'close') return <CloseIcon size={size} color={color} />;
  if (name === 'more') return <MoreIcon size={size} color={color} />;
  if (name === 'plus') return <PlusIcon size={size} color={color} />;
  if (name === 'controller') return <ControllerIcon size={size} color={color} cutColor={cutColor} />;
  if (name === 'pencil') return <PencilIcon size={size} color={color} />;
  if (name === 'image') return <ImageIcon size={size} color={color} />;
  if (name === 'sort') return <SortIcon size={size} color={color} />;
  if (name === 'stop') return <View accessible={false} style={{ width: size * 0.58, height: size * 0.58, borderRadius: size * 0.1, backgroundColor: color }} />;
  const glyphs: Record<'music' | 'spark' | 'sun', string> = { music: '♫', spark: '✦', sun: '☼' };
  return <Text accessible={false} style={{ color, fontSize: size, lineHeight: size * 1.12, fontWeight: '700', textAlign: 'center', includeFontPadding: false }}>{glyphs[name as 'music' | 'spark' | 'sun']}</Text>;
}

export function BoardIcon({ size = 29, color = '#8B5CF6' }: { size?: number; color?: string }) {
  const gap = size * 0.08;
  const tile = (size - gap) / 2;
  return <View accessible={false} style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap', gap }}>
    {[0, 1, 2, 3].map((key) => <View key={key} style={{ width: tile, height: tile, borderRadius: size * 0.13, backgroundColor: color }} />)}
  </View>;
}

export function EditorIcon({ size = 29, color = '#8B5CF6' }: { size?: number; color?: string }) {
  const heights = [0.35, 0.58, 0.84, 0.48, 0.96, 0.66, 0.38];
  const barWidth = size * 0.075;
  return <View accessible={false} style={{ width: size, height: size, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
    {heights.map((height, index) => <View key={index} style={{ width: barWidth, height: size * height, borderRadius: barWidth, backgroundColor: color }} />)}
  </View>;
}

export function LibraryIcon({ size = 29, color = '#8B5CF6' }: { size?: number; color?: string }) {
  const stroke = Math.max(1.5, size * 0.075);
  const cardWidth = size * 0.65;
  const cardHeight = size * 0.72;
  return <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', top: size * 0.08, left: size * 0.08, width: cardWidth, height: cardHeight, borderWidth: stroke, borderColor: color, borderRadius: size * 0.14, backgroundColor: 'transparent' }} />
    <View style={{ position: 'absolute', top: size * 0.2, left: size * 0.25, width: cardWidth, height: cardHeight, borderWidth: stroke, borderColor: color, borderRadius: size * 0.14, backgroundColor: color }} />
    <View style={{ position: 'absolute', top: size * 0.46, left: size * 0.49, width: 0, height: 0, borderTopWidth: size * 0.15, borderBottomWidth: size * 0.15, borderLeftWidth: size * 0.22, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#FFFFFF' }} />
  </View>;
}

export function DeviceAudioIcon({ size = 48, color = '#FFFFFF' }: { size?: number; color?: string }) {
  const stroke = Math.max(1.7, size * 0.06);
  return <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', width: size * 0.43, height: size * 0.78, borderWidth: stroke, borderColor: color, borderRadius: size * 0.11 }} />
    <View style={{ position: 'absolute', bottom: size * 0.15, width: size * 0.09, height: size * 0.09, borderRadius: size, backgroundColor: color }} />
    <View style={{ position: 'absolute', right: size * 0.07, width: size * 0.19, height: size * 0.38, borderRightWidth: stroke, borderColor: color, borderRadius: size, transform: [{ scaleX: 0.75 }] }} />
    <View style={{ position: 'absolute', right: -size * 0.015, width: size * 0.28, height: size * 0.62, borderRightWidth: stroke, borderColor: color, borderRadius: size, transform: [{ scaleX: 0.75 }] }} />
  </View>;
}

export function SearchIcon({ size, color }: { size: number; color: string }) {
  const ring = size * 0.58;
  const stroke = Math.max(1.7, size * 0.085);
  return <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', top: size * 0.08, left: size * 0.08, width: ring, height: ring, borderRadius: ring, borderWidth: stroke, borderColor: color }} />
    <View style={{ position: 'absolute', width: size * 0.34, height: stroke, backgroundColor: color, borderRadius: stroke, right: size * 0.02, bottom: size * 0.14, transform: [{ rotate: '45deg' }] }} />
  </View>;
}

export function MicIcon({ size, color }: { size: number; color: string }) {
  const stroke = Math.max(1.6, size * 0.08);
  return <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', top: size * 0.06, width: size * 0.3, height: size * 0.53, borderRadius: size, borderWidth: stroke, borderColor: color }} />
    <View style={{ position: 'absolute', top: size * 0.24, width: size * 0.66, height: size * 0.42, borderLeftWidth: stroke, borderRightWidth: stroke, borderBottomWidth: stroke, borderColor: color, borderBottomLeftRadius: size * 0.38, borderBottomRightRadius: size * 0.38 }} />
    <View style={{ position: 'absolute', bottom: size * 0.05, width: stroke, height: size * 0.2, backgroundColor: color }} />
    <View style={{ position: 'absolute', bottom: size * 0.04, width: size * 0.38, height: stroke, borderRadius: stroke, backgroundColor: color }} />
  </View>;
}

export function UploadIcon({ size, color }: { size: number; color: string }) {
  const stroke = Math.max(1.8, size * 0.075);
  const arrowHead = size * 0.3;
  return <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', top: size * 0.08, width: stroke, height: size * 0.52, backgroundColor: color, borderRadius: stroke }} />
    <View style={{ position: 'absolute', top: size * 0.035, width: arrowHead, height: arrowHead, borderRightWidth: stroke, borderBottomWidth: stroke, borderColor: color, transform: [{ rotate: '225deg' }] }} />
    <View style={{ position: 'absolute', bottom: size * 0.08, left: size * 0.12, width: size * 0.76, height: size * 0.32, borderLeftWidth: stroke, borderRightWidth: stroke, borderBottomWidth: stroke, borderColor: color, borderBottomLeftRadius: size * 0.12, borderBottomRightRadius: size * 0.12 }} />
  </View>;
}

export function FileIcon({ size, color }: { size: number; color: string }) {
  const stroke = Math.max(1.6, size * 0.08);
  return <View accessible={false} style={{ width: size * 0.72, height: size * 0.86, borderWidth: stroke, borderColor: color, borderRadius: size * 0.08, overflow: 'hidden' }}>
    <View style={{ position: 'absolute', top: -stroke, right: -stroke, width: size * 0.28, height: size * 0.28, borderLeftWidth: stroke, borderBottomWidth: stroke, borderColor: color, backgroundColor: 'transparent' }} />
    <View style={{ position: 'absolute', left: size * 0.12, top: size * 0.48, width: size * 0.42, height: stroke, borderRadius: stroke, backgroundColor: color }} />
    <View style={{ position: 'absolute', left: size * 0.12, top: size * 0.65, width: size * 0.42, height: stroke, borderRadius: stroke, backgroundColor: color }} />
  </View>;
}

export function VideoIcon({ size, color }: { size: number; color: string }) {
  const stroke = Math.max(1.6, size * 0.08);
  return <View accessible={false} style={{ width: size * 0.82, height: size * 0.68, borderWidth: stroke, borderColor: color, borderRadius: size * 0.13, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 0, height: 0, borderTopWidth: size * 0.19, borderBottomWidth: size * 0.19, borderLeftWidth: size * 0.3, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: color, marginLeft: size * 0.05 }} />
  </View>;
}

export function PlayIcon({ size, color }: { size: number; color: string }) {
  return <View accessible={false} style={{ width: 0, height: 0, borderTopWidth: size * 0.42, borderBottomWidth: size * 0.42, borderLeftWidth: size * 0.65, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: color, marginLeft: size * 0.08 }} />;
}

export function ChevronIcon({ size, color, direction }: { size: number; color: string; direction: 'left' | 'down' }) {
  const corner = size * 0.36;
  const stroke = Math.max(1.8, size * 0.1);
  return <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: corner, height: corner, borderRightWidth: stroke, borderBottomWidth: stroke, borderColor: color, transform: [{ rotate: direction === 'left' ? '135deg' : '45deg' }] }} />
  </View>;
}

export function CheckIcon({ size, color }: { size: number; color: string }) {
  const stroke = Math.max(1.8, size * 0.1);
  return <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', width: size * 0.33, height: stroke, borderRadius: stroke, backgroundColor: color, transform: [{ rotate: '45deg' }], marginLeft: -size * 0.18, marginTop: size * 0.1 }} />
    <View style={{ position: 'absolute', width: size * 0.54, height: stroke, borderRadius: stroke, backgroundColor: color, transform: [{ rotate: '-48deg' }], marginLeft: size * 0.1, marginTop: -size * 0.08 }} />
  </View>;
}

export function CloseIcon({ size, color }: { size: number; color: string }) {
  const stroke = Math.max(1.7, size * 0.095);
  return <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', width: size * 0.76, height: stroke, borderRadius: stroke, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />
    <View style={{ position: 'absolute', width: size * 0.76, height: stroke, borderRadius: stroke, backgroundColor: color, transform: [{ rotate: '-45deg' }] }} />
  </View>;
}

export function MoreIcon({ size, color }: { size: number; color: string }) {
  const dot = size * 0.12;
  return <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'space-evenly', paddingVertical: size * 0.12 }}>
    {[0, 1, 2].map((key) => <View key={key} style={{ width: dot, height: dot, borderRadius: dot, backgroundColor: color }} />)}
  </View>;
}

export function PlusIcon({ size, color }: { size: number; color: string }) {
  const stroke = Math.max(1.8, size * 0.095);
  return <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', width: size * 0.76, height: stroke, borderRadius: stroke, backgroundColor: color }} />
    <View style={{ position: 'absolute', width: stroke, height: size * 0.76, borderRadius: stroke, backgroundColor: color }} />
  </View>;
}

export function ControllerIcon({ size, color, cutColor = '#FFFFFF' }: { size: number; color: string; cutColor?: string }) {
  return <View accessible={false} style={{ width: size, height: size * 0.7, borderRadius: size * 0.24, backgroundColor: color, alignItems: 'center', justifyContent: 'center', marginVertical: size * 0.15 }}>
    <View style={{ position: 'absolute', left: size * 0.13, width: size * 0.29, height: size * 0.07, borderRadius: 1, backgroundColor: cutColor }} />
    <View style={{ position: 'absolute', left: size * 0.24, width: size * 0.07, height: size * 0.29, borderRadius: 1, backgroundColor: cutColor }} />
    <View style={{ position: 'absolute', right: size * 0.15, top: size * 0.16, width: size * 0.08, height: size * 0.08, borderRadius: size, backgroundColor: cutColor }} />
    <View style={{ position: 'absolute', right: size * 0.1, top: size * 0.31, width: size * 0.08, height: size * 0.08, borderRadius: size, backgroundColor: cutColor }} />
  </View>;
}

export function PencilIcon({ size, color }: { size: number; color: string }) {
  return <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.68, height: size * 0.2, borderWidth: Math.max(1.2, size * 0.06), borderColor: color, borderRadius: size * 0.04, transform: [{ rotate: '-45deg' }] }} />
    <View style={{ position: 'absolute', bottom: size * 0.17, left: size * 0.18, width: size * 0.22, height: size * 0.12, borderTopWidth: Math.max(1.2, size * 0.06), borderLeftWidth: Math.max(1.2, size * 0.06), borderColor: color, transform: [{ rotate: '-45deg' }] }} />
  </View>;
}

export function ImageIcon({ size, color }: { size: number; color: string }) {
  const stroke = Math.max(1.5, size * 0.08);
  return <View accessible={false} style={{ width: size * 0.86, height: size * 0.7, borderWidth: stroke, borderColor: color, borderRadius: size * 0.12, overflow: 'hidden' }}>
    <View style={{ position: 'absolute', left: size * 0.15, top: size * 0.12, width: size * 0.12, height: size * 0.12, borderRadius: size, backgroundColor: color }} />
    <View style={{ position: 'absolute', bottom: -size * 0.08, left: size * 0.04, width: size * 0.48, height: size * 0.35, borderTopWidth: stroke, borderLeftWidth: stroke, borderColor: color, transform: [{ rotate: '45deg' }] }} />
    <View style={{ position: 'absolute', bottom: -size * 0.07, right: size * 0.03, width: size * 0.37, height: size * 0.28, borderTopWidth: stroke, borderLeftWidth: stroke, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>;
}

export function SortIcon({ size, color }: { size: number; color: string }) {
  const stroke = Math.max(1.4, size * 0.07);
  return <View accessible={false} style={{ width: size, height: size, justifyContent: 'center' }}>
    {[0, 1, 2].map((key) => <View key={key} style={{ width: size * (0.48 - key * 0.12), height: stroke, borderRadius: stroke, backgroundColor: color, marginVertical: size * 0.07 }} />)}
    <View style={{ position: 'absolute', right: size * 0.22, top: size * 0.12, width: stroke, height: size * 0.7, backgroundColor: color }} />
    <View style={{ position: 'absolute', right: size * 0.08, bottom: size * 0.1, width: size * 0.28, height: size * 0.28, borderRightWidth: stroke, borderBottomWidth: stroke, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>;
}
