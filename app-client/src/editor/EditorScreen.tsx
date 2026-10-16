import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { clipUrl, createSession, deleteSession, getEditorConfig, previewUrl, renderSession } from './api';
import { MAX_CLIP_MS, clampRange, type EditorSession } from './protocol';
import { normalizeClipTitle } from './catalog';
import { formatTime, WaveformRange } from './WaveformRange';
import { getPlaybackPosition } from './playback';
import { disposeLocalAudioSource, pickLocalAudioSource, renderLocalAudioRange, saveLocalAudioRender, type LocalAudioRender, type LocalAudioSource } from './localAudio';
import { isOnDeviceYoutubeAvailable, isPrivateYoutubeRelease, openYoutubeOnDevice } from './onDeviceYoutube';
import { useKeyboardInputReveal } from '../keyboard/useKeyboardInputReveal';

type Phase = 'idle' | 'fetching' | 'ready' | 'rendering' | 'rendered' | 'saving';
type PreviewPlayback = { sourceKey: string; mode: 'source' | 'rendered'; startMs: number; endMs: number };

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Choose a device audio file or paste a YouTube link to get started.',
  fetching: 'Preparing audio preview… this can take a few minutes.',
  ready: 'Drag either handle to choose a moment up to 60 seconds.',
  rendering: 'Rendering your selection…',
  rendered: 'Preview the rendered clip, then save it to this device.',
  saving: 'Saving audio to this device…',
};

export function EditorScreen({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const player = useAudioPlayer(null, { updateInterval: 150, preferredForwardBufferDuration: 4 });
  const status = useAudioPlayerStatus(player);
  const privateYoutubeRelease = isPrivateYoutubeRelease();
  const [videoUrl, setVideoUrl] = useState('');
  const [title, setTitle] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [session, setSession] = useState<EditorSession | null>(null);
  const [localSource, setLocalSource] = useState<LocalAudioSource | null>(null);
  const [localRender, setLocalRender] = useState<LocalAudioRender | null>(null);
  const [selectingFile, setSelectingFile] = useState(false);
  const [loadingOnDeviceYoutube, setLoadingOnDeviceYoutube] = useState(false);
  const [startMs, setStartMs] = useState(0);
  const [endMs, setEndMs] = useState(5000);
  const [activePlayback, setActivePlayback] = useState<PreviewPlayback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const operation = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const videoUrlInput = useRef<TextInput>(null);
  const titleInput = useRef<TextInput>(null);
  const keyboardReveal = useKeyboardInputReveal(scrollRef, Platform.OS === 'android');
  const runId = useRef(0);
  const playbackId = useRef(0);
  const sessionRef = useRef<EditorSession | null>(null);
  const localSourceRef = useRef<LocalAudioSource | null>(null);
  const titleEdited = useRef(false);

  const stopPreview = useCallback(() => {
    playbackId.current += 1;
    setActivePlayback(null);
    try { player.pause(); } catch { /* Player may not have completed loading. */ }
  }, [player]);

  const setCurrentSession = useCallback((next: EditorSession) => {
    sessionRef.current = next;
    setSession(next);
    if (next.title && !titleEdited.current) setTitle(next.title.slice(0, 100));
  }, []);

  const setCurrentLocalSource = useCallback((next: LocalAudioSource | null) => {
    localSourceRef.current = next;
    setLocalSource(next);
  }, []);

  const setCurrentLocalRender = useCallback((next: LocalAudioRender | null) => {
    setLocalRender(next);
  }, []);

  useEffect(() => {
    if (localSource) {
      try {
        player.replace({
          uri: (phase === 'rendered' || phase === 'saving') && localRender ? localRender.uri : localSource.uri,
          name: (phase === 'rendered' || phase === 'saving') && localRender ? 'Trimmed clip' : localSource.title,
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not load the selected audio file.');
      }
      return () => { stopPreview(); };
    }
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
  }, [localRender, localSource, phase, player, session?.id, session?.previewPath, session?.clipPath, stopPreview]);

  useEffect(() => {
    if (!activePlayback) return;
    const playbackEnd = activePlayback.mode === 'rendered' ? activePlayback.endMs - activePlayback.startMs : activePlayback.endMs;
    const currentTimeMs = status.currentTime * 1000;
    if ((status.playing && currentTimeMs >= playbackEnd) ||
        (status.didJustFinish && !status.playing && currentTimeMs >= playbackEnd)) stopPreview();
  }, [activePlayback, status.currentTime, status.didJustFinish, status.playing, stopPreview]);

  useEffect(() => {
    if (status.error) {
      stopPreview();
      setError(`Audio preview failed: ${status.error}`);
    }
  }, [status.error, stopPreview]);

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
    const local = localSourceRef.current;
    localSourceRef.current = null;
    if (local) void disposeLocalAudioSource(local).catch(() => undefined);
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
    const local = localSourceRef.current;
    localSourceRef.current = null;
    if (local) void disposeLocalAudioSource(local).catch(() => undefined);
    setCurrentLocalSource(null);
    setCurrentLocalRender(null);
    if (active) {
      try { void deleteSession(getEditorConfig(), active.id).catch(() => undefined); } catch { /* Service cleanup is best effort. */ }
    }
    setBusy(false);
    setSelectingFile(false);
    setLoadingOnDeviceYoutube(false);
    setPhase('idle');
    setError('');
    setNotice('');
  }, [setCurrentLocalRender, setCurrentLocalSource, stopPreview]);

  const submitUrl = async () => {
    if (selectingFile) return;
    abandon();
    titleEdited.current = false;
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
      setCurrentLocalSource(null);
      setCurrentLocalRender(null);
      setCurrentSession(ready);
      titleEdited.current = false;
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

  const chooseDeviceFile = async () => {
    if (selectingFile || busy) return;
    runId.current += 1;
    operation.current?.abort();
    operation.current = null;
    stopPreview();
    const run = runId.current;
    const controller = new AbortController();
    operation.current = controller;
    setSelectingFile(true);
    setError('');
    setNotice('');
    try {
      const picked = await pickLocalAudioSource(controller.signal);
      if (run !== runId.current || controller.signal.aborted) {
        if (picked) void disposeLocalAudioSource(picked).catch(() => undefined);
        return;
      }
      if (!picked) return;
      const previous = localSourceRef.current;
      const remote = sessionRef.current;
      sessionRef.current = null;
      setSession(null);
      setCurrentLocalSource(picked);
      setCurrentLocalRender(null);
      if (previous && previous.id !== picked.id) void disposeLocalAudioSource(previous).catch(() => undefined);
      if (remote) {
        try { void deleteSession(getEditorConfig(), remote.id).catch(() => undefined); } catch { /* Service cleanup is best effort. */ }
      }
      titleEdited.current = false;
      setTitle(picked.title.slice(0, 100));
      setStartMs(0);
      setEndMs(Math.min(5000, picked.durationMs));
      setPhase('ready');
      setError('');
    } catch (cause) {
      if (run === runId.current && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Could not open this audio file.');
      }
    } finally {
      if (operation.current === controller) operation.current = null;
      if (run === runId.current) setSelectingFile(false);
    }
  };

  const loadYoutubeOnDevice = async () => {
    if (selectingFile || busy) return;
    if (!isOnDeviceYoutubeAvailable()) {
      setError('On-device YouTube loading is unavailable. Choose an audio file from this device instead.');
      return;
    }
    runId.current += 1;
    operation.current?.abort();
    operation.current = null;
    stopPreview();
    const run = runId.current;
    const controller = new AbortController();
    operation.current = controller;
    setSelectingFile(true);
    setLoadingOnDeviceYoutube(true);
    setError('');
    setNotice('');
    try {
      const opened = await openYoutubeOnDevice(videoUrl, controller.signal);
      if (run !== runId.current || controller.signal.aborted) {
        void disposeLocalAudioSource(opened).catch(() => undefined);
        return;
      }
      const previous = localSourceRef.current;
      const remote = sessionRef.current;
      sessionRef.current = null;
      setSession(null);
      setCurrentLocalSource(opened);
      setCurrentLocalRender(null);
      if (previous && previous.id !== opened.id) void disposeLocalAudioSource(previous).catch(() => undefined);
      if (remote) {
        try { void deleteSession(getEditorConfig(), remote.id).catch(() => undefined); } catch { /* Service cleanup is best effort. */ }
      }
      titleEdited.current = false;
      setTitle(opened.title.slice(0, 100));
      setStartMs(0);
      setEndMs(Math.min(5000, opened.durationMs));
      setPhase('ready');
      setError('');
    } catch (cause) {
      if (run === runId.current && !controller.signal.aborted) {
        setError(privateYoutubeRelease
          ? 'Could not load audio from this link. Check the URL and connection, or choose an audio file from this device.'
          : cause instanceof Error ? cause.message : 'On-device YouTube loading could not complete.');
      }
    } finally {
      if (operation.current === controller) operation.current = null;
      if (run === runId.current) {
        setSelectingFile(false);
        setLoadingOnDeviceYoutube(false);
      }
    }
  };

  const cancelPicker = () => {
    if (!selectingFile) return;
    runId.current += 1;
    operation.current?.abort();
    operation.current = null;
    setSelectingFile(false);
    setLoadingOnDeviceYoutube(false);
  };

  const submitRender = async () => {
    if (!session && !localSource) return;
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
      if (localSource) {
        const rendered = await renderLocalAudioRange(localSource, startMs, endMs, controller.signal);
        if (run !== runId.current) return;
        setCurrentLocalRender(rendered);
        setStartMs(rendered.startMs);
        setEndMs(rendered.endMs);
      } else {
        const rendered = await renderSession(getEditorConfig(), session!, startMs, endMs, controller.signal, (update) => {
          if (run === runId.current) setCurrentSession(update);
        });
        if (run !== runId.current) return;
        setCurrentSession(rendered);
      }
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
    if (!session && !localSource) return;
    let normalizedTitle: string;
    try {
      normalizedTitle = normalizeClipTitle(title);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Give this soundbite a name before saving.');
      return;
    }
    const confirmedStart = localSource ? localRender?.startMs : session?.trimStartMs;
    const confirmedEnd = localSource ? localRender?.endMs : session?.trimEndMs;
    if (confirmedStart !== startMs || confirmedEnd !== endMs || confirmedEnd <= confirmedStart) {
      setError('The rendered range no longer matches this selection. Render the selection again before saving.');
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
      const config = localSource ? null : getEditorConfig();
      if (localSource && localRender) {
        await saveLocalAudioRender(localSource, localRender, normalizedTitle, controller.signal);
      } else if (session && config) {
        await import('./library').then(({ saveRenderedClip }) =>
          saveRenderedClip(clipUrl(config, session), config.token, normalizedTitle, confirmedEnd! - confirmedStart!, controller.signal));
      }
      if (run !== runId.current) return;
      const savedSession = sessionRef.current;
      sessionRef.current = null;
      setSession(null);
      const savedLocalSource = localSourceRef.current;
      localSourceRef.current = null;
      setLocalSource(null);
      setLocalRender(null);
      if (savedLocalSource) void disposeLocalAudioSource(savedLocalSource).catch(() => undefined);
      setNotice('Saved on this device. It will play offline and is private to this app.');
      setPhase('idle');
      stopPreview();
      if (savedSession && config) void deleteSession(config, savedSession.id).catch(() => undefined);
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
    if ((!session && !localSource) || !status.isLoaded) {
      setError('The source preview is still loading. Try again in a moment.');
      return;
    }
    setError('');
    const playback = ++playbackId.current;
    const mode = renderedPreview ? 'rendered' : 'source';
    const attempt: PreviewPlayback = {
      sourceKey: `${activeSourceKey}:${mode}`,
      mode,
      startMs,
      endMs,
    };
    const seekTo = mode === 'rendered' ? 0 : startMs / 1000;
    void player.seekTo(seekTo).then(() => {
      if (playback !== playbackId.current || (!sessionRef.current && !localSourceRef.current)) return;
      player.play();
      setActivePlayback(attempt);
    }).catch(() => {
      if (playback === playbackId.current) setError('The preview could not seek to this selection. Try moving a handle slightly.');
    });
  };

  const changeRange = (start: number, end: number) => {
    stopPreview();
    if (phase === 'rendered') {
      setPhase('ready');
      setCurrentLocalRender(null);
    }
    setStartMs(start);
    setEndMs(end);
  };

  const adjust = (handle: 'start' | 'end', delta: number) => {
    const durationMs = localSource?.durationMs ?? session?.durationMs ?? 0;
    if (!durationMs) return;
    if (handle === 'start') {
      const next = Math.max(Math.max(0, endMs - MAX_CLIP_MS), Math.min(endMs - Math.min(100, durationMs), startMs + delta));
      changeRange(next, endMs);
    } else {
      const next = Math.max(startMs + Math.min(100, durationMs), Math.min(Math.min(durationMs, startMs + MAX_CLIP_MS), endMs + delta));
      changeRange(startMs, next);
    }
  };

  const activeDuration = localSource?.durationMs ?? session?.durationMs ?? null;
  const activeTitle = localSource?.title ?? session?.title ?? null;
  const activePeaks = localSource?.peaks ?? session?.peaks ?? [];
  const activeSourceKey = localSource?.id ?? session?.id ?? null;
  const renderedPreview = phase === 'rendered' || phase === 'saving';
  const previewSourceKey = activeSourceKey ? `${activeSourceKey}:${renderedPreview ? 'rendered' : 'source'}` : '';
  const playbackPosition = activePlayback && activeDuration !== null
    ? getPlaybackPosition({
      sourceKey: activePlayback.sourceKey,
      activeSourceKey: previewSourceKey,
      currentTimeSeconds: status.currentTime,
      isLoaded: status.isLoaded,
      playing: status.playing,
      didJustFinish: status.didJustFinish,
      error: status.error,
      mode: activePlayback.mode,
      startMs,
      endMs,
      playbackStartMs: activePlayback.startMs,
      playbackEndMs: activePlayback.endMs,
    })
    : null;
  const sourceReady = !!activeDuration && ['ready', 'rendering', 'rendered', 'saving'].includes(phase);
  const renderable = !!(session || localSource) && phase === 'ready' && !busy;
  const playback = status.playing;

  return (
    <KeyboardAvoidingView style={styles.page} behavior="padding">
      <ScrollView
        ref={scrollRef}
        style={styles.editorScroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onLayout={keyboardReveal.onViewportLayout}
        onScroll={keyboardReveal.onScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.topline}>
          <View style={styles.headingGroup}>
            <Text style={styles.eyebrow}>LOCAL CLIPS</Text>
            <Text style={styles.heading}>Make a sound</Text>
          </View>
          <Pressable accessibilityRole="button" disabled={selectingFile} onPress={onOpenLibrary} style={[styles.libraryLink, selectingFile && styles.disabled]}>
            <Text style={styles.libraryLinkText}>LIBRARY ↗</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>DEVICE AUDIO · PRIVATE TO THIS APP</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose an audio file from this device to trim"
            accessibilityState={{ disabled: busy || selectingFile, busy: selectingFile }}
            disabled={busy || selectingFile}
            onPress={() => void chooseDeviceFile()}
            style={[styles.deviceButton, (busy || selectingFile) && styles.disabled]}
          >
            {selectingFile ? <ActivityIndicator color="#d6ffed" /> : <Text style={styles.deviceButtonText}>CHOOSE AUDIO FILE</Text>}
          </Pressable>
          <Text style={styles.importHelp}>Choose MP3, M4A, WAV, or AAC up to 5 minutes and 32 MB. The original stays on this device.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>YOUTUBE LINK</Text>
          <TextInput
            ref={videoUrlInput}
            value={videoUrl}
            onChangeText={setVideoUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://youtu.be/…"
            placeholderTextColor="#737d86"
            editable={!busy && !selectingFile}
            accessibilityLabel="YouTube video link"
            onFocus={() => { if (videoUrlInput.current) keyboardReveal.onFocus(videoUrlInput.current); }}
            onBlur={() => { if (videoUrlInput.current) keyboardReveal.onBlur(videoUrlInput.current); }}
            style={styles.input}
          />
          <Pressable accessibilityRole="button" accessibilityLabel={privateYoutubeRelease ? 'Load YouTube audio on this device' : 'Load preview'} disabled={!videoUrl.trim() || busy || selectingFile} onPress={() => void (privateYoutubeRelease ? loadYoutubeOnDevice() : submitUrl())} style={[styles.primary, (!videoUrl.trim() || busy || selectingFile) && styles.disabled]}>
            {privateYoutubeRelease ? loadingOnDeviceYoutube
              ? <ActivityIndicator color="#12221d" />
              : <Text style={styles.primaryText}>LOAD AUDIO</Text>
              : busy && phase === 'fetching'
                ? <ActivityIndicator color="#12221d" />
                : <Text style={styles.primaryText}>LOAD PREVIEW</Text>}
          </Pressable>
          {!privateYoutubeRelease && isOnDeviceYoutubeAvailable() ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Load YouTube audio on this device, prototype" accessibilityState={{ disabled: !videoUrl.trim() || busy || selectingFile, busy: loadingOnDeviceYoutube }} disabled={!videoUrl.trim() || busy || selectingFile} onPress={() => void loadYoutubeOnDevice()} style={[styles.deviceYoutubeButton, (!videoUrl.trim() || busy || selectingFile) && styles.disabled]}>
              {loadingOnDeviceYoutube ? <ActivityIndicator color="#d6ffed" /> : <Text style={styles.deviceYoutubeButtonText}>LOAD ON DEVICE · PROTOTYPE</Text>}
            </Pressable>
          ) : null}
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, (selectingFile || phase === 'fetching' || phase === 'rendering' || phase === 'saving') && styles.statusBusy]} />
          <Text style={styles.statusText}>{selectingFile ? loadingOnDeviceYoutube ? 'Loading YouTube audio on this device…' : 'Preparing audio from this device…' : PHASE_LABEL[phase]}</Text>
        </View>

        {sourceReady && activeDuration !== null ? (
          <View style={styles.card}>
            <View style={styles.sourceRow}>
              <View style={styles.sourceCopy}>
                <Text style={styles.label}>{phase === 'rendered' || phase === 'saving' ? 'RENDERED CLIP' : localSource ? 'DEVICE FILE' : 'SOURCE PREVIEW'}</Text>
                <Text numberOfLines={2} style={styles.sourceTitle}>{activeTitle || 'YouTube audio'}</Text>
                <Text style={styles.muted}>{phase === 'rendered' || phase === 'saving'
                  ? `${formatTime(endMs - startMs)} selection · ${localSource ? 'rendered on this device' : 'streams from your service'}`
                  : `${formatTime(activeDuration)} total · ${localSource ? 'source stays on this device' : 'streams from your service'}`}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={playback ? 'Stop audio preview' : 'Preview selected audio'} disabled={!status.isLoaded || selectingFile || busy} onPress={playback ? stopPreview : previewSelection} style={styles.playButton}>
                <Text style={styles.playButtonText}>{playback ? 'STOP' : status.isLoaded ? 'PREVIEW' : '…'}</Text>
              </Pressable>
            </View>
          <WaveformRange peaks={activePeaks} durationMs={activeDuration} startMs={startMs} endMs={endMs} onChange={changeRange} playback={playbackPosition} disabled={busy || selectingFile} />
            <View style={styles.adjustGroup}>
              <View style={styles.adjustRow}>
                <Text style={styles.adjustLabel}>START</Text>
                <Text style={styles.adjustValue}>{formatTime(startMs)}</Text>
                <AdjustButton disabled={busy || selectingFile} handle="start" label="−1s" onPress={() => adjust('start', -1000)} />
                <AdjustButton disabled={busy || selectingFile} handle="start" label="−100ms" onPress={() => adjust('start', -100)} />
                <AdjustButton disabled={busy || selectingFile} handle="start" label="+100ms" onPress={() => adjust('start', 100)} />
                <AdjustButton disabled={busy || selectingFile} handle="start" label="+1s" onPress={() => adjust('start', 1000)} />
              </View>
              <View style={styles.adjustRow}>
                <Text style={styles.adjustLabel}>END</Text>
                <Text style={styles.adjustValue}>{formatTime(endMs)}</Text>
                <AdjustButton disabled={busy || selectingFile} handle="end" label="−1s" onPress={() => adjust('end', -1000)} />
                <AdjustButton disabled={busy || selectingFile} handle="end" label="−100ms" onPress={() => adjust('end', -100)} />
                <AdjustButton disabled={busy || selectingFile} handle="end" label="+100ms" onPress={() => adjust('end', 100)} />
                <AdjustButton disabled={busy || selectingFile} handle="end" label="+1s" onPress={() => adjust('end', 1000)} />
              </View>
            </View>
            <Text style={styles.selectionNote}>{formatTime(endMs - startMs)} selection · up to 60 seconds</Text>
            {phase === 'ready' || phase === 'rendered' ? (
              <View style={styles.nameField}>
                <Text style={styles.label}>SOUNDBITE NAME</Text>
                <TextInput
                  ref={titleInput}
                  value={title}
                  onChangeText={(value) => { titleEdited.current = true; setTitle(value); setError(''); }}
                  maxLength={100}
                  autoCapitalize="sentences"
                  autoCorrect={false}
                  returnKeyType="done"
                  placeholder="Give this soundbite a name"
                  placeholderTextColor="#737d86"
                  accessibilityLabel="Soundbite name, required to save"
                  editable={!selectingFile}
                  onFocus={() => { if (titleInput.current) keyboardReveal.onFocus(titleInput.current); }}
                  onBlur={() => { if (titleInput.current) keyboardReveal.onBlur(titleInput.current); }}
                  onSubmitEditing={() => Keyboard.dismiss()}
                  style={styles.nameInput}
                />
                <View style={styles.nameMeta}>
                  <Text style={[styles.nameHint, !title.trim() && styles.nameRequired]}>{title.trim() ? 'Used as the name in your library.' : 'A name is required before saving.'}</Text>
                  <Text style={styles.characterCount}>{title.length}/100</Text>
                </View>
              </View>
            ) : null}
            {phase === 'rendered' ? (
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" accessibilityLabel="Play rendered selection" disabled={selectingFile || busy} onPress={previewSelection} style={styles.secondary}><Text style={styles.secondaryText}>PLAY SELECTION</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || selectingFile || !title.trim() }} disabled={busy || selectingFile || !title.trim()} onPress={() => void saveRendered()} style={[styles.primary, styles.actionPrimary, (busy || selectingFile || !title.trim()) && styles.disabled]}>
                  {busy ? <ActivityIndicator color="#12221d" /> : <Text style={styles.primaryText}>SAVE OFFLINE</Text>}
                </Pressable>
              </View>
            ) : (
              <Pressable accessibilityRole="button" disabled={!renderable || selectingFile} onPress={() => void submitRender()} style={[styles.primary, (!renderable || selectingFile) && styles.disabled]}>
                {busy && phase === 'rendering' ? <ActivityIndicator color="#12221d" /> : <Text style={styles.primaryText}>RENDER SELECTION</Text>}
              </Pressable>
            )}
          </View>
        ) : null}

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.success}>{notice} <Pressable onPress={onOpenLibrary}><Text style={styles.inlineLink}>Open library</Text></Pressable></Text> : null}
        {selectingFile ? (
          <Pressable accessibilityRole="button" accessibilityLabel={loadingOnDeviceYoutube ? 'Cancel on-device YouTube loading' : 'Cancel preparing the selected file'} onPress={cancelPicker} style={styles.cancel}><Text style={styles.cancelText}>{loadingOnDeviceYoutube ? 'CANCEL LOAD' : 'CANCEL FILE PICKER'}</Text></Pressable>
        ) : session || localSource || busy ? <Pressable accessibilityRole="button" onPress={abandon} style={styles.cancel}><Text style={styles.cancelText}>{busy ? 'CANCEL' : 'CANCEL SESSION'}</Text></Pressable> : null}
        <Text style={styles.privacy}>Saved clips stay in this app’s private storage. Uninstalling the app removes them.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AdjustButton({ label, handle, onPress, disabled }: { label: string; handle: 'start' | 'end'; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Adjust ${handle} by ${label}`} disabled={disabled} onPress={onPress} style={[styles.adjustButton, disabled && styles.disabled]}><Text style={styles.adjustButtonText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#14161a' },
  editorScroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 36, gap: 14 },
  topline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 3 },
  headingGroup: { gap: 3 },
  eyebrow: { color: '#67d9b2', letterSpacing: 2.1, fontSize: 10, fontWeight: '700' },
  heading: { color: '#f5f6f8', fontWeight: '700', fontSize: 27, letterSpacing: -0.5 },
  libraryLink: { padding: 9, borderWidth: 1, borderColor: '#394149', borderRadius: 10 },
  libraryLinkText: { color: '#b9c2c8', fontSize: 10, letterSpacing: 1.1, fontWeight: '700' },
  card: { backgroundColor: '#1a1e23', borderRadius: 18, borderWidth: 1, borderColor: '#262d32', padding: 16, gap: 12 },
  deviceButton: { minHeight: 50, borderRadius: 12, backgroundColor: '#315747', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  deviceButtonText: { color: '#d6ffed', fontSize: 11, letterSpacing: 1.1, fontWeight: '800' },
  importHelp: { color: '#91a49b', fontSize: 10, lineHeight: 15, textAlign: 'center' },
  deviceYoutubeButton: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: '#497361', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  deviceYoutubeButtonText: { color: '#b0f5dc', fontSize: 10, letterSpacing: 1, fontWeight: '800' },
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
  nameField: { gap: 7, marginTop: 3 },
  nameInput: { minHeight: 48, paddingHorizontal: 13, borderRadius: 11, borderWidth: 1, borderColor: '#343c43', backgroundColor: '#111418', color: '#f1f4f5', fontSize: 14 },
  nameMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  nameHint: { color: '#829097', fontSize: 10, flex: 1 },
  nameRequired: { color: '#f0ad75' },
  characterCount: { color: '#78848a', fontSize: 10, fontVariant: ['tabular-nums'] },
  error: { color: '#ff8c9a', fontSize: 13, lineHeight: 19, backgroundColor: '#341d24', borderRadius: 10, padding: 12 },
  success: { color: '#91e9c8', fontSize: 13, lineHeight: 20, backgroundColor: '#17352c', borderRadius: 10, padding: 12 },
  inlineLink: { color: '#b0f5dc', fontWeight: '700', textDecorationLine: 'underline' },
  cancel: { paddingVertical: 10, alignItems: 'center' },
  cancelText: { color: '#858f95', fontSize: 10, letterSpacing: 1.4, fontWeight: '700' },
  privacy: { color: '#68737a', fontSize: 11, textAlign: 'center', lineHeight: 17, marginTop: 3, paddingHorizontal: 12 },
});
