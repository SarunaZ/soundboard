import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { Theme } from './theme';
import { clampEnd, clampStart, dragDeltaToTime, timeToPosition } from './waveformLayout';

export function formatTime(milliseconds: number): string {
  const total = Math.max(0, milliseconds);
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const hundredths = Math.floor((total % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

export function Waveform({ peaks, durationMs, startMs, endMs, previewPositionMs, previewActive = false, onChange, theme }: {
  peaks: number[]; durationMs: number; startMs: number; endMs: number; previewPositionMs?: number | null; previewActive?: boolean; onChange: (start: number, end: number) => void; theme: Theme;
}) {
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(1);
  const state = useRef({ startMs, endMs, durationMs, width, onChange, handle: 'start' as 'start' | 'end', grantMs: 0 });
  state.current = { ...state.current, startMs, endMs, durationMs, width, onChange };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      const current = state.current;
      const x = event.nativeEvent.locationX;
      const startX = timeToPosition(current.startMs, current.durationMs, current.width);
      const endX = timeToPosition(current.endMs, current.durationMs, current.width);
      current.handle = Math.abs(x - startX) <= Math.abs(x - endX) ? 'start' : 'end';
      current.grantMs = current.handle === 'start' ? current.startMs : current.endMs;
    },
    onPanResponderMove: (_event, gesture) => {
      const current = state.current;
      const target = current.grantMs + dragDeltaToTime(gesture.dx, current.durationMs, current.width);
      const start = current.handle === 'start' ? clampStart(target, current.endMs, current.durationMs) : current.startMs;
      const end = current.handle === 'end' ? clampEnd(target, current.startMs, current.durationMs) : current.endMs;
      current.onChange(start, end);
    },
  }), []);
  const bars = peaks.length ? Array.from({ length: Math.min(100, peaks.length) }, (_, index) => {
    const count = Math.min(100, peaks.length);
    const from = Math.floor(index * peaks.length / count);
    const to = Math.max(from + 1, Math.ceil((index + 1) * peaks.length / count));
    return Math.max(...peaks.slice(from, to));
  }) : Array.from({ length: 64 }, () => 0.08);
  const startX = timeToPosition(startMs, durationMs, width);
  const endX = timeToPosition(endMs, durationMs, width);
  const selectedColor = theme.name === 'Coffee' ? theme.primary : theme.focus;
  const playedColor = theme.name === 'Coffee' ? theme.focus : theme.primary;
  const playheadMs = previewPositionMs == null ? startMs : Math.max(startMs, Math.min(endMs, previewPositionMs));
  const playheadX = timeToPosition(playheadMs, durationMs, width);
  const stackedTimes = fontScale > 1.2 || width < 300;
  return <View>
    <View onLayout={(event) => setWidth(Math.max(1, event.nativeEvent.layout.width))} {...pan.panHandlers}
      style={[styles.track, { backgroundColor: theme.raised }]} accessible accessibilityRole="adjustable"
      accessibilityLabel="Audio trim range. Drag the nearest start or end handle."
      accessibilityValue={{ min: 0, max: durationMs, now: startMs }}>
      <View pointerEvents="none" style={[styles.selection, { left: startX, width: Math.max(0, endX - startX), backgroundColor: theme.primary }]} />
      <View pointerEvents="none" style={styles.bars}>{bars.map((peak, index) => {
        const ratio = (index + 0.5) / bars.length;
        const selected = ratio >= startMs / durationMs && ratio <= endMs / durationMs;
        const played = selected && previewActive && ratio <= playheadMs / durationMs;
        return <View key={index} style={[styles.bar, { height: `${Math.max(8, peak * 90)}%`, backgroundColor: played ? playedColor : selected ? selectedColor : theme.muted }]} />;
      })}</View>
      {previewActive ? <View pointerEvents="none" style={[styles.playhead, { left: playheadX, backgroundColor: playedColor }]} /> : null}
      <View pointerEvents="none" style={[styles.handle, { left: startX, backgroundColor: theme.primary }]}><View style={[styles.grip, { backgroundColor: '#ffffff' }]} /></View>
      <View pointerEvents="none" style={[styles.handle, { left: endX, backgroundColor: theme.primary }]}><View style={[styles.grip, { backgroundColor: '#ffffff' }]} /></View>
    </View>
    {stackedTimes ? <View style={styles.stackedTimes}>
      <View style={styles.timeEndpoints}><Text style={[styles.timeText, { color: theme.text }]}>{formatTime(startMs)}</Text><Text style={[styles.timeText, { color: theme.text }]}>{formatTime(endMs)}</Text></View>
      <Text style={[styles.timeText, { color: theme.focus, textAlign: 'center', alignSelf: 'stretch' }]}>{formatTime(endMs - startMs)} selected</Text>
    </View> : <View style={styles.times}>
      <Text style={[styles.timeText, { color: theme.text }]}>{formatTime(startMs)}</Text>
      <Text style={[styles.timeText, { color: theme.focus }]}>{formatTime(endMs - startMs)} selected</Text>
      <Text style={[styles.timeText, { color: theme.text }]}>{formatTime(endMs)}</Text>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  track: { height: 174, borderRadius: 16, overflow: 'hidden', justifyContent: 'center', position: 'relative', marginTop: 2, paddingHorizontal: 12 },
  selection: { position: 'absolute', top: 0, bottom: 0, opacity: 0.38 },
  bars: { height: '76%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', gap: 2 },
  bar: { flex: 1, minWidth: 1, borderRadius: 2, opacity: 0.92 },
  handle: { position: 'absolute', top: 0, bottom: 0, width: 18, marginLeft: -9, borderRadius: 8, alignItems: 'center', justifyContent: 'center', zIndex: 2, borderWidth: 1, borderColor: '#f2d6ff' },
  playhead: { position: 'absolute', top: 8, bottom: 8, width: 3, marginLeft: -1.5, opacity: 0.95, zIndex: 1, borderRadius: 2 },
  grip: { width: 4, height: 38, borderRadius: 3 },
  timeText: { fontSize: 12, fontWeight: '700' },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9, marginBottom: 17, alignItems: 'center', gap: 4 },
  stackedTimes: { marginTop: 9, marginBottom: 17, gap: 3 }, timeEndpoints: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
});
