import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { clipUrl, createSession, deleteSession, getEditorConfig, previewUrl, renderSession } from './api';
import { MAX_CLIP_MS, clampRange, type EditorSession } from './protocol';
import { formatTime, WaveformRange } from './WaveformRange';

type Phase = 'idle' | 'fetching' | 'ready' | 'rendering' | 'rendered' | 'saving';

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Paste a YouTube link to get started.',
  fetching: 'Preparing audio preview… this can take a few minutes.',
  ready: 'Drag either handle to choose a moment up to 60 seconds.',
  rendering: 'Rendering your selection…',
  rendered: 'Preview the rendered clip, then save it to this device.',
  saving: 'Saving audio to this device…',
};

export function EditorScreen({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const player = useAudioPlayer(null, { updateInterval: 150, preferredForwardBufferDuration: 4 });
  const status = useAudioPlayerStatus(player);
  const [videoUrl, setVideoUrl] = useState('');
  const [title, setTitle] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [session, setSession] = useState<EditorSession | null>(null);
  const [startMs, setStartMs] = useState(0);
  const [endMs, setEndMs] = useState(5000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const operation = useRef<AbortController | null>(null);
  const runId = useRef(0);
  const playbackId = useRef(0);
  const sessionRef = useRef<EditorSession | null>(null);

  const stopPreview = useCallback(() => {
    playbackId.current += 1;
    try { player.pause(); } catch { /* Player may not have completed loading. */ }
  }, [player]);

  const setCurrentSession = useCallback((next: EditorSession) => {
    sessionRef.current = next;
    setSession(next);
    if (next.title && !title.trim()) setTitle(next.title.slice(0, 100));
  }, [title]);

  useEffect(() => {
    if (!session?.previewPath) return;
    try {
      const config = getEditorConfig();
      const rendered = (phase === 'rendered' || phase === 'saving') && session.clipPath;
      player.replace({
        uri: rendered ? clipUrl(config, session) : previewUrl(config, session),
        headers: { Authorization: `Bearer ${config.token}` },
        name: rendered ? 'Trimmed clip' : (session.title ?? 'Source preview'),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the audio preview.');
    }
    return () => { stopPreview(); };
  }, [phase, player, session?.id, session?.previewPath, session?.clipPath, session?.title, stopPreview, title]);

  useEffect(() => {
    if (!['ready', 'rendered', 'saving'].includes(phase)) return;
    const playbackEnd = phase === 'rendered' || phase === 'saving' ? endMs - startMs : endMs;
    if (status.playing && status.currentTime * 1000 >= playbackEnd) stopPreview();
  }, [endMs, phase, startMs, status.currentTime, status.playing, stopPreview]);

  useEffect(() => {
    if (status.error) setError(`Audio preview failed: ${status.error}`);
  }, [status.error]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stopPreview();
    });
    return () => subscription.remove();
  }, [stopPreview]);

  useEffect(() => () => {
    runId.current += 1;
    operation.current?.abort();
    stopPreview();
    const active = sessionRef.current;
    if (active) {
      try { void deleteSession(getEditorConfig(), active.id).catch(() => undefined); } catch { /* No valid config; session TTL will clean up. */ }
    }
  }, [stopPreview]);

  const abandon = useCallback(() => {
    runId.current += 1;
    operation.current?.abort();
    operation.current = null;
    stopPreview();
    const active = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    if (active) {
      try { void deleteSession(getEditorConfig(), active.id).catch(() => undefined); } catch { /* Service cleanup is best effort. */ }
    }
    setBusy(false);
    setPhase('idle');
    setError('');
    setNotice('');
  }, [stopPreview]);

  const submitUrl = async () => {
    abandon();
    const run = ++runId.current;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setPhase('fetching');
    setError('');
    setNotice('');
    try {
      const config = getEditorConfig();
      const ready = await createSession(config, videoUrl, controller.signal, (update) => {
        if (run === runId.current) setCurrentSession(update);
      });
      if (run !== runId.current) return;
      setCurrentSession(ready);
      setTitle(ready.title?.slice(0, 100) || '');
      const duration = ready.durationMs;
      if (!duration) throw new Error('The editor did not return a source duration.');
      const [start, end] = clampRange(0, Math.min(5000, duration), duration);
      setStartMs(start);
      setEndMs(end);
      setPhase('ready');
    } catch (cause) {
      if (run === runId.current && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Could not prepare this YouTube link.');
        setPhase('idle');
      }
    } finally {
      if (run === runId.current) setBusy(false);
    }
  };

  const submitRender = async () => {
    if (!session) return;
    stopPreview();
    const run = ++runId.current;
    const controller = new AbortController();
    operation.current?.abort();
    operation.current = controller;
    setBusy(true);
    setPhase('rendering');
    setError('');
    setNotice('');
    try {
      const config = getEditorConfig();
      const rendered = await renderSession(config, session, startMs, endMs, controller.signal, (update) => {
        if (run === runId.current) setCurrentSession(update);
      });
      if (run !== runId.current) return;
      setCurrentSession(rendered);
      setPhase('rendered');
    } catch (cause) {
      if (run === runId.current && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Could not render this selection.');
        setPhase('ready');
      }
    } finally {
      if (run === runId.current) setBusy(false);
    }
  };

  const saveRendered = async () => {
    if (!session) return;
    if (session.trimStartMs === null || session.trimEndMs === null || session.trimEndMs <= session.trimStartMs) {
      setError('The editor service did not confirm the rendered trim range. Render the selection again.');
      setPhase('ready');
      return;
    }
    setBusy(true);
    setPhase('saving');
    setError('');
    const controller = new AbortController();
    operation.current?.abort();
    operation.current = controller;
    const run = ++runId.current;
    try {
      const config = getEditorConfig();
      await import('./library').then(({ saveRenderedClip }) =>
        saveRenderedClip(clipUrl(config, session), config.token, title || session.title || 'Untitled clip', session.trimEndMs! - session.trimStartMs!, controller.signal));
      if (run !== runId.current) return;
      const savedSession = sessionRef.current;
      sessionRef.current = null;
      setSession(null);
      setNotice('Saved on this device. It will play offline and is private to this app.');
      setPhase('idle');
      stopPreview();
      if (savedSession) void deleteSession(config, savedSession.id).catch(() => undefined);
    } catch (cause) {
      if (run === runId.current && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Could not save this clip.');
        setPhase('rendered');
      }
    } finally {
      if (run === runId.current) setBusy(false);
    }
  };

  const previewSelection = () => {
    if (!session || !status.isLoaded) {
      setError('The source preview is still loading. Try again in a moment.');
      return;
    }
    setError('');
    const playback = ++playbackId.current;
    const seekTo = phase === 'rendered' ? 0 : startMs / 1000;
    void player.seekTo(seekTo).then(() => {
      if (playback !== playbackId.current || !sessionRef.current) return;
      player.play();
    }).catch(() => {
      setError('The preview could not seek to this selection. Try moving a handle slightly.');
    });
  };

  const changeRange = (start: number, end: number) => {
    stopPreview();
    if (phase === 'rendered') setPhase('ready');
    setStartMs(start);
    setEndMs(end);
  };

  const adjust = (handle: 'start' | 'end', delta: number) => {
    if (!session?.durationMs) return;
    if (handle === 'start') {
      const next = Math.max(Math.max(0, endMs - MAX_CLIP_MS), Math.min(endMs - Math.min(100, session.durationMs), startMs + delta));
      changeRange(next, endMs);
    } else {
      const next = Math.max(startMs + Math.min(100, session.durationMs), Math.min(Math.min(session.durationMs, startMs + MAX_CLIP_MS), endMs + delta));
      changeRange(startMs, next);
    }
  };

  const sourceReady = !!session && ['ready', 'rendering', 'rendered', 'saving'].includes(phase);
  const renderable = !!session && phase === 'ready' && !busy;
  const playback = status.playing;

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topline}>
          <View style={styles.headingGroup}>
            <Text style={styles.eyebrow}>LOCAL CLIPS</Text>
            <Text style={styles.heading}>Make a sound</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onOpenLibrary} style={styles.libraryLink}>
            <Text style={styles.libraryLinkText}>LIBRARY ↗</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>YOUTUBE LINK</Text>
          <TextInput
            value={videoUrl}
            onChangeText={setVideoUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://youtu.be/…"
            placeholderTextColor="#737d86"
            editable={!busy}
            accessibilityLabel="YouTube video link"
            style={styles.input}
          />
          <Pressable accessibilityRole="button" disabled={!videoUrl.trim() || busy} onPress={() => void submitUrl()} style={[styles.primary, (!videoUrl.trim() || busy) && styles.disabled]}>
            {busy && phase === 'fetching' ? <ActivityIndicator color="#12221d" /> : <Text style={styles.primaryText}>LOAD PREVIEW</Text>}
          </Pressable>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, (phase === 'fetching' || phase === 'rendering' || phase === 'saving') && styles.statusBusy]} />
          <Text style={styles.statusText}>{PHASE_LABEL[phase]}</Text>
        </View>

        {session && session.durationMs !== null && sourceReady ? (
          <View style={styles.card}>
            <View style={styles.sourceRow}>
              <View style={styles.sourceCopy}>
                <Text style={styles.label}>{phase === 'rendered' || phase === 'saving' ? 'RENDERED CLIP' : 'SOURCE PREVIEW'}</Text>
                <Text numberOfLines={2} style={styles.sourceTitle}>{session.title || 'YouTube audio'}</Text>
                <Text style={styles.muted}>{phase === 'rendered' || phase === 'saving' ? `${formatTime(endMs - startMs)} selection · streams from your service` : `${formatTime(session.durationMs)} total · streams from your service`}</Text>
              </View>
              <Pressable accessibilityRole="button" disabled={!status.isLoaded} onPress={playback ? stopPreview : previewSelection} style={styles.playButton}>
                <Text style={styles.playButtonText}>{playback ? 'STOP' : status.isLoaded ? 'PREVIEW' : '…'}</Text>
              </Pressable>
            </View>
          <WaveformRange peaks={session.peaks} durationMs={session.durationMs} startMs={startMs} endMs={endMs} onChange={changeRange} disabled={busy} />
            <View style={styles.adjustGroup}>
              <View style={styles.adjustRow}>
                <Text style={styles.adjustLabel}>START</Text>
                <Text style={styles.adjustValue}>{formatTime(startMs)}</Text>
                <AdjustButton disabled={busy} label="−1s" onPress={() => adjust('start', -1000)} />
                <AdjustButton disabled={busy} label="−100ms" onPress={() => adjust('start', -100)} />
                <AdjustButton disabled={busy} label="+100ms" onPress={() => adjust('start', 100)} />
                <AdjustButton disabled={busy} label="+1s" onPress={() => adjust('start', 1000)} />
              </View>
              <View style={styles.adjustRow}>
                <Text style={styles.adjustLabel}>END</Text>
                <Text style={styles.adjustValue}>{formatTime(endMs)}</Text>
                <AdjustButton disabled={busy} label="−1s" onPress={() => adjust('end', -1000)} />
                <AdjustButton disabled={busy} label="−100ms" onPress={() => adjust('end', -100)} />
                <AdjustButton disabled={busy} label="+100ms" onPress={() => adjust('end', 100)} />
                <AdjustButton disabled={busy} label="+1s" onPress={() => adjust('end', 1000)} />
              </View>
            </View>
            <Text style={styles.selectionNote}>{formatTime(endMs - startMs)} selection · up to 60 seconds</Text>
            {phase === 'rendered' ? (
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" onPress={previewSelection} style={styles.secondary}><Text style={styles.secondaryText}>PLAY SELECTION</Text></Pressable>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void saveRendered()} style={[styles.primary, styles.actionPrimary]}>
                  {busy ? <ActivityIndicator color="#12221d" /> : <Text style={styles.primaryText}>SAVE OFFLINE</Text>}
                </Pressable>
              </View>
            ) : (
              <Pressable accessibilityRole="button" disabled={!renderable} onPress={() => void submitRender()} style={[styles.primary, !renderable && styles.disabled]}>
                {busy && phase === 'rendering' ? <ActivityIndicator color="#12221d" /> : <Text style={styles.primaryText}>RENDER SELECTION</Text>}
              </Pressable>
            )}
          </View>
        ) : null}

        {session && (phase === 'ready' || phase === 'rendered') ? <TextInput value={title} onChangeText={setTitle} maxLength={100} placeholder="Name this clip" placeholderTextColor="#737d86" style={[styles.input, styles.titleInput]} accessibilityLabel="Name for the saved clip" /> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.success}>{notice} <Pressable onPress={onOpenLibrary}><Text style={styles.inlineLink}>Open library</Text></Pressable></Text> : null}
        {session || busy ? <Pressable accessibilityRole="button" onPress={abandon} style={styles.cancel}><Text style={styles.cancelText}>{busy ? 'CANCEL' : 'CANCEL SESSION'}</Text></Pressable> : null}
        <Text style={styles.privacy}>Saved clips stay in this app’s private storage. Uninstalling the app removes them.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AdjustButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Adjust by ${label}`} disabled={disabled} onPress={onPress} style={[styles.adjustButton, disabled && styles.disabled]}><Text style={styles.adjustButtonText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#14161a' },
  content: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 36, gap: 14 },
  topline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 3 },
  headingGroup: { gap: 3 },
  eyebrow: { color: '#67d9b2', letterSpacing: 2.1, fontSize: 10, fontWeight: '700' },
  heading: { color: '#f5f6f8', fontWeight: '700', fontSize: 27, letterSpacing: -0.5 },
  libraryLink: { padding: 9, borderWidth: 1, borderColor: '#394149', borderRadius: 10 },
  libraryLinkText: { color: '#b9c2c8', fontSize: 10, letterSpacing: 1.1, fontWeight: '700' },
  card: { backgroundColor: '#1a1e23', borderRadius: 18, borderWidth: 1, borderColor: '#262d32', padding: 16, gap: 12 },
  label: { color: '#89939a', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  input: { minHeight: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#343c43', backgroundColor: '#111418', color: '#f1f4f5', fontSize: 15 },
  primary: { minHeight: 48, borderRadius: 12, backgroundColor: '#71e1ba', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { color: '#10251d', fontSize: 11, letterSpacing: 1.2, fontWeight: '800' },
  disabled: { opacity: 0.42 },
  statusRow: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#677078' },
  statusBusy: { backgroundColor: '#e7bd61' },
  statusText: { color: '#a1aab1', fontSize: 12, flex: 1 },
  sourceRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  sourceCopy: { flex: 1, gap: 4 },
  sourceTitle: { color: '#f4f5f6', fontSize: 16, fontWeight: '600' },
  muted: { color: '#8a949b', fontSize: 11 },
  playButton: { backgroundColor: '#2b3338', borderRadius: 12, height: 42, minWidth: 82, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  playButtonText: { color: '#c8d2d4', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  adjustGroup: { gap: 8, marginTop: 12 },
  adjustRow: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  adjustLabel: { color: '#829098', fontSize: 9, letterSpacing: 1, fontWeight: '700', width: 35 },
  adjustValue: { color: '#dce5e8', fontVariant: ['tabular-nums'], fontSize: 11, width: 48 },
  adjustButton: { borderRadius: 7, backgroundColor: '#242c31', paddingVertical: 8, paddingHorizontal: 6, flex: 1, alignItems: 'center' },
  adjustButtonText: { color: '#c2ced1', fontSize: 9, fontVariant: ['tabular-nums'] },
  selectionNote: { color: '#89969d', fontSize: 11, marginTop: 1 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  secondary: { minHeight: 48, flex: 1, borderRadius: 12, borderWidth: 1, borderColor: '#404c52', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#d7e2e2', fontWeight: '700', fontSize: 10, letterSpacing: 0.8 },
  actionPrimary: { flex: 1 },
  titleInput: { marginTop: -5 },
  error: { color: '#ff8c9a', fontSize: 13, lineHeight: 19, backgroundColor: '#341d24', borderRadius: 10, padding: 12 },
  success: { color: '#91e9c8', fontSize: 13, lineHeight: 20, backgroundColor: '#17352c', borderRadius: 10, padding: 12 },
  inlineLink: { color: '#b0f5dc', fontWeight: '700', textDecorationLine: 'underline' },
  cancel: { paddingVertical: 10, alignItems: 'center' },
  cancelText: { color: '#858f95', fontSize: 10, letterSpacing: 1.4, fontWeight: '700' },
  privacy: { color: '#68737a', fontSize: 11, textAlign: 'center', lineHeight: 17, marginTop: 3, paddingHorizontal: 12 },
});
