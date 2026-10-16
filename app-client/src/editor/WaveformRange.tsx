import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

import { MAX_CLIP_MS } from './protocol';

interface Props {
  peaks: number[];
  durationMs: number;
  startMs: number;
  endMs: number;
  onChange: (startMs: number, endMs: number) => void;
  playback?: { playheadMs: number; elapsedMs: number; durationMs: number } | null;
  disabled?: boolean;
}

export function formatTime(milliseconds: number): string {
  const total = Math.max(0, milliseconds);
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const hundredths = Math.floor((total % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

export function WaveformRange({ peaks, durationMs, startMs, endMs, onChange, playback = null, disabled = false }: Props) {
  const [width, setWidth] = useState(1);
  const state = useRef({ startMs, endMs, durationMs, width, onChange, disabled, handle: 'start' as 'start' | 'end', grantX: 0, grantMs: 0 });
  state.current = { ...state.current, startMs, endMs, durationMs, width, onChange, disabled };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !state.current.disabled,
    onMoveShouldSetPanResponder: () => !state.current.disabled,
    onPanResponderGrant: (event) => {
      const current = state.current;
      const x = event.nativeEvent.locationX;
      const startX = (current.startMs / current.durationMs) * current.width;
      const endX = (current.endMs / current.durationMs) * current.width;
      current.handle = Math.abs(x - startX) <= Math.abs(x - endX) ? 'start' : 'end';
      current.grantX = x;
      current.grantMs = current.handle === 'start' ? current.startMs : current.endMs;
    },
    onPanResponderMove: (_event, gesture) => {
      const current = state.current;
      const target = Math.round(current.grantMs + (gesture.dx / current.width) * current.durationMs);
      const minimum = Math.min(100, current.durationMs);
      const start = current.handle === 'start'
        ? Math.max(Math.max(0, current.endMs - MAX_CLIP_MS), Math.min(current.endMs - minimum, target))
        : current.startMs;
      const end = current.handle === 'end'
        ? Math.max(current.startMs + minimum, Math.min(Math.min(current.durationMs, current.startMs + MAX_CLIP_MS), target))
        : current.endMs;
      current.onChange(start, end);
    },
  }), []);

  const bars = peaks.length
    ? Array.from({ length: Math.min(100, peaks.length) }, (_, index) => {
        const count = Math.min(100, peaks.length);
        const from = Math.floor(index * peaks.length / count);
        const to = Math.max(from + 1, Math.ceil((index + 1) * peaks.length / count));
        return Math.max(...peaks.slice(from, to));
      })
    : Array.from({ length: 64 }, () => 0.08);
  const selectionStart = Math.max(0, Math.min(1, startMs / durationMs));
  const selectionEnd = Math.max(selectionStart, Math.min(1, endMs / durationMs));

  return (
    <View>
      <View
        onLayout={(event) => setWidth(Math.max(1, event.nativeEvent.layout.width))}
        {...pan.panHandlers}
        style={[styles.track, disabled && styles.disabled]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Audio trim range. Drag to move the nearest start or end handle."
        accessibilityValue={{ min: 0, max: durationMs, now: startMs }}
      >
        <View style={[styles.selected, { left: `${selectionStart * 100}%`, width: `${(selectionEnd - selectionStart) * 100}%` }]} />
        {playback ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View style={[styles.played, { left: `${selectionStart * 100}%`, width: `${Math.max(0, Math.min(1, (playback.playheadMs - startMs) / Math.max(1, endMs - startMs))) * (selectionEnd - selectionStart) * 100}%` }]} />
          </View>
        ) : null}
        <View style={styles.bars}>
          {bars.map((peak, index) => {
            const ratio = (index + 0.5) / bars.length;
            const selected = ratio >= selectionStart && ratio <= selectionEnd;
            return <View key={index} style={[styles.bar, { height: `${Math.max(8, peak * 90)}%`, backgroundColor: selected ? '#68e3bd' : '#59636d' }]} />;
          })}
        </View>
        {playback ? <View pointerEvents="none" style={[styles.playhead, { left: `${Math.max(selectionStart, Math.min(selectionEnd, playback.playheadMs / durationMs)) * 100}%` }]} /> : null}
        <View style={[styles.handle, { left: `${selectionStart * 100}%` }]} />
        <View style={[styles.handle, { left: `${selectionEnd * 100}%` }]} />
      </View>
      <View style={styles.times}>
        <Text style={styles.time}>{formatTime(startMs)}</Text>
        <Text style={styles.length}>
          {playback ? `${formatTime(playback.elapsedMs)} / ${formatTime(playback.durationMs)}` : `${formatTime(endMs - startMs)} selected`}
        </Text>
        <Text style={styles.time}>{formatTime(endMs)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 116, borderRadius: 14, backgroundColor: '#20262b', overflow: 'hidden', justifyContent: 'center', position: 'relative', marginTop: 8 },
  selected: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#225848', opacity: 0.55 },
  played: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#68e3bd', opacity: 0.16 },
  playhead: { position: 'absolute', top: 5, bottom: 5, width: 2, marginLeft: -1, borderRadius: 2, backgroundColor: '#f2fff9' },
  bars: { height: '76%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 8, gap: 2 },
  bar: { flex: 1, minWidth: 1, borderRadius: 2, opacity: 0.92 },
  handle: { position: 'absolute', top: 8, bottom: 8, width: 3, marginLeft: -1.5, borderRadius: 2, backgroundColor: '#9af2d5' },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, alignItems: 'center' },
  time: { color: '#e5e9ed', fontVariant: ['tabular-nums'], fontSize: 13 },
  length: { color: '#9af2d5', fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.48 },
});
